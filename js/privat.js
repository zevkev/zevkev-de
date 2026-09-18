// Internal moderation panel (/privat/) -- lets ZevKev (and only ZevKev) see
// every reported comment plus a flat list of every comment site-wide, with a
// delete button on each. Not linked in the nav/sitemap; see the comment atop
// privat/index.html for the full access-control picture. A one-time getDocs()
// per collection on mount, same "minimal reads" reasoning as js/comments.js --
// this page is opened rarely (by one person), so there's no live listener to
// justify, but there's also no reason to re-fetch on every little action when
// local state can just be patched after each write.
import { auth, db, isOwner, onAuthChange, signOutUser } from "./auth.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Safety cap, not a real pagination limit -- this panel is for a small
// creator's comment volume, not designed to browse thousands of rows. If
// this is ever hit it just means "there's more than shown", not a bug.
const ROW_LIMIT = 300;

let reports = [];
let comments = [];

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}
function lockIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
}
function trashIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
}

// videoId is stored as "video:<id>" or "vod:<id>" (see js/watch.js's
// mountComments call) -- split back apart into a real link to that page.
function videoLinkHTML(videoId) {
  const [type, id] = String(videoId || "").split(":");
  if ((type === "video" || type === "vod") && id) {
    return `<a href="/${type}/${id}/" target="_blank" rel="noopener">Zum Video ↗</a>`;
  }
  return videoId ? escapeHTML(videoId) : "unbekannt";
}

function gateHTML(kind) {
  if (kind === "loggedOut") {
    return `
    <div class="empty-state notfound-state">
      <div class="notfound-icon">${lockIcon()}</div>
      <h2>Anmeldung erforderlich</h2>
      <p>Dieser Bereich ist nur für ZevKev.</p>
      <button type="button" class="p-btn rip btn-accent" id="privat-login-btn">Anmelden</button>
    </div>`;
  }
  return `
  <div class="empty-state notfound-state">
    <div class="notfound-icon">${lockIcon()}</div>
    <h2>Kein Zugriff</h2>
    <p>Dieser Bereich ist nur für den Website-Betreiber sichtbar.</p>
    <button type="button" class="p-btn rip" id="privat-switch-btn">Abmelden</button>
  </div>`;
}

function reportCardHTML(report, comment) {
  if (!comment) {
    return `
    <div class="comment">
      <div class="comment-head"><span class="comment-author">Kommentar bereits gelöscht</span><span class="comment-time">${formatTimestamp(report.createdAt)}</span></div>
      <div class="comment-actions"><button type="button" class="comment-delete-btn" data-dismiss-report="${report.id}">${trashIcon()}Meldung verwerfen</button></div>
    </div>`;
  }
  return `
  <div class="comment">
    <div class="comment-head">
      <span class="comment-author">${escapeHTML(comment.authorName || "Anonym")}</span>
      <span class="comment-time">${formatTimestamp(comment.createdAt)}</span>
    </div>
    <p class="comment-text">${escapeHTML(comment.text)}</p>
    <p class="privat-report-meta">${videoLinkHTML(comment.videoId)} · Gemeldet ${formatTimestamp(report.createdAt)}</p>
    <div class="comment-actions">
      <button type="button" class="comment-delete-btn" data-delete-comment="${comment.id}">${trashIcon()}Kommentar löschen</button>
      <button type="button" class="comment-reply-btn" data-dismiss-report="${report.id}">Meldung verwerfen</button>
    </div>
  </div>`;
}

function commentCardHTML(c) {
  return `
  <div class="comment">
    <div class="comment-head">
      <span class="comment-author">${escapeHTML(c.authorName || "Anonym")}</span>
      <span class="comment-time">${formatTimestamp(c.createdAt)}</span>
      ${c.parentId ? `<span class="comment-edited-note">Antwort</span>` : ""}
    </div>
    <p class="comment-text">${escapeHTML(c.text)}</p>
    <p class="privat-report-meta">${videoLinkHTML(c.videoId)}</p>
    <div class="comment-actions">
      <button type="button" class="comment-delete-btn" data-delete-comment="${c.id}">${trashIcon()}Löschen</button>
    </div>
  </div>`;
}

function render() {
  const commentsById = new Map(comments.map((c) => [c.id, c]));
  const reportsList = document.getElementById("privat-reports");
  const commentsList = document.getElementById("privat-comments");
  const reportsCount = document.getElementById("privat-reports-count");
  const commentsCount = document.getElementById("privat-comments-count");

  if (reportsCount) reportsCount.textContent = reports.length ? `(${reports.length})` : "";
  if (commentsCount) commentsCount.textContent = comments.length ? `(${comments.length})` : "";

  if (reportsList) {
    reportsList.innerHTML = reports.length
      ? reports.map((r) => reportCardHTML(r, commentsById.get(r.commentId))).join("")
      : `<p class="comments-empty">Keine offenen Meldungen.</p>`;
  }
  if (commentsList) {
    commentsList.innerHTML = comments.length
      ? comments.map((c) => commentCardHTML(c)).join("")
      : `<p class="comments-empty">Noch keine Kommentare.</p>`;
  }
  wireActions();
}

// Deletes the comment itself plus any reports pointing at it (those would
// otherwise dangle, permanently showing "Kommentar bereits gelöscht" for no
// reason) -- covers the case where more than one person reported the same
// comment.
async function deleteCommentEverywhere(commentId) {
  await deleteDoc(doc(db, "comments", commentId));
  const related = reports.filter((r) => r.commentId === commentId);
  await Promise.all(related.map((r) => deleteDoc(doc(db, "reports", r.id)).catch(() => {})));
  comments = comments.filter((c) => c.id !== commentId);
  reports = reports.filter((r) => r.commentId !== commentId);
}

function wireActions() {
  document.querySelectorAll("[data-delete-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Kommentar wirklich löschen?")) return;
      btn.disabled = true;
      try {
        await deleteCommentEverywhere(btn.dataset.deleteComment);
        render();
      } catch (err) {
        console.error("Delete comment failed:", err);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-dismiss-report]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const id = btn.dataset.dismissReport;
      try {
        await deleteDoc(doc(db, "reports", id));
        reports = reports.filter((r) => r.id !== id);
        render();
      } catch (err) {
        console.error("Dismiss report failed:", err);
        btn.disabled = false;
      }
    });
  });
}

async function loadData() {
  try {
    const [reportsSnap, commentsSnap] = await Promise.all([
      getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(ROW_LIMIT))),
      getDocs(query(collection(db, "comments"), orderBy("createdAt", "desc"), limit(ROW_LIMIT))),
    ]);
    reports = reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    comments = commentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error("Loading moderation data failed:", err);
    const commentsList = document.getElementById("privat-comments");
    if (commentsList) commentsList.innerHTML = `<p class="comments-empty">Konnte nicht geladen werden.</p>`;
  }
}

function showGate(kind) {
  document.getElementById("privat-app").style.display = "none";
  const gate = document.getElementById("privat-gate");
  gate.innerHTML = gateHTML(kind);
  gate.querySelector("#privat-login-btn")?.addEventListener("click", async () => {
    const { openAuthModal } = await import("./auth-ui.js");
    openAuthModal();
  });
  gate.querySelector("#privat-switch-btn")?.addEventListener("click", () => signOutUser());
}

let loadedForUid = null;

onAuthChange((user) => {
  if (!user) {
    loadedForUid = null;
    showGate("loggedOut");
    return;
  }
  if (!isOwner(user)) {
    loadedForUid = null;
    showGate("notOwner");
    return;
  }

  document.getElementById("privat-gate").innerHTML = "";
  document.getElementById("privat-app").style.display = "";
  const userEl = document.getElementById("privat-user");
  if (userEl) userEl.textContent = `Angemeldet als ${user.displayName || user.email}`;

  if (loadedForUid !== user.uid) {
    loadedForUid = user.uid;
    loadData();
  }
});

document.getElementById("privat-logout-btn")?.addEventListener("click", () => signOutUser());
