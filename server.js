// Production entry point: `node server.js` (after `pnpm build`).
//
// Wraps SvelteKit's adapter-node handler so the public URL can be set at runtime with ORIGIN,
// e.g. ORIGIN=https://kiln.example.com or ORIGIN=http://192.168.1.20:3000 on a home network.
// (adapter-node 6 otherwise derives it from proxy headers and assumes https.) If you run behind
// a proxy that sets X-Forwarded-Proto/Host instead, leave ORIGIN unset and set
// PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host.
import http from "node:http";

const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN) : null;
if (origin) {
  process.env.PROTOCOL_HEADER = "x-kiln-origin-proto";
  process.env.HOST_HEADER = "x-kiln-origin-host";
}

// Courses are saved as one JSON document; allow large ones (adapter-node defaults to 512K).
process.env.BODY_SIZE_LIMIT ??= "4M";

const { handler } = await import("./build/handler.js");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const server = http
  .createServer((req, res) => {
    if (origin) {
      // Overwrite (never trust) these internal headers on every request.
      req.headers["x-kiln-origin-proto"] = origin.protocol.slice(0, -1);
      req.headers["x-kiln-origin-host"] = origin.host;
    }
    handler(req, res);
  })
  .listen(port, host, () => console.log(`Kiln listening on ${host}:${port}${origin ? ` — public URL ${origin.origin}` : ""}`));

// Graceful shutdown (docker stop, Ctrl+C): stop accepting requests, let hooks close the
// widget host and database, then exit.
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeIdleConnections?.();
    process.emit("sveltekit:shutdown", signal);
    setTimeout(() => process.exit(0), 5000).unref();
  });
