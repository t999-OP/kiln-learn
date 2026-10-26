import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { can } from "#lib/server/auth.ts";
import { config } from "#lib/server/config.ts";
import { db } from "#lib/server/db/index.ts";
import { AiError, generateObject } from "#lib/server/ai/providers.ts";
import { aiStatus, deleteAiSettings, getAiConfig, PROVIDERS, saveAiSettings } from "#lib/server/ai/settings.ts";
import { rateLimit } from "#lib/server/ratelimit.ts";
import { action, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

const allowCustomUrl = (user: App.Locals["user"]) => config.aiCustomUrls === "all" || (config.aiCustomUrls === "admins" && can.admin(user));

export const load: PageServerLoad = async ({ locals }) => ({
  status: await aiStatus(await db(), locals.user!.id),
  providers: PROVIDERS,
  allowCustomUrl: allowCustomUrl(locals.user),
});

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const fd = await request.formData();
    return action(async () => {
      await saveAiSettings(
        await db(),
        locals.user!.id,
        { provider: str(fd, "provider"), model: str(fd, "model"), baseUrl: str(fd, "baseUrl"), apiKey: str(fd, "apiKey"), keepKey: true },
        { allowCustomUrl: allowCustomUrl(locals.user) },
      );
      return { saved: true };
    });
  },
  test: async ({ locals }) => {
    if (!rateLimit(`aitest:${locals.user!.id}`, 10, 10 * 60_000).ok) return fail(429, { error: "Too many tests. Wait a few minutes." });
    const cfg = await getAiConfig(await db(), locals.user!.id);
    if (!cfg) return fail(400, { error: "Save your settings first." });
    try {
      const r = await generateObject(cfg, {
        system: "You check that an API connection works.",
        prompt: 'Reply with {"ok": true, "word": "<the Spanish word for hello>"}.',
        schema: z.object({ ok: z.boolean(), word: z.string() }),
        maxTokens: 2000,
      });
      return { tested: `Connected — the model answered “${r.word}”.` };
    } catch (e) {
      if (e instanceof AiError) return fail(400, { error: e.message });
      throw e;
    }
  },
  remove: async ({ locals }) => {
    await deleteAiSettings(await db(), locals.user!.id);
    return { removed: true };
  },
};
