import { redirect } from "@sveltejs/kit";
import { deleteSession, SESSION_COOKIE } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => redirect(303, "/");

export const actions: Actions = {
  default: async ({ locals, cookies }) => {
    if (locals.sessionId) await deleteSession(await db(), locals.sessionId);
    cookies.delete(SESSION_COOKIE, { path: "/" });
    redirect(303, "/");
  },
};
