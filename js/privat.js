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
  setDoc,
  getDoc,
  doc,
  addDoc,
  where,
  serverTimestamp,
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

// Same .toast element/pattern as js/cart.js/js/comments.js -- duplicated
// rather than imported, same convention as this file's own icon functions.
// Used below for every moderation action whose catch block used to only
// log to the console with zero indication to the (one) person using this
// panel that anything went wrong.
function showToast(text) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("is-visible"), 2400);
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
        showToast("Kommentar konnte nicht gelöscht werden.");
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
        showToast("Meldung konnte nicht verworfen werden.");
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

// ---------- Tabs ----------
function wireTabs() {
  document.querySelectorAll(".privat-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".privat-tab").forEach((b) => b.classList.toggle("is-active", b === btn));
      document.querySelectorAll(".privat-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== btn.dataset.tab;
      });
    });
  });
}

// ---------- Users (list, ban, delete-data) ----------
let users = [];

function userRowHTML(u) {
  return `
  <div class="privat-user-row${u.banned ? " is-banned" : ""}">
    <div class="privat-user-info">
      <a href="/user/${encodeURIComponent(u.displayName || "")}/" target="_blank" rel="noopener">${escapeHTML(u.displayName || "(kein Name)")}</a>
      <span class="privat-user-email">${escapeHTML(u.email || u.id)}</span>
      ${u.banned ? `<span class="privat-user-badge">Gesperrt</span>` : ""}
    </div>
    <div class="privat-user-actions">
      <button type="button" class="p-btn rip" data-toggle-ban="${u.id}">${u.banned ? "Entsperren" : "Sperren"}</button>
      <button type="button" class="p-btn rip privat-danger-btn" data-delete-user="${u.id}">Löschen</button>
    </div>
  </div>`;
}

function renderUsers() {
  const list = document.getElementById("privat-users");
  const countEl = document.getElementById("privat-users-count");
  if (!list) return;
  if (countEl) countEl.textContent = users.length ? `(${users.length})` : "";
  list.innerHTML = users.length ? users.map(userRowHTML).join("") : `<p class="comments-empty">Keine Nutzer gefunden.</p>`;

  list.querySelectorAll("[data-toggle-ban]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleBan;
      const u = users.find((x) => x.id === id);
      if (!u) return;
      btn.disabled = true;
      try {
        await setDoc(doc(db, "users", id), { banned: !u.banned }, { merge: true });
        u.banned = !u.banned;
        renderUsers();
      } catch (err) {
        console.error("Toggling ban failed:", err);
        showToast("Sperre konnte nicht geändert werden.");
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteUser;
      const u = users.find((x) => x.id === id);
      if (!u) return;
      if (!confirm(`Kommentare, Username und Kontodaten von "${u.displayName || u.email}" wirklich dauerhaft löschen? Der Firebase-Login selbst bleibt bestehen (technisch nur vom Nutzer selbst löschbar).`)) return;
      btn.disabled = true;
      try {
        await deleteUserData(id, u.displayName);
        users = users.filter((x) => x.id !== id);
        renderUsers();
      } catch (err) {
        console.error("Deleting user data failed:", err);
        showToast("Nutzerdaten konnten nicht gelöscht werden.");
        btn.disabled = false;
      }
    });
  });
}

// Mirrors js/auth.js's own deleteAccount(), just triggered by the owner
// for a different uid instead of self-service -- same three collections,
// same reasoning (comments first, then the name reservation, then the
// private doc). Cannot touch the Firebase Auth credential itself; see the
// confirm() message above and the hint text in privat/index.html.
async function deleteUserData(uid, displayName) {
  const ownComments = await getDocs(query(collection(db, "comments"), where("authorId", "==", uid))).catch(() => null);
  if (ownComments) await Promise.all(ownComments.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  const normalized = String(displayName || "").trim().toLowerCase();
  if (normalized) await deleteDoc(doc(db, "usernames", normalized)).catch(() => {});
  await deleteDoc(doc(db, "profiles", uid)).catch(() => {});
  await deleteDoc(doc(db, "users", uid)).catch(() => {});
}

async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderUsers();
  } catch (err) {
    console.error("Loading users failed:", err);
    const list = document.getElementById("privat-users");
    if (list) list.innerHTML = `<p class="comments-empty">Konnte nicht geladen werden.</p>`;
  }
}

// ---------- Banned words ----------
let bannedWords = [];

function wordChipHTML(word) {
  return `<span class="privat-word-chip">${escapeHTML(word)}<button type="button" data-remove-word="${escapeHTML(word)}" aria-label="${escapeHTML(word)} entfernen">&times;</button></span>`;
}

function renderWords() {
  const el = document.getElementById("privat-words");
  if (!el) return;
  el.innerHTML = bannedWords.length
    ? `<div class="privat-word-list">${bannedWords.map(wordChipHTML).join("")}</div>`
    : `<p class="comments-empty">Keine gesperrten Wörter.</p>`;
  el.querySelectorAll("[data-remove-word]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const word = btn.dataset.removeWord;
      const previous = bannedWords;
      bannedWords = bannedWords.filter((w) => w !== word);
      renderWords();
      try {
        await saveWords();
      } catch (err) {
        // Real bug: the word was already removed from the local list and
        // re-rendered above (optimistic update) *before* this save was even
        // attempted -- a failure used to just log to the console, leaving
        // the admin looking at a word list that no longer matched what was
        // actually saved in Firestore (the word would still be silently
        // censored/allowed server-side, contradicting what the UI showed).
        // Revert to the exact pre-edit list rather than re-deriving it, in
        // case something else changed bannedWords in the meantime.
        console.error("Saving banned words failed:", err);
        bannedWords = previous;
        renderWords();
        showToast("Wort konnte nicht entfernt werden.");
      }
    });
  });
}

async function saveWords() {
  await setDoc(doc(db, "settings", "moderation"), { bannedWords }, { merge: true });
}

async function loadWords() {
  try {
    const snap = await getDoc(doc(db, "settings", "moderation"));
    bannedWords = snap.exists() ? snap.data().bannedWords || [] : [];
    renderWords();
  } catch (err) {
    // Matches the inline-message pattern the comments/users/campaigns tabs
    // already use for their own load failures -- this one just silently
    // logged before, leaving the tab looking empty with no explanation.
    console.error("Loading banned words failed:", err);
    const el = document.getElementById("privat-words");
    if (el) el.innerHTML = `<p class="comments-empty">Konnte nicht geladen werden.</p>`;
  }
}

function wireWordForm() {
  document.getElementById("privat-word-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const input = document.getElementById("privat-word-input");
    const word = input.value.trim().toLowerCase();
    input.value = "";
    if (!word || bannedWords.includes(word)) return;
    bannedWords.push(word);
    renderWords();
    try {
      await saveWords();
    } catch (err) {
      // Same reversion reasoning as the remove-word handler above.
      console.error("Saving banned words failed:", err);
      bannedWords = bannedWords.filter((w) => w !== word);
      renderWords();
      showToast("Wort konnte nicht hinzugefügt werden.");
    }
  });
}

// ---------- Site settings (Twitch visibility) ----------
// settings/site.twitchEnabled -- read by js/flags.js on every page load
// (localStorage-cached first for zero-latency/zero-flash, refreshed in the
// background; see the comment there for the tradeoff this implies: a flip
// here isn't instant on someone else's already-open tab).
let siteSettings = { twitchEnabled: true };

function settingsHTML() {
  return `
  <label class="privat-toggle-row">
    <input type="checkbox" id="privat-twitch-toggle" ${siteSettings.twitchEnabled ? "checked" : ""}>
    <span id="privat-twitch-toggle-label">Twitch-Inhalte site-weit ${siteSettings.twitchEnabled ? "eingeblendet" : "ausgeblendet"}</span>
  </label>
  <p class="privat-hint">Blendet Player/Chat/VOD-Archiv auf der Mehr- und Live-Seite sowie den Twitch-Link auf der Startseite und im Kontakt aus. Die Mehr-Seite heißt dann „ZevKev+" statt „Mehr". Wirkt für alle Besucher innerhalb von etwa einer Sekunde, auch auf bereits offenen Tabs.</p>
  <p class="privat-error" id="privat-twitch-toggle-error" style="display:none;"></p>`;
}

// Renders once, then only ever patches the label text on toggle -- avoids
// re-rendering (and needing to re-wire) the checkbox's own change listener.
function renderSettings() {
  const el = document.getElementById("privat-settings");
  if (!el) return;
  el.innerHTML = settingsHTML();
  document.getElementById("privat-twitch-toggle")?.addEventListener("change", async (ev) => {
    const next = ev.target.checked;
    const errorEl = document.getElementById("privat-twitch-toggle-error");
    if (errorEl) errorEl.style.display = "none";
    try {
      await setDoc(doc(db, "settings", "site"), { twitchEnabled: next }, { merge: true });
      siteSettings.twitchEnabled = next;
      const label = document.getElementById("privat-twitch-toggle-label");
      if (label) label.textContent = `Twitch-Inhalte site-weit ${next ? "eingeblendet" : "ausgeblendet"}`;
      // Updates the very cache js/config.js reads, instead of waiting on
      // js/flags.js's own background refresh to eventually do it -- closes
      // the toggle's own next-reload gap to zero, same fix as the live
      // cross-tab correction flags.js now does for everyone else.
      try {
        localStorage.setItem("zevkev-twitch-enabled-cache", next ? "1" : "0");
      } catch {
        // ignore -- private browsing / storage full
      }
      document.documentElement.classList.toggle("twitch-disabled", !next);
      window.dispatchEvent(new CustomEvent("zevkev:twitch-flag-updated", { detail: { enabled: next } }));
    } catch (err) {
      console.error("Saving settings failed:", err);
      ev.target.checked = siteSettings.twitchEnabled; // revert the checkbox -- the write didn't actually happen
      if (errorEl) {
        errorEl.textContent = "Speichern fehlgeschlagen. Bitte erneut versuchen.";
        errorEl.style.display = "";
      }
    }
  });
}

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    siteSettings.twitchEnabled = snap.exists() ? snap.data().twitchEnabled !== false : true;
  } catch (err) {
    console.error("Loading settings failed:", err);
  }
  renderSettings();
}

// ---------- Campaigns / promo codes ----------
let campaigns = [];

function campaignRowHTML(c) {
  const active = c.published && !c.endedEarly;
  return `
  <div class="privat-campaign-row">
    <div class="privat-campaign-info">
      <strong>${escapeHTML(c.code)}</strong> — ${escapeHTML(c.description)}
      <span class="privat-campaign-dates">${escapeHTML(c.startDate)} bis ${escapeHTML(c.endDate)}</span>
      ${c.endedEarly ? `<span class="privat-campaign-status">Vorzeitig beendet</span>` : active ? `<span class="privat-campaign-status is-live">Läuft</span>` : ""}
    </div>
    ${!c.endedEarly ? `<button type="button" class="p-btn rip privat-danger-btn" data-end-campaign="${c.id}">Vorzeitig beenden</button>` : ""}
  </div>`;
}

function renderCampaigns() {
  const el = document.getElementById("privat-campaigns");
  if (!el) return;
  el.innerHTML = campaigns.length ? campaigns.map(campaignRowHTML).join("") : `<p class="comments-empty">Noch keine Aktionen.</p>`;
  el.querySelectorAll("[data-end-campaign]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.endCampaign;
      btn.disabled = true;
      try {
        await setDoc(doc(db, "campaigns", id), { endedEarly: true }, { merge: true });
        const c = campaigns.find((x) => x.id === id);
        if (c) c.endedEarly = true;
        renderCampaigns();
      } catch (err) {
        console.error("Ending campaign failed:", err);
        showToast("Aktion konnte nicht beendet werden.");
        btn.disabled = false;
      }
    });
  });
}

// campaigns is a SHARED Firestore collection with jamonhd-de (same Firebase
// project) -- filtered client-side rather than via a Firestore
// where("site",...) clause so campaigns created before this field existed
// (no "site" key at all) still show here instead of vanishing.
async function loadCampaigns() {
  try {
    const snap = await getDocs(query(collection(db, "campaigns"), orderBy("createdAt", "desc"), limit(50)));
    campaigns = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => (c.site ?? "zevkev") === "zevkev");
    renderCampaigns();
  } catch (err) {
    console.error("Loading campaigns failed:", err);
  }
}

function wireCampaignForm() {
  document.getElementById("privat-campaign-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = document.getElementById("privat-campaign-code").value.trim();
    const description = document.getElementById("privat-campaign-desc").value.trim();
    const startDate = document.getElementById("privat-campaign-start").value;
    const endDate = document.getElementById("privat-campaign-end").value;
    if (!code || !description || !startDate || !endDate) return;
    const submitBtn = ev.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const ref = await addDoc(collection(db, "campaigns"), {
        code,
        description,
        startDate,
        endDate,
        published: true,
        endedEarly: false,
        site: "zevkev",
        createdAt: serverTimestamp(),
      });
      campaigns.unshift({ id: ref.id, code, description, startDate, endDate, published: true, endedEarly: false, site: "zevkev", createdAt: Date.now() });
      renderCampaigns();
      ev.target.reset();
    } catch (err) {
      console.error("Creating campaign failed:", err);
      showToast("Aktion konnte nicht veröffentlicht werden.");
    } finally {
      submitBtn.disabled = false;
    }
  });
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
    loadUsers();
    loadWords();
    loadSettings();
    loadCampaigns();
  }
});

document.getElementById("privat-logout-btn")?.addEventListener("click", () => signOutUser());
wireTabs();
wireWordForm();
wireCampaignForm();
