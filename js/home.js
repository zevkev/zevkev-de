// Homepage: Discord invite stats and "Kopieren" for the invite link.
// The stats come from our own /assets/data/discord.json (refreshed by
// GitHub Actions), so visitors never contact Discord. If the clipboard is
// not available (old browser, no permission) the invite link itself is
// shown so it can be copied by hand.
const NUMBER = new Intl.NumberFormat("de-DE");

async function loadDiscordStats() {
  const stats = document.getElementById("dc-stats");
  if (!stats) return;
  try {
    const res = await fetch("/assets/data/discord.json", { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    if (!Number.isFinite(data.members)) return;
    document.getElementById("dc-members").textContent = NUMBER.format(data.members);
    const online = document.getElementById("dc-online");
    if (Number.isFinite(data.online)) online.textContent = NUMBER.format(data.online);
    else online.parentElement.hidden = true;
    stats.hidden = false;
  } catch {}
}

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
    resetTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      if (ok) ok.textContent = "";
    }, 3000);
  } catch {
    if (ok) ok.textContent = invite;
  }
});

loadDiscordStats();
