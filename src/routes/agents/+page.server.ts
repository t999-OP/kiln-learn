import { db } from "#lib/server/db/index.ts";
import { recentActivity } from "#lib/server/activity.ts";
import { listApiTokens } from "#lib/server/auth.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const d = await db();
  return {
    mcpUrl: `${url.origin}/mcp`,
    activity: locals.user ? await recentActivity(d, locals.user.id, 50) : [],
    tokenCount: locals.user ? (await listApiTokens(d, locals.user.id)).length : 0,
  };
};
