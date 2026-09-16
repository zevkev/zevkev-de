// Reveal-on-scroll for .reveal elements, and the Discord invite copy button.

function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => io.observe(el));
}

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
