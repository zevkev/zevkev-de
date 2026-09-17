// ZevKev Privat dashboard -- plain JS, no build step, no framework.
//
// Flow: try GET /api/stats. A 401 means "not logged in" -> show the
// password form, which POSTs /api/login and retries /api/stats on
// success. A 200 means the session cookie is already valid -> render
// straight away. All requests are same-origin, so the browser sends the
// HttpOnly session cookie automatically -- no token handling in JS at all.

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const passwordInput = document.getElementById("password-input");
const logoutBtn = document.getElementById("logout-btn");
const dashboardError = document.getElementById("dashboard-error");
const rangeButtons = document.querySelectorAll(".range-btn");

let currentRange = "7d";

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  logoutBtn.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutBtn.hidden = false;
}

async function fetchStats(range) {
  const res = await fetch(`/api/stats?range=${encodeURIComponent(range)}`);
  if (res.status === 401) return { ok: false, unauthorized: true };
  if (!res.ok) return { ok: false, unauthorized: false };
  const data = await res.json();
  return { ok: true, data };
}

async function loadDashboard(range) {
  dashboardError.hidden = true;
  const result = await fetchStats(range);
  if (result.unauthorized) {
    showLogin();
    return;
  }
  if (!result.ok) {
    showDashboard();
    dashboardError.hidden = false;
    dashboardError.textContent = "Statistiken konnten nicht geladen werden.";
    return;
  }
  showDashboard();
  render(result.data);
}

// --- Rendering -------------------------------------------------------

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatNumber(n) {
  return new Intl.NumberFormat("de-DE").format(n || 0);
}

function formatSeconds(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} Std. ${m} Min.`;
  if (m > 0) return `${m} Min. ${sec} Sek.`;
  return `${sec} Sek.`;
}

// Renders a "label -- count, with a proportional bar" list into a <ul>.
// `items` is [{ path, count, ...extra }]; `formatCount` turns one item
// into the right-hand label text (defaults to a plain count).
function renderBarList(listId, emptyId, items, formatCount) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  list.innerHTML = "";

  if (!items || items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const max = Math.max(...items.map((i) => i.count || 0), 1);

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "bar-row";

    const top = document.createElement("div");
    top.className = "bar-row-top";

    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = item.path;
    name.title = item.path;

    const countLabel = document.createElement("span");
    countLabel.className = "bar-count";
    countLabel.textContent = formatCount ? formatCount(item) : formatNumber(item.count);

    top.appendChild(name);
    top.appendChild(countLabel);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    const pct = Math.max(4, Math.round(((item.count || 0) / max) * 100));
    fill.style.width = `${pct}%`;
    track.appendChild(fill);

    li.appendChild(top);
    li.appendChild(track);
    list.appendChild(li);
  }
}

function render(data) {
  setText("stat-pageviews-total", formatNumber(data.pageViews?.total));
  setText("stat-pageviews-vods", formatNumber(data.vodPageViews));
  setText("stat-pageviews-youtube", formatNumber(data.youtubePageViews));

  setText("stat-cart-count", formatNumber(data.addToCart?.count));
  setText("stat-cart-qty", formatNumber(data.addToCart?.totalQuantity));

  renderBarList("list-products", "empty-products", data.productViews, (item) =>
    `${formatNumber(item.count)}x`
  );

  renderBarList("list-clicks", "empty-clicks", data.clicks, (item) =>
    `${formatNumber(item.count)}x`
  );

  renderBarList("list-impressions", "empty-impressions", data.impressions, (item) =>
    `${formatNumber(item.count)}x`
  );

  renderBarList(
    "list-watchtime",
    "empty-watchtime",
    (data.watchTime || []).map((w) => ({ ...w, count: w.totalSeconds })),
    (item) => `${formatSeconds(item.totalSeconds)} (Ø ${formatSeconds(item.avgSeconds)})`
  );
}

// --- Events ------------------------------------------------------------

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const password = passwordInput.value;
  if (!password) return;

  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      let message = "Falsches Passwort";
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch {
        // ignore -- keep default message
      }
      loginError.textContent = message;
      loginError.hidden = false;
      return;
    }

    passwordInput.value = "";
    await loadDashboard(currentRange);
  } catch {
    loginError.textContent = "Verbindung fehlgeschlagen. Nochmal versuchen.";
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // Even if the request fails, still show the login form -- the cookie
    // will simply expire on its own within the session TTL.
  }
  showLogin();
});

rangeButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    currentRange = btn.dataset.range;
    rangeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    await loadDashboard(currentRange);
  });
});

// --- Boot ----------------------------------------------------------------

loadDashboard(currentRange);
