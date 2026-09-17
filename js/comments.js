// Comment section, mounted per video/VOD page (see js/watch.js). One flat
// Firestore collection ("comments") for every video on the site, filtered
// by videoId per mount -- matches the security rules deployed for this
// project (char limit, no links, delete restricted to the comment's own
// author or the OWNER_EMAIL account from js/firebase-config.js).
import { auth, db, isOwner, onAuthChange } from "./auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const MAX_LENGTH = 500;
const LINK_PATTERN = /(https?:\/\/|www\.)/i;

// Starting list -- not exhaustive, just common German/English profanity.
// Extend directly in this file (plain GitHub web-UI edit, no secret/redeploy
// needed) if more words should be caught. Word-boundary matched, case
// insensitive; censors to "first letter + asterisks" (e.g. "b****").
const BAD_WORDS = [
  "bastard", "arschloch", "hurensohn", "wichser", "fotze", "nutte", "schlampe",
  "scheisse", "scheiße", "hure", "missgeburt", "spast", "spasti",
  "fuck", "fucking", "shit", "bitch", "asshole", "cunt", "whore", "slut", "faggot", "nigger",
];
function censor(text) {
  let out = text;
  for (const word of BAD_WORDS) {
    const re = new RegExp(`\\b${word}\\w*`, "gi");
    out = out.replace(re, (m) => m[0] + "*".repeat(Math.max(1, m.length - 1)));
  }
  return out;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatTimestamp(ts) {
  if (!ts) return "gerade eben";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ts.toDate());
  } catch {
    return "";
  }
}

function trashIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
}

let unsubscribe = null;
let allComments = [];
let currentVideoId = null;

function replyFormHTML(parentId) {
  return `
  <form class="comment-form comment-form--reply" data-parent-id="${parentId}">
    <textarea placeholder="Antworten..." maxlength="${MAX_LENGTH}" required></textarea>
    <div class="comment-form-row">
      <button type="submit" class="p-btn rip btn-accent">Antworten</button>
      <button type="button" class="comment-cancel-reply">Abbrechen</button>
    </div>
    <p class="comment-form-error"></p>
  </form>`;
}

function commentHTML(c, replies) {
  const user = auth.currentUser;
  const canDelete = !!user && (user.uid === c.authorId || isOwner(user));
  return `
  <div class="comment" data-comment-id="${c.id}">
    <div class="comment-head">
      <span class="comment-author">${escapeHTML(c.authorName || "Anonym")}</span>
      <span class="comment-time">${formatTimestamp(c.createdAt)}</span>
    </div>
    <p class="comment-text">${escapeHTML(c.text)}</p>
    <div class="comment-actions">
      <button type="button" class="comment-reply-btn" data-reply-to="${c.id}">Antworten</button>
      ${canDelete ? `<button type="button" class="comment-delete-btn" data-delete-id="${c.id}">${trashIcon()}Löschen</button>` : ""}
    </div>
    <div class="comment-reply-slot" id="reply-slot-${c.id}"></div>
    ${
      replies.length
        ? `<div class="comment-replies">${replies.map((r) => replyHTML(r)).join("")}</div>`
        : ""
    }
  </div>`;
}

function replyHTML(c) {
  const user = auth.currentUser;
  const canDelete = !!user && (user.uid === c.authorId || isOwner(user));
  return `
  <div class="comment comment--reply" data-comment-id="${c.id}">
    <div class="comment-head">
      <span class="comment-author">${escapeHTML(c.authorName || "Anonym")}</span>
      <span class="comment-time">${formatTimestamp(c.createdAt)}</span>
    </div>
    <p class="comment-text">${escapeHTML(c.text)}</p>
    ${canDelete ? `<div class="comment-actions"><button type="button" class="comment-delete-btn" data-delete-id="${c.id}">${trashIcon()}Löschen</button></div>` : ""}
  </div>`;
}

function render() {
  const list = document.getElementById("comments-list");
  const countEl = document.getElementById("comments-count");
  if (!list) return;

  const top = allComments.filter((c) => !c.parentId);
  const byParent = new Map();
  for (const c of allComments) {
    if (!c.parentId) continue;
    if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
    byParent.get(c.parentId).push(c);
  }

  if (countEl) countEl.textContent = allComments.length ? `(${allComments.length})` : "";

  if (!top.length) {
    list.innerHTML = `<p class="comments-empty">Noch keine Kommentare. Schreib den ersten!</p>`;
    return;
  }
  list.innerHTML = top.map((c) => commentHTML(c, byParent.get(c.id) || [])).join("");
  wireCommentActions(list);
}

function wireCommentActions(root) {
  root.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Kommentar wirklich löschen?")) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "comments", btn.dataset.deleteId));
      } catch (err) {
        console.error("Delete comment failed:", err);
        btn.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-reply-to]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = document.getElementById(`reply-slot-${btn.dataset.replyTo}`);
      if (!slot) return;
      if (slot.innerHTML) {
        slot.innerHTML = "";
        return;
      }
      slot.innerHTML = replyFormHTML(btn.dataset.replyTo);
      wireForm(slot.querySelector("form"));
      slot.querySelector("textarea")?.focus();
      slot.querySelector(".comment-cancel-reply")?.addEventListener("click", () => {
        slot.innerHTML = "";
      });
    });
  });
}

function loginPromptHTML() {
  return `<p class="comments-login-prompt">Melde dich an, um zu kommentieren. <button type="button" class="p-btn rip" id="comments-login-btn">Anmelden</button></p>`;
}

function wireForm(form) {
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const textarea = form.querySelector("textarea");
    const errorEl = form.querySelector(".comment-form-error");
    const submitBtn = form.querySelector('button[type="submit"]');
    const text = textarea.value.trim();
    errorEl.textContent = "";

    if (!text) return;
    if (text.length > MAX_LENGTH) {
      errorEl.textContent = `Maximal ${MAX_LENGTH} Zeichen.`;
      return;
    }
    if (LINK_PATTERN.test(text)) {
      errorEl.textContent = "Links sind in Kommentaren nicht erlaubt.";
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      errorEl.textContent = "Bitte zuerst anmelden.";
      return;
    }

    submitBtn.disabled = true;
    try {
      await addDoc(collection(db, "comments"), {
        videoId: currentVideoId,
        parentId: form.dataset.parentId || null,
        authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Anonym",
        text: censor(text),
        createdAt: serverTimestamp(),
      });
      textarea.value = "";
      if (form.dataset.parentId) form.closest(".comment-reply-slot").innerHTML = "";
    } catch (err) {
      console.error("Post comment failed:", err);
      errorEl.textContent = "Kommentar konnte nicht gespeichert werden.";
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function renderFormArea(user) {
  const area = document.getElementById("comments-form-area");
  if (!area) return;
  if (!user) {
    area.innerHTML = loginPromptHTML();
    area.querySelector("#comments-login-btn")?.addEventListener("click", async () => {
      const { openAuthModal } = await import("./auth-ui.js");
      openAuthModal();
    });
    return;
  }
  area.innerHTML = `
  <form class="comment-form" id="comment-new-form">
    <textarea placeholder="Was denkst du?" maxlength="${MAX_LENGTH}" required></textarea>
    <div class="comment-form-row">
      <button type="submit" class="p-btn rip btn-accent">Kommentieren</button>
    </div>
    <p class="comment-form-error"></p>
  </form>`;
  wireForm(area.querySelector("#comment-new-form"));
}

// Mounted once per watch page (see js/watch.js). #comments-root's markup
// (count/list/form-area ids) is created here rather than expected as static
// HTML, so watch/index.html only needs one empty container div.
export function mountComments(videoId) {
  const root = document.getElementById("comments-root");
  if (!root) return;
  currentVideoId = videoId;
  root.innerHTML = `
    <h2 class="yt-section-title">Kommentare <span id="comments-count"></span></h2>
    <div id="comments-form-area"></div>
    <div class="comment-list" id="comments-list"><p class="comments-empty">Lade Kommentare...</p></div>`;

  onAuthChange((user) => {
    renderFormArea(user);
    render(); // re-render so delete buttons reflect the current user
  });

  unsubscribe?.();
  const q = query(collection(db, "comments"), where("videoId", "==", videoId), orderBy("createdAt", "asc"));
  unsubscribe = onSnapshot(
    q,
    (snap) => {
      allComments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error("Comments listener failed:", err);
      const list = document.getElementById("comments-list");
      if (list) list.innerHTML = `<p class="comments-empty">Kommentare konnten nicht geladen werden.</p>`;
    }
  );
}

export function unmountComments() {
  unsubscribe?.();
  unsubscribe = null;
  allComments = [];
  currentVideoId = null;
}
