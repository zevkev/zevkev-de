// Comment section, mounted per video/VOD page (see js/watch.js). Loads once
// per page view (a single getDocs() call, not a live onSnapshot listener --
// deliberately, to keep Firestore reads minimal on the free plan) and then
// updates its own local copy optimistically after every post/edit/delete/
// report instead of re-querying, so a full comment thread costs exactly one
// read no matter how much someone does on the page.
import { auth, db, isOwner, canPost, onAuthChange, resendVerificationEmail, refreshUser, parseAvatarPrefs, avatarColorFor, AVATAR_ICONS } from "./auth.js";
import { isBanned } from "./user-data.js";
import { trackEvent } from "./track.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
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
// Extra words added live via /privat/'s "Wörter" tab (settings/moderation
// doc) on top of the baseline list above -- fetched once per page mount
// (see mountComments), same "minimal reads" convention as the rest of this
// file. Falls back to just the baseline list if the read fails/is empty,
// never blocks comments from loading over this.
let extraBannedWords = [];
function censor(text) {
  let out = text;
  for (const word of [...BAD_WORDS, ...extraBannedWords]) {
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
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}

function trashIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
}
function flagIcon() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V4a1 1 0 0 1 1-1h13l-3 6 3 6H6a1 1 0 0 0-1 1v5"/></svg>`;
}
// Badge next to the owner's own name in comments, so visitors can tell it's
// really him and not a copycat username -- denormalized onto the comment
// doc at post time (authorIsOwner, see postComment) same as authorName/
// authorAvatarColor, since a comment card can never look up another
// visitor's live Auth profile from the client.
function verifiedBadge() {
  return `<svg class="comment-verified" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><title>Verifizierter Kanal-Account</title><path d="M12 1.5 14.6 4l3.5-.9.9 3.5L22.5 8 21 11l1.5 3-3.5 1.4-.9 3.5-3.5-.9L12 20.5 9.4 18l-3.5.9-.9-3.5L1.5 14 3 11 1.5 8 5 6.6l.9-3.5L9.4 4Z"/><path d="M8.5 12.2 10.8 14.5 15.5 9.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

let allComments = []; // flat list; each item may carry a client-only _editing/_reported flag
let currentVideoId = null;
let reportedIds = new Set(); // this-session only, prevents double-reporting without another read

function replyFormHTML(parentId, replyingToName) {
  return `
  <form class="comment-form comment-form--reply" data-parent-id="${parentId}">
    <textarea placeholder="${replyingToName ? `Antwort an ${escapeHTML(replyingToName)}...` : "Antworten..."}" maxlength="${MAX_LENGTH}" required></textarea>
    <div class="comment-form-row">
      <button type="submit" class="p-btn rip btn-accent">Antworten</button>
      <button type="button" class="comment-cancel-reply">Abbrechen</button>
    </div>
    <p class="comment-form-error"></p>
  </form>`;
}

function editFormHTML(id, currentText) {
  return `
  <form class="comment-form comment-form--edit" data-edit-id="${id}">
    <textarea maxlength="${MAX_LENGTH}" required>${escapeHTML(currentText)}</textarea>
    <div class="comment-form-row">
      <button type="submit" class="p-btn rip btn-accent">Speichern</button>
      <button type="button" class="comment-cancel-edit">Abbrechen</button>
    </div>
    <p class="comment-form-error"></p>
  </form>`;
}

function actionsHTML(c, isReply) {
  const user = auth.currentUser;
  const isMine = !!user && user.uid === c.authorId;
  const canDelete = isMine || isOwner(user);
  const canReport = !!user && !isMine && !reportedIds.has(c.id);
  const parts = [];
  parts.push(`<button type="button" class="comment-reply-btn" data-reply-to="${c.id}">Antworten</button>`);
  if (isMine) parts.push(`<button type="button" class="comment-edit-btn" data-edit-id="${c.id}">Bearbeiten</button>`);
  if (canDelete) parts.push(`<button type="button" class="comment-delete-btn" data-delete-id="${c.id}">${trashIcon()}Löschen</button>`);
  if (canReport) parts.push(`<button type="button" class="comment-report-btn" data-report-id="${c.id}">${flagIcon()}Melden</button>`);
  if (reportedIds.has(c.id)) parts.push(`<span class="comment-reported-note">Gemeldet</span>`);
  return parts.join("");
}

// Older comments (posted before authorAvatarColor/authorAvatarIcon existed)
// fall back to the same uid-hash color every other unset-avatar visitor
// gets, so they still render a sensible circle instead of a missing/blank
// one -- never a Firestore lookup, see postComment's own comment on why.
function commentAvatarHTML(c) {
  const color = c.authorAvatarColor || avatarColorFor(c.authorId || "");
  const iconPath = c.authorAvatarIcon && AVATAR_ICONS[c.authorAvatarIcon];
  const inner = iconPath
    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${iconPath}</svg>`
    : escapeHTML((c.authorName || "?").trim().charAt(0).toUpperCase() || "?");
  return `<span class="comment-avatar" style="background:${color}">${inner}</span>`;
}

function commentBodyHTML(c) {
  return `
    <div class="comment-head">
      ${commentAvatarHTML(c)}
      ${
        c.authorName
          ? `<a class="comment-author" href="/profil/?u=${encodeURIComponent(c.authorName)}">${escapeHTML(c.authorName)}</a>`
          : `<span class="comment-author">Anonym</span>`
      }
      ${c.authorIsOwner ? verifiedBadge() : ""}
      <span class="comment-time">${formatTimestamp(c.createdAt)}</span>
      ${c.editedAt ? `<span class="comment-edited-note">(bearbeitet)</span>` : ""}
    </div>
    <p class="comment-text">${escapeHTML(c.text)}</p>
    <div class="comment-actions">${actionsHTML(c, !!c.parentId)}</div>
    <div class="comment-inline-slot" id="inline-slot-${c.id}"></div>`;
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
  list.innerHTML = top
    .map((c) => {
      const replies = byParent.get(c.id) || [];
      return `
      <div class="comment" data-comment-id="${c.id}">${commentBodyHTML(c)}</div>
      ${replies.length ? `<div class="comment-replies">${replies.map((r) => `<div class="comment comment--reply" data-comment-id="${r.id}">${commentBodyHTML(r)}</div>`).join("")}</div>` : ""}`;
    })
    .join("");
  wireCommentActions(list);
}

function findComment(id) {
  return allComments.find((c) => c.id === id);
}
// Flattens reply-to-reply into one level: replying to something that's
// already a reply attaches the new comment to THAT reply's own parent (the
// original top-level comment), same as YouTube's own flattened threads,
// rather than building ever-deeper nesting that both the data model and the
// UI would need real recursion for.
function topLevelParentId(id) {
  const c = findComment(id);
  return c?.parentId || id;
}

function wireCommentActions(root) {
  root.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Kommentar wirklich löschen?")) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "comments", btn.dataset.deleteId));
        allComments = allComments.filter((c) => c.id !== btn.dataset.deleteId && c.parentId !== btn.dataset.deleteId);
        render();
      } catch (err) {
        console.error("Delete comment failed:", err);
        btn.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-report-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.reportId;
      btn.disabled = true;
      try {
        await addDoc(collection(db, "reports"), {
          commentId: id,
          videoId: currentVideoId,
          reporterId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
        reportedIds.add(id);
        render();
        trackEvent("comment_report", { event_category: "engagement", event_label: currentVideoId });
      } catch (err) {
        console.error("Report comment failed:", err);
        btn.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = findComment(btn.dataset.editId);
      const slot = document.getElementById(`inline-slot-${btn.dataset.editId}`);
      if (!slot || !c) return;
      if (slot.innerHTML) {
        slot.innerHTML = "";
        return;
      }
      slot.innerHTML = editFormHTML(c.id, c.text);
      const form = slot.querySelector("form");
      wireEditForm(form);
      slot.querySelector("textarea")?.focus();
      slot.querySelector(".comment-cancel-edit")?.addEventListener("click", () => {
        slot.innerHTML = "";
      });
    });
  });

  root.querySelectorAll("[data-reply-to]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = findComment(btn.dataset.replyTo);
      const slot = document.getElementById(`inline-slot-${btn.dataset.replyTo}`);
      if (!slot || !target) return;
      if (slot.innerHTML) {
        slot.innerHTML = "";
        return;
      }
      const parentId = topLevelParentId(target.id);
      slot.innerHTML = replyFormHTML(parentId, target.parentId ? target.authorName : null);
      wireReplyForm(slot.querySelector("form"), target);
      slot.querySelector("textarea")?.focus();
      slot.querySelector(".comment-cancel-reply")?.addEventListener("click", () => {
        slot.innerHTML = "";
      });
    });
  });
}

function wireEditForm(form) {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const textarea = form.querySelector("textarea");
    const errorEl = form.querySelector(".comment-form-error");
    const submitBtn = form.querySelector('button[type="submit"]');
    const text = textarea.value.trim();
    errorEl.textContent = "";
    const validationError = validateText(text);
    if (validationError) {
      errorEl.textContent = validationError;
      return;
    }
    submitBtn.disabled = true;
    try {
      const finalText = censor(text);
      await updateDoc(doc(db, "comments", form.dataset.editId), { text: finalText, editedAt: serverTimestamp() });
      const c = findComment(form.dataset.editId);
      if (c) {
        c.text = finalText;
        c.editedAt = Date.now();
      }
      render();
    } catch (err) {
      console.error("Edit comment failed:", err);
      errorEl.textContent = "Konnte nicht gespeichert werden.";
      submitBtn.disabled = false;
    }
  });
}

function wireReplyForm(form, target) {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const textarea = form.querySelector("textarea");
    const errorEl = form.querySelector(".comment-form-error");
    const submitBtn = form.querySelector('button[type="submit"]');
    let text = textarea.value.trim();
    errorEl.textContent = "";
    const validationError = validateText(text);
    if (validationError) {
      errorEl.textContent = validationError;
      return;
    }
    if (target.parentId) text = `@${target.authorName} ${text}`;
    submitBtn.disabled = true;
    const posted = await postComment(text, form.dataset.parentId);
    if (posted) form.closest(".comment-inline-slot").innerHTML = "";
    else {
      errorEl.textContent = "Konnte nicht gespeichert werden.";
      submitBtn.disabled = false;
    }
  });
}

function validateText(text) {
  if (!text) return "Bitte etwas schreiben.";
  if (text.length > MAX_LENGTH) return `Maximal ${MAX_LENGTH} Zeichen.`;
  if (LINK_PATTERN.test(text)) return "Links sind in Kommentaren nicht erlaubt.";
  return null;
}

async function postComment(text, parentId) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const finalText = censor(text);
    // Avatar prefs are copied onto the comment at post time, same reasoning
    // as authorName already being copied rather than looked up live: there's
    // no way to fetch *another* visitor's Auth profile (photoURL) from the
    // client, so a comment card can only ever show what its own author had
    // set when they wrote it -- exactly like authorName already only ever
    // reflects the name at posting time, not any later rename.
    const prefs = parseAvatarPrefs(user);
    const authorIsOwner = isOwner(user);
    const ref = await addDoc(collection(db, "comments"), {
      videoId: currentVideoId,
      parentId: parentId || null,
      authorId: user.uid,
      authorName: user.displayName || user.email?.split("@")[0] || "Anonym",
      authorAvatarColor: prefs.color,
      authorAvatarIcon: prefs.icon,
      authorIsOwner,
      text: finalText,
      createdAt: serverTimestamp(),
    });
    allComments.push({
      id: ref.id,
      videoId: currentVideoId,
      parentId: parentId || null,
      authorId: user.uid,
      authorName: user.displayName || user.email?.split("@")[0] || "Anonym",
      authorAvatarColor: prefs.color,
      authorAvatarIcon: prefs.icon,
      authorIsOwner,
      text: finalText,
      createdAt: Date.now(),
    });
    render();
    trackEvent(parentId ? "comment_reply" : "comment_post", { event_category: "engagement", event_label: currentVideoId });
    return true;
  } catch (err) {
    console.error("Post comment failed:", err);
    return false;
  }
}

function unverifiedPromptHTML() {
  return `<p class="comments-login-prompt">Bitte bestätige deine E-Mail-Adresse, um zu kommentieren (Link auch im Spam-Ordner prüfen). <button type="button" class="p-btn rip" id="comments-recheck-btn">Ich habe bestätigt</button> <button type="button" class="p-btn rip" id="comments-resend-btn">E-Mail erneut senden</button></p>`;
}
function loginPromptHTML() {
  return `<p class="comments-login-prompt">Melde dich an, um zu kommentieren. <button type="button" class="p-btn rip" id="comments-login-btn">Anmelden</button></p>`;
}
function bannedPromptHTML() {
  return `<p class="comments-login-prompt">Dein Konto wurde für Kommentare gesperrt.</p>`;
}

async function renderFormArea(user) {
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
  // Checked before the (synchronous) verified-email gate below so a banned
  // account sees the actual reason rather than being told to verify an
  // already-verified email. Firestore rules independently reject the write
  // too (see /privat/'s Nutzer tab) -- this is just the honest UI message.
  if (await isBanned()) {
    area.innerHTML = bannedPromptHTML();
    return;
  }
  if (!canPost(user)) {
    area.innerHTML = unverifiedPromptHTML();
    area.querySelector("#comments-recheck-btn")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      const original = ev.target.textContent;
      ev.target.textContent = "Prüfe...";
      const fresh = await refreshUser();
      if (fresh && canPost(fresh)) {
        renderFormArea(fresh);
      } else {
        ev.target.disabled = false;
        ev.target.textContent = original;
      }
    });
    area.querySelector("#comments-resend-btn")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      ev.target.textContent = "Gesendet.";
      try {
        await resendVerificationEmail();
      } catch (err) {
        console.error("Resend verification failed:", err);
      }
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
  area.querySelector("#comment-new-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const textarea = area.querySelector("textarea");
    const errorEl = area.querySelector(".comment-form-error");
    const submitBtn = area.querySelector('button[type="submit"]');
    const text = textarea.value.trim();
    errorEl.textContent = "";
    const validationError = validateText(text);
    if (validationError) {
      errorEl.textContent = validationError;
      return;
    }
    submitBtn.disabled = true;
    const posted = await postComment(text, null);
    if (posted) textarea.value = "";
    else errorEl.textContent = "Konnte nicht gespeichert werden.";
    submitBtn.disabled = false;
  });
}

// Mounted once per watch page (see js/watch.js). A single getDocs() read on
// mount -- see the file header for why this isn't a live onSnapshot
// listener.
export async function mountComments(videoId) {
  const root = document.getElementById("comments-root");
  if (!root) return;
  currentVideoId = videoId;
  reportedIds = new Set();
  root.innerHTML = `
    <h2 class="yt-section-title">Kommentare <span id="comments-count"></span></h2>
    <div id="comments-form-area"></div>
    <div class="comment-list" id="comments-list"><p class="comments-empty">Lade Kommentare...</p></div>`;

  let autoRecheckDone = false;
  onAuthChange((user) => {
    renderFormArea(user);
    render(); // re-render so delete/edit/report controls reflect the current user
    // One silent auto-recheck per mount for a signed-in-but-unverified visitor
    // -- covers the common case of verifying in another tab/device and
    // coming straight back, without making them notice and click "Ich habe
    // bestätigt" themselves. Guarded to once so it can't loop or spam
    // Firebase if they're genuinely still unverified.
    if (user && !canPost(user) && !autoRecheckDone) {
      autoRecheckDone = true;
      refreshUser().then((fresh) => {
        if (fresh && canPost(fresh)) renderFormArea(fresh);
      });
    }
  });

  // Fire-and-forget, not awaited alongside the comments query below -- a
  // failed/slow settings read should never delay or block the comment
  // thread itself from rendering, it just means extraBannedWords stays
  // empty (baseline BAD_WORDS still applies) until it resolves.
  getDoc(doc(db, "settings", "moderation"))
    .then((snap) => {
      if (snap.exists() && Array.isArray(snap.data().bannedWords)) extraBannedWords = snap.data().bannedWords;
    })
    .catch(() => {});

  try {
    const q = query(collection(db, "comments"), where("videoId", "==", videoId), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    allComments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error("Loading comments failed:", err);
    const list = document.getElementById("comments-list");
    if (list) list.innerHTML = `<p class="comments-empty">Kommentare konnten nicht geladen werden.</p>`;
  }
}

export function unmountComments() {
  allComments = [];
  currentVideoId = null;
  reportedIds = new Set();
}
