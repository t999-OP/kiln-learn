import { z } from "zod";
import { can, createGuest, createSession, GUEST_SESSION_DAYS, SESSION_COOKIE } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { completeLesson } from "#lib/server/progress.ts";
import { invalid, ServiceError } from "#lib/server/errors.ts";
import { rateLimit } from "#lib/server/ratelimit.ts";
import { api, cookieOptions, readJson } from "#lib/server/web.ts";
import type { RequestHandler } from "./$types";

const Body = z.object({
  courseId: z.string(),
  version: z.number().int().positive(),
  lessonId: z.string(),
  day: z.string(),
  results: z.array(z.object({ step: z.number().int(), correct: z.boolean() })).max(200),
});

export const POST: RequestHandler = ({ request, locals, cookies, url, getClientAddress }) =>
  api(async () => {
    const body = Body.safeParse(await readJson(request));
    if (!body.success) throw invalid("Invalid progress payload.");
    const d = await db();
    let user = locals.user;
    // No account needed to learn: the first finished lesson creates an anonymous guest profile.
    if (!user) {
      if (!rateLimit(`guest:${getClientAddress()}`, 30, 60 * 60_000).ok)
        throw new ServiceError(429, "Too many new learners from your network. Try again later.");
      user = await createGuest(d);
      const { token, expiresAt } = await createSession(d, user.id, GUEST_SESSION_DAYS);
      cookies.set(SESSION_COOKIE, token, cookieOptions(url, expiresAt));
    }
    const r = await completeLesson(d, user, body.data);
    return { ...r, guest: !can.account(user) };
  });
