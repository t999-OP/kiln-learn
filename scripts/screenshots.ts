// Regenerates the README screenshots (light + dark) from a running Kiln instance using headless
// Chromium over the DevTools protocol. Usage:
//   pnpm dev   # in another terminal
//   KILN_SCREENSHOT_EMAIL=… KILN_SCREENSHOT_PASSWORD=… node scripts/screenshots.ts [http://localhost:5173]
// The Studio shot needs an admin/moderator account (it opens a seeded course); it's skipped without credentials.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "docs/screenshots";
const PORT = 9333;
const chrome = spawn(
  process.env.CHROME_PATH ?? "chromium",
  ["--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run", "--hide-scrollbars", "about:blank"],
  {
    stdio: "ignore",
  },
);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function devtools() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
      if (res.ok) return (await res.json()).webSocketDebuggerUrl as string;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chromium didn't start (set CHROME_PATH).");
}

const ws = new WebSocket(await devtools());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) (pending.get(msg.id)!(msg), pending.delete(msg.id));
});
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression: string) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const goto = async (path: string) => {
  await send("Page.navigate", { url: BASE + path });
  for (let i = 0; i < 50 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(100);
  await sleep(900); // hydration, fonts, widget iframes
};
const shoot = async (name: string, theme: "light" | "dark") => {
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}-${theme}.png`, Buffer.from(result.data, "base64"));
  console.log(`  ${name}-${theme}.png`);
};

// Plays through a lesson with scripted answers, so the shot shows a step deep inside it.
const advanceScript = (moves: string) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const primary = () => [...document.querySelectorAll('.footer-bar .btn')].find((b) => !b.classList.contains('ghost'));
  const skip = () => document.querySelector('.footer-bar .btn.ghost');
  for (const move of ${moves}) {
    if (move.type === 'continue') primary().click();
    if (move.type === 'option') { document.querySelectorAll('.option')[move.i].click(); await sleep(80); primary().click(); await sleep(120); primary().click(); }
    if (move.type === 'skip') { skip().click(); await sleep(80); primary().click(); }
    if (move.type === 'type') { const el = document.querySelector(move.sel); el.value = move.value; el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(80); if (move.check) { primary().click(); await sleep(120); primary().click(); } }
    await sleep(350);
  }
})()`;

mkdirSync(OUT, { recursive: true });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

// Optional login for the Studio shot (the session cookie is set directly in the browser).
let cookie: string | null = null;
if (process.env.KILN_SCREENSHOT_EMAIL && process.env.KILN_SCREENSHOT_PASSWORD) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
    body: new URLSearchParams({ email: process.env.KILN_SCREENSHOT_EMAIL, password: process.env.KILN_SCREENSHOT_PASSWORD }),
  });
  cookie =
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("kiln_session="))
      ?.split(";")[0]
      .split("=")[1] ?? null;
  if (!cookie) console.warn("Login failed — skipping the Studio screenshot.");
}

for (const theme of ["light", "dark"] as const) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await send("Network.enable");
  await send("Network.clearBrowserCookies");

  await goto("/");
  await shoot("home", theme);

  const pendulum = await evaluate(
    `[...document.querySelectorAll('a.card')].map((a) => a.getAttribute('href')).find((h) => h.includes('pendulum'))`,
  );
  await goto(`${pendulum}/play/l-mass`);
  await evaluate(advanceScript(`[{ type: 'option', i: 2 }]`));
  await sleep(1500);
  await shoot("lesson-widget", theme);

  const calc = await evaluate(
    `fetch('/course/calculus-1/__data.json').then((r) => r.text()).then((t) => t.match(/"(l-[0-9a-f]{6,8})"/)[1])`,
  );
  await goto(`/course/calculus-1/play/${calc}`);
  await evaluate(
    advanceScript(
      `[{ type: 'continue' }, { type: 'option', i: 2 }, { type: 'skip' }, { type: 'continue' }, { type: 'type', sel: 'input.answer', value: '6', check: true }, { type: 'type', sel: 'input.answer', value: 'sin(0.001)/0.001' }]`,
    ),
  );
  await sleep(600);
  await shoot("lesson-math", theme);

  if (cookie) {
    await send("Network.setCookie", { name: "kiln_session", value: cookie, url: BASE, httpOnly: true, sameSite: "Lax" });
    await goto("/studio/calculus-1");
    await evaluate(`[...document.querySelectorAll('.tree button.lesson')][1]?.click()`);
    await sleep(500);
    await shoot("studio", theme);
  }
}

ws.close();
chrome.kill();
