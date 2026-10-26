import { error, fail, redirect } from "@sveltejs/kit";
import { AuthError, SESSION_COOKIE, createSession, deleteSession, register } from "#lib/server/auth.ts";
import { config } from "#lib/server/config.ts";
import { db } from "#lib/server/db/index.ts";
import { rateLimit } from "#lib/server/ratelimit.ts";
import { cookieOptions, safeNext, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user && !locals.user.guest) redirect(303, safeNext(url.searchParams.get("next")));
  if (config.registration === "closed") error(403, "Sign-ups are closed on this instance. Ask an admin for an account.");
};

export const actions: Actions = {
  default: async ({ request, cookies, url, getClientAddress, locals }) => {
    if (config.registration === "closed") return fail(403, { error: "Sign-ups are closed.", email: "", name: "" });
    const limit = rateLimit(`signup:${getClientAddress()}`, 5, 60 * 60_000);
    if (!limit.ok) return fail(429, { error: "Too many sign-ups from your network. Try again later.", email: "", name: "" });
    const fd = await request.formData();
    const values = { email: str(fd, "email"), name: str(fd, "name") };
    try {
      // A guest signing up keeps their XP, streak and progress.
      const user = await register(
        await db(),
        { ...values, password: str(fd, "password") },
        { guestId: locals.user?.guest ? locals.user.id : null },
      );
      if (locals.sessionId) await deleteSession(await db(), locals.sessionId);
      const { token, expiresAt } = await createSession(await db(), user.id);
      cookies.set(SESSION_COOKIE, token, cookieOptions(url, expiresAt));
    } catch (e) {
      if (e instanceof AuthError) return fail(400, { error: e.message, ...values });
      throw e;
    }
    redirect(303, safeNext(url.searchParams.get("next")));
  },
};
