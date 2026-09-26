// Discord invite copy button + smooth-scroll anchors. The reveal-on-scroll
// logic that used to live in this file directly is now js/reveal.js -- see
// that file's own comment for why it moved out (this module was being
// imported dynamically, purely as a side effect, by unrelated pages that
// just wanted the reveal behavior).
import { initReveal } from "./reveal.js";

function initInviteCopy() {
  const btn = document.getElementById("discord-copy");
  const ok = document.getElementById("discord-copy-ok");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const invite = btn.getAttribute("data-invite");
    try {
      await navigator.clipboard.writeText(invite);
      if (ok) ok.textContent = "Einladung kopiert. Schick sie weiter!";
    } catch {
      if (ok) ok.textContent = invite;
    }
  });
}

function initSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (ev) => {
      const href = a.getAttribute("href");
      if (!href || href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", a.getAttribute("href"));
    });
  });
}

initReveal();
initInviteCopy();
initSmoothAnchors();
