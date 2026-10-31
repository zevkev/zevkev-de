// Reads the Twitch switch from /twitch.txt ("twitch = true" or
// "twitch = false"), marks <html> with .twitch-on / .twitch-off so CSS can
// show or hide [data-twitch] / [data-no-twitch] content, and caches the value
// for js/boot.js on the next page load. Anything other than an explicit
// "true" counts as off, so a missing or broken file never shows Twitch.
let pending;

function apply(on) {
  const root = document.documentElement;
  root.classList.toggle("twitch-on", on);
  root.classList.toggle("twitch-off", !on);
  try {
    localStorage.setItem("zevkev-twitch", on ? "1" : "0");
  } catch {}
}

export function parseTwitchFlag(text) {
  const match = /^\s*twitch\s*=\s*(true|false)\s*$/im.exec(text || "");
  return match ? match[1].toLowerCase() === "true" : false;
}

export function twitchEnabled() {
  pending ??= fetch("/twitch.txt", { cache: "no-cache" })
    .then((res) => (res.ok ? res.text() : ""))
    .then(parseTwitchFlag)
    .catch(() => false)
    .then((on) => {
      apply(on);
      return on;
    });
  return pending;
}

twitchEnabled();
