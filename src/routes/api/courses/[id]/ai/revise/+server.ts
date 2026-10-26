import { z } from "zod";
import { db } from "#lib/server/db/index.ts";
import { aiReviseLesson } from "#lib/server/ai/service.ts";
import { invalid } from "#lib/server/errors.ts";
import { api, readJson } from "#lib/server/web.ts";
import type { RequestHandler } from "./$types";

const Body = z.object({ lessonId: z.string(), instructions: z.string().max(4000).default("") });

export const POST: RequestHandler = ({ params, locals, request }) =>
  api(async () => {
    const body = Body.safeParse(await readJson(request));
    if (!body.success) throw invalid("Invalid request.");
    return aiReviseLesson(await db(), locals.user, params.id, body.data.lessonId, body.data.instructions);
  });
