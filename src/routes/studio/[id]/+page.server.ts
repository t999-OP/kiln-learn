import { redirect } from "@sveltejs/kit";
import { STEP_TYPES, SUBJECTS, WIDGETS } from "#lib/core/catalog.ts";
import { db } from "#lib/server/db/index.ts";
import { deleteCourse, getForEdit, listVersions, publish, unpublish, updateSettings, type Visibility } from "#lib/server/courses.ts";
import { stepStatsFor } from "#lib/server/progress.ts";
import { aiStatus } from "#lib/server/ai/settings.ts";
import { action, guard, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user || locals.user.guest) redirect(303, `/signup?next=/studio/${params.id}`);
  const d = await db();
  const { course, quality } = await guard(() => getForEdit(d, locals.user, params.id));
  const [versions, stats, ai] = await Promise.all([
    listVersions(d, locals.user, params.id),
    course.publishedVersion
      ? stepStatsFor(d, params.id, course.publishedVersion)
      : Promise.resolve({} as Awaited<ReturnType<typeof stepStatsFor>>),
    aiStatus(d, locals.user!.id),
  ]);
  return {
    course: {
      id: course.id,
      revision: course.draftRevision,
      meta: { title: course.title, subject: course.subject, description: course.description, languages: course.languages ?? undefined },
      content: course.draft,
      status: course.status,
      visibility: course.visibility,
      license: course.license,
      provenance: course.provenance,
      publishedVersion: course.publishedVersion,
      isOwner: course.ownerId === locals.user!.id,
    },
    quality,
    versions,
    stats,
    ai,
    catalog: { stepTypes: STEP_TYPES, widgets: WIDGETS, subjects: SUBJECTS },
  };
};

export const actions: Actions = {
  publish: async ({ locals, params }) =>
    action(async () => {
      const r = await publish(await db(), locals.user, params.id);
      return { published: r.version };
    }),
  unpublish: async ({ locals, params }) => action(async () => (await unpublish(await db(), locals.user, params.id), { unpublished: true })),
  visibility: async ({ request, locals, params }) => {
    const v = str(await request.formData(), "visibility") as Visibility;
    return action(async () => (await updateSettings(await db(), locals.user, params.id, { visibility: v }), { saved: true }));
  },
  delete: async ({ locals, params }) => {
    const r = await action(async () => (await deleteCourse(await db(), locals.user, params.id), { deleted: true }));
    if (r && "deleted" in r) redirect(303, "/studio");
    return r;
  },
};
