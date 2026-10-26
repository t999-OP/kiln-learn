import { createApiToken, listApiTokens, revokeApiToken } from "#lib/server/auth.ts";
import { db } from "#lib/server/db/index.ts";
import { str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => ({
  tokens: await listApiTokens(await db(), locals.user!.id),
  mcpUrl: `${url.origin}/mcp`,
});

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const t = await createApiToken(await db(), locals.user!.id, str(await request.formData(), "name"));
    return { created: { name: t.name, token: t.token } };
  },
  revoke: async ({ request, locals }) => {
    await revokeApiToken(await db(), locals.user!.id, str(await request.formData(), "id"));
    return { revoked: true };
  },
};
