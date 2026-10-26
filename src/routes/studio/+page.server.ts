import { redirect } from "@sveltejs/kit";
import { SUBJECTS } from "#lib/core/catalog.ts";
import { db } from "#lib/server/db/index.ts";
import { createCourse, listOwned } from "#lib/server/courses.ts";
import { action, str } from "#lib/server/web.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.guest) redirect(303, "/signup?next=/studio");
  return { courses: await listOwned(await db(), locals.user), subjects: SUBJECTS };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const fd = await request.formData();
    const result = await action(async () => {
      const c = await createCourse(await db(), locals.user, {
        meta: { title: str(fd, "title"), subject: str(fd, "subject"), description: str(fd, "description") },
        content: { units: [{ id: "u-1", title: "Unit 1", lessons: [] }] },
      });
      return { id: c.id };
    });
    if (result && "id" in result) redirect(303, `/studio/${result.id}`);
    return result;
  },
};
