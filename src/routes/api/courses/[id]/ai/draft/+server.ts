import { z } from "zod";
import { db } from "#lib/server/db/index.ts";
import { aiDraftLesson } from "#lib/server/ai/service.ts";
import { invalid } from "#lib/server/errors.ts";
import { api, readJson } from "#lib/server/web.ts";
import type { RequestHandler } from "./$types";

const Body = z.object({ unitId: z.string(), instructions: z.string().max(4000).default(""), source: z.string().optional() });

export const POST: RequestHandler = ({ params, locals, request }) =>
  api(async () => {
    const body = Body.safeParse(await readJson(request));
    if (!body.success) throw invalid("Invalid request.");
    return aiDraftLesson(await db(), locals.user, params.id, body.data);
  });
