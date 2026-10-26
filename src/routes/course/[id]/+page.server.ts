import { fail } from "@sveltejs/kit";
import { db } from "#lib/server/db/index.ts";
import { canEdit, getPlayable } from "#lib/server/courses.ts";
import { courseProgress } from "#lib/server/progress.ts";
import { myRating, rateCourse, REPORT_REASONS, reportCourse } from "#lib/server/community.ts";
import { action, guard, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const d = await db();
  const course = await guard(() => getPlayable(d, locals.user, params.id, { preview: url.searchParams.has("preview") }));
  const [progress, rating] = locals.user
    ? await Promise.all([courseProgress(d, locals.user.id, params.id), myRating(d, locals.user.id, params.id)])
    : [{}, null];
  return {
    course,
    progress: progress as Record<string, { bestAccuracy: number; plays: number }>,
    rating: rating && { stars: rating.stars, review: rating.review },
    editable: canEdit(locals.user, course),
    reasons: REPORT_REASONS,
  };
};

export const actions: Actions = {
  rate: async ({ request, locals, params }) => {
    const fd = await request.formData();
    return action(async () => {
      await rateCourse(await db(), locals.user, params.id, Number(fd.get("stars")), str(fd, "review"));
      return { rated: true };
    });
  },
  report: async ({ request, locals, params }) => {
    const fd = await request.formData();
    if (!str(fd, "reason")) return fail(400, { error: "Pick a reason." });
    return action(async () => {
      const r = await reportCourse(await db(), locals.user, params.id, str(fd, "reason"), str(fd, "details"));
      return { reported: true, duplicate: r.duplicate };
    });
  },
};
