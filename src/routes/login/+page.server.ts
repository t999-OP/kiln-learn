import { fail, redirect } from "@sveltejs/kit";
import { AuthError, SESSION_COOKIE, createSession, login, mergeGuest } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { rateLimit } from "#lib/server/ratelimit.ts";
import { cookieOptions, safeNext, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user && !locals.user.guest) redirect(303, safeNext(url.searchParams.get("next")));
};

export const actions: Actions = {
  default: async ({ request, cookies, url, getClientAddress, locals }) => {
    const fd = await request.formData();
    const email = str(fd, "email");
    const limit = rateLimit(`login:${getClientAddress()}:${email.toLowerCase()}`, 8, 10 * 60_000);
    if (!limit.ok) return fail(429, { error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} min.`, email });
    try {
      const user = await login(await db(), email, str(fd, "password"));
      // Progress made as a guest on this device moves into the account.
      if (locals.user?.guest) await mergeGuest(await db(), locals.user.id, user.id);
      const { token, expiresAt } = await createSession(await db(), user.id);
      cookies.set(SESSION_COOKIE, token, cookieOptions(url, expiresAt));
    } catch (e) {
      if (e instanceof AuthError) return fail(400, { error: e.message, email });
      throw e;
    }
    redirect(303, safeNext(url.searchParams.get("next")));
  },
};
