// Headless Chrome via the DevTools protocol: screenshot + console/errors.
//
//   node tools/cdp-shot.mjs --url http://localhost:8100/youtube/ --out C:/path/shot.png
//     [--width 1280] [--height 900] [--mobile] [--scheme light|dark]
//     [--full] [--wait 2500] [--eval "js expression"] [--after 800]
//     [--storage '{"zevkev-theme":"dark"}'] [--no-reveal] [--scroll 1200]
//
// --mobile    real phone emulation (touch, mobile viewport), use --width 390
// --full      capture the whole page height (max 14000px)
// --eval      runs in the page after load (awaited), result is printed;
//             runs before the screenshot, e.g. to click something
// --storage   localStorage entries set before the page's own scripts run
// --scroll    scroll to this Y before capturing (viewport shots)
// .reveal elements get .is-visible forced unless --no-reveal is passed.
// Prints every console message, uncaught exception and HTTP >= 400.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
};
const flag = (name) => argv.includes(`--${name}`);

const url = opt("url");
const out = opt("out");
if (!url || !out) {
  console.error("need --url and --out");
  process.exit(2);
}
const width = Number(opt("width", 1280));
const height = Number(opt("height", 900));
const mobile = flag("mobile");
const scheme = opt("scheme", "light");
const full = flag("full");
const wait = Number(opt("wait", 2500));
const after = Number(opt("after", 800));
const evalExpr = opt("eval");
const storage = opt("storage");
const scrollY = opt("scroll");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "zk-cdp-"));
const proc = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
let ws;

async function main() {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  const waiters = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    const p = m.params || {};
    if (m.method === "Runtime.consoleAPICalled") {
      const text = (p.args || []).map((a) => (a.value !== undefined ? (typeof a.value === "object" ? JSON.stringify(a.value) : a.value) : a.description || "")).join(" ");
      logs.push(`[console.${p.type}] ${text}`);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails || {};
      logs.push(`[exception] ${d.exception?.description || d.text} ${d.url || ""}:${d.lineNumber ?? ""}`);
    } else if (m.method === "Log.entryAdded") {
      logs.push(`[log.${p.entry.level}] ${p.entry.text} ${p.entry.url || ""}`);
    } else if (m.method === "Network.responseReceived" && p.response.status >= 400) {
      logs.push(`[http ${p.response.status}] ${p.response.url}`);
    } else if (m.method === "Network.loadingFailed" && !p.canceled) {
      logs.push(`[net-fail] ${p.errorText} (${p.type})`);
    }
    if (waiters.has(m.method)) {
      waiters.get(m.method)();
      waiters.delete(m.method);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method, timeout = 20000) =>
    new Promise((res) => {
      waiters.set(method, res);
      setTimeout(res, timeout);
    });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (storage) {
    const entries = JSON.parse(storage);
    const js = Object.entries(entries).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))});`).join("");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{${js}}catch(e){}` });
  }

  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await sleep(wait);

  if (evalExpr) {
    const r = await send("Runtime.evaluate", { expression: evalExpr, awaitPromise: true, returnByValue: true });
    const res = r.result?.result;
    const exc = r.result?.exceptionDetails;
    console.log("--- eval result ---");
    console.log(exc ? `EXCEPTION ${exc.exception?.description || exc.text}` : JSON.stringify(res?.value ?? res?.description ?? null, null, 1));
    await sleep(after);
  }
  if (!flag("no-reveal")) {
    await send("Runtime.evaluate", { expression: "document.querySelectorAll('.reveal').forEach(e=>e.classList.add('is-visible'))" });
    await sleep(700);
  }

  let clip;
  if (full) {
    const r = await send("Runtime.evaluate", { expression: "Math.ceil(document.documentElement.scrollHeight)", returnByValue: true });
    const h = Math.min(r.result.result.value, 14000);
    clip = { x: 0, y: 0, width, height: h, scale: 1 };
  } else if (scrollY) {
    await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${Number(scrollY)})` });
    await sleep(600);
  }
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!full, ...(clip ? { clip } : {}) });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`OK ${out}${clip ? ` (${clip.width}x${clip.height})` : ` (${width}x${height})`}`);
}

try {
  await main();
} catch (err) {
  console.log("FAILED", err?.message || err);
} finally {
  console.log(logs.length ? `--- page log (${logs.length}) ---\n${logs.join("\n")}` : "--- page log: clean ---");
  try { ws?.close(); } catch {}
  proc.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
