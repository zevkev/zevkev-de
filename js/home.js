// Homepage: "Einladung kopieren" copies the Discord invite and confirms it
// below the buttons. If the clipboard is not available (old browser, no
// permission) the invite link itself is shown so it can be copied by hand.
// Scroll reveal and smooth anchor scrolling come from js/layout.js and CSS.
const btn = document.getElementById("discord-copy");
const ok = document.getElementById("discord-copy-ok");
let resetTimer;

btn?.addEventListener("click", async () => {
  const invite = btn.dataset.invite;
  try {
    await navigator.clipboard.writeText(invite);
    if (ok) ok.textContent = "Einladung kopiert. Schick sie weiter!";
    btn.classList.add("is-copied");
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => btn.classList.remove("is-copied"), 2500);
  } catch {
    if (ok) ok.textContent = invite;
  }
});
