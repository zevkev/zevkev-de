// Runs early (like flags.js) to avoid a flash of the wrong theme. Picks the
// saved preference if there is one, otherwise the system setting, and
// exposes toggleTheme() for the header button wired up in layout.js.
const KEY = "zevkev-theme";

function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function current() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

const saved = localStorage.getItem(KEY);
const initial = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
apply(initial);

export function toggleTheme() {
  const next = current() === "dark" ? "light" : "dark";
  apply(next);
  localStorage.setItem(KEY, next);
  return next;
}

export function getTheme() {
  return current();
}
