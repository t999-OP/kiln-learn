import { fail, redirect } from "@sveltejs/kit";
import { AuthError, changePassword, deleteAccount, deleteGuest, SESSION_COOKIE, updateName } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { str } from "#lib/server/web.ts";
import type { Actions } from "./$types";

async function run(form: string, fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
    return { form, ok };
  } catch (e) {
    if (e instanceof AuthError) return fail(400, { form, error: e.message });
    throw e;
  }
}

export const actions: Actions = {
  profile: async ({ request, locals }) => {
    const fd = await request.formData();
    return run("profile", async () => updateName(await db(), locals.user!.id, str(fd, "name")), "Saved.");
  },
  password: async ({ request, locals }) => {
    const fd = await request.formData();
    if (str(fd, "next") !== str(fd, "confirm")) return fail(400, { form: "password", error: "The new passwords don't match." });
    const r = await run("password", async () => changePassword(await db(), locals.user!.id, str(fd, "current"), str(fd, "next")), "");
    if (!("ok" in r)) return r;
    redirect(303, "/login?next=/settings"); // all sessions were signed out
  },
  deleteGuest: async ({ locals, cookies }) => {
    if (locals.user?.guest) await deleteGuest(await db(), locals.user.id);
    cookies.delete(SESSION_COOKIE, { path: "/" });
    redirect(303, "/");
  },
  delete: async ({ request, locals, cookies }) => {
    const fd = await request.formData();
    const r = await run("delete", async () => deleteAccount(await db(), locals.user!.id, str(fd, "password")), "");
    if (!("ok" in r)) return r;
    cookies.delete(SESSION_COOKIE, { path: "/" });
    redirect(303, "/");
  },
};
