// Helpers for routes: cookies, error mapping, form parsing.
import { error, fail, json } from "@sveltejs/kit";
import { ServiceError } from "./errors.ts";
import { AiError } from "./ai/providers.ts";

export function cookieOptions(url: URL, expires: Date) {
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secure: url.protocol === "https:", expires };
}

/** In load functions / endpoints: turn service errors into proper HTTP errors. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) error(e.status, e.message);
    throw e;
  }
}

/** In form actions: turn service errors into `fail()` with a message the page can show. */
export async function action<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) return fail(e.status, { error: e.message, details: e.details });
    if (e instanceof Error && e.name === "AuthError") return fail(400, { error: e.message });
    throw e;
  }
}

/** In JSON endpoints. */
export async function api<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof ServiceError) return json({ error: e.message, details: e.details }, { status: e.status });
    if (e instanceof AiError) return json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

/** Only allow same-site relative redirects ("/x"), never "//evil" or "/\\evil". */
export const safeNext = (next: string | null) => (next && /^\/(?![\/\\])/.test(next) ? next : "/");

/** Parse a JSON body. Requiring the JSON content type forces a CORS preflight for cross-site requests. */
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ServiceError(415, "Send the request body as application/json.");
  return request.json().catch(() => null);
}
