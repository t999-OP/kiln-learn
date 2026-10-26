// Interactive widgets run in sandboxed iframes on their OWN origin, so a widget (including
// community-made ones) can never read the app's cookies, DOM or API. This tiny server is
// that origin: it serves only files from widgets/ with a strict CSP and no network access.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors *";

const root = () => process.env.KILN_ROOT ?? process.cwd();

/** Shared TS modules served to widgets as plain JS (types stripped at startup). */
function sharedModules(): Record<string, string> {
  const toJs = (file: string) =>
    stripTypeScriptTypes(readFileSync(path.join(root(), file), "utf8"), { mode: "strip" })
      .replace(/from "\.\.\/core\/mathexpr\.ts"/g, 'from "./mathexpr.js"')
      .replace(/from "\.\/(\w+)\.ts"/g, 'from "./$1.js"');
  return {
    "mathexpr.js": toJs("src/lib/core/mathexpr.ts"),
    "plot.js": toJs("src/lib/client/plot.ts"),
  };
}

export function startWidgetHost(port: number) {
  const dir = path.join(root(), "widgets");
  const shared = sharedModules();
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url ?? "/", "http://x").pathname);
    const ext = path.extname(name);
    const body = shared[name] ?? (TYPES[ext] && existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name)) : null);
    if (!body || req.method !== "GET") {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "content-type": TYPES[ext],
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "cross-origin",
      "cache-control": process.env.NODE_ENV === "production" ? "public, max-age=3600" : "no-store",
    });
    res.end(body);
  });
  server.listen(port, () => console.log(`Widget sandbox origin listening on :${port}`));
  return server;
}
