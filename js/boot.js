// Classic (non-module) script loaded in <head>, so it runs before first
// paint: applies the saved theme and the last known Twitch state, which
// avoids a flash of the wrong theme or of Twitch content.
(function () {
  var root = document.documentElement;
  var theme = null;
  var twitch = null;
  try {
    theme = localStorage.getItem("zevkev-theme");
    twitch = localStorage.getItem("zevkev-twitch");
  } catch (e) {}
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);
  if (twitch === "1") root.classList.add("twitch-on");
  else if (twitch === "0") root.classList.add("twitch-off");
})();
