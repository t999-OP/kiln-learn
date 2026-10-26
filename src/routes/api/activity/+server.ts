import { db } from "#lib/server/db/index.ts";
import { recentActivity } from "#lib/server/activity.ts";
import { unauthorized } from "#lib/server/errors.ts";
import { api } from "#lib/server/web.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, url }) =>
  api(async () => {
    if (!locals.user) throw unauthorized();
    return recentActivity(await db(), locals.user.id, 50, Number(url.searchParams.get("after") ?? 0));
  });
