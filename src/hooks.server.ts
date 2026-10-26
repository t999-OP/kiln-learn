import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { config } from "#lib/server/config.ts";
import { database } from "#lib/server/db/index.ts";
import { deleteStaleGuests, SESSION_COOKIE, validateApiToken, validateSession } from "#lib/server/auth.ts";
import { cookieOptions } from "#lib/server/web.ts";
import { seedIfEmpty } from "#lib/server/seed.ts";
import { startWidgetHost } from "#lib/server/widget-host.ts";

export const init: ServerInit = async () => {
  if (building) return;
  const { db } = await database(); // opens + migrates
  const seeded = await seedIfEmpty(db);
  if (seeded) console.log(`Seeded ${seeded} example courses.`);
  // Abandoned guest profiles are removed daily.
  const sweep = () => deleteStaleGuests(db).catch((e) => console.error("Guest cleanup failed:", e));
  void sweep();
  setInterval(sweep, 24 * 60 * 60_000).unref();
  // Survive dev-server hot reloads without binding the port twice.
  const g = globalThis as { __kilnWidgetHost?: ReturnType<typeof startWidgetHost> };
  g.__kilnWidgetHost ??= startWidgetHost(config.widgetPort);
  process.once("sveltekit:shutdown" as "exit", async () => {
    g.__kilnWidgetHost?.close();
    await (await database()).close();
  });
};

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.sessionId = null;
  event.locals.agent = null;

  if (!building) {
    const { db } = await database();
    const bearer = event.request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (bearer) {
      const r = await validateApiToken(db, bearer);
      if (r) {
        event.locals.user = r.user;
        event.locals.agent = r.tokenName;
      }
    } else {
      const token = event.cookies.get(SESSION_COOKIE);
      if (token) {
        const s = await validateSession(db, token);
        if (s) {
          event.locals.user = s.user;
          event.locals.sessionId = s.sessionId;
          if (s.renewedUntil) event.cookies.set(SESSION_COOKIE, token, cookieOptions(event.url, s.renewedUntil));
        } else event.cookies.delete(SESSION_COOKIE, { path: "/" });
      }
    }
  }

  const response = await resolve(event);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(self)");
  if (!event.url.pathname.startsWith("/mcp")) response.headers.set("x-frame-options", "DENY");
  return response;
};
