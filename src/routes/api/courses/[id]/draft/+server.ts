import { db } from "#lib/server/db/index.ts";
import { getForEdit, saveDraft } from "#lib/server/courses.ts";
import { invalid } from "#lib/server/errors.ts";
import { api, readJson } from "#lib/server/web.ts";
import type { RequestHandler } from "./$types";

const view = (r: Awaited<ReturnType<typeof getForEdit>>) => ({
  revision: r.course.draftRevision,
  meta: { title: r.course.title, subject: r.course.subject, description: r.course.description, languages: r.course.languages ?? undefined },
  content: r.course.draft,
  quality: r.quality,
  updatedAt: r.course.updatedAt,
});

/** Current draft. `?since=<revision>` returns {changed:false} when nothing changed (cheap polling). */
export const GET: RequestHandler = ({ params, locals, url }) =>
  api(async () => {
    const r = await getForEdit(await db(), locals.user, params.id);
    const since = Number(url.searchParams.get("since"));
    if (url.searchParams.has("since") && since === r.course.draftRevision) return { changed: false };
    return { changed: true, ...view(r) };
  });

/** Autosave from the Studio. Requires baseRevision; 409 if someone else saved in between. */
export const PUT: RequestHandler = ({ params, locals, request }) =>
  api(async () => {
    const body = (await readJson(request)) as { meta?: unknown; content?: unknown; baseRevision?: unknown } | null;
    if (!body || typeof body.baseRevision !== "number") throw invalid("baseRevision is required.");
    const r = await saveDraft(await db(), locals.user, params.id, {
      meta: body.meta,
      content: body.content,
      baseRevision: body.baseRevision,
    });
    return view(r);
  });
