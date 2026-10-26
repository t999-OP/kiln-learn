import { error } from "@sveltejs/kit";
import { can } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { listReports, listUsers, REPORT_REASONS, resolveReport, setBanned, setRole, type ModerationAction } from "#lib/server/community.ts";
import { action, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!can.moderate(locals.user)) error(403, "Moderators only.");
  const d = await db();
  const status = (url.searchParams.get("status") ?? "open") as "open" | "resolved" | "dismissed";
  const q = url.searchParams.get("q") ?? "";
  return {
    reports: await listReports(d, locals.user, status),
    users: await listUsers(d, locals.user, q),
    status,
    q,
    reasons: REPORT_REASONS,
    isAdmin: can.admin(locals.user),
  };
};

export const actions: Actions = {
  resolve: async ({ request, locals }) => {
    const fd = await request.formData();
    return action(
      async () => (
        await resolveReport(await db(), locals.user, Number(fd.get("id")), str(fd, "action") as ModerationAction, str(fd, "note")),
        { done: true }
      ),
    );
  },
  ban: async ({ request, locals }) => {
    const fd = await request.formData();
    return action(async () => (await setBanned(await db(), locals.user, str(fd, "id"), str(fd, "banned") === "1"), { done: true }));
  },
  role: async ({ request, locals }) => {
    const fd = await request.formData();
    return action(
      async () => (
        await setRole(await db(), locals.user, str(fd, "id"), str(fd, "role") as "user" | "moderator" | "admin"),
        { done: true }
      ),
    );
  },
};
