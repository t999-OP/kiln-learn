import { error } from "@sveltejs/kit";
import { db } from "#lib/server/db/index.ts";
import { findLesson, getPlayable } from "#lib/server/courses.ts";
import { guard } from "#lib/server/web.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const d = await db();
  const course = await guard(() => getPlayable(d, locals.user, params.id, { preview: url.searchParams.has("preview") }));
  const found = findLesson(course.content, params.lessonId);
  if (!found) error(404, "Lesson not found.");
  const all = course.content.units.flatMap((u) => u.lessons);
  const next = all[all.indexOf(found.lesson) + 1] ?? null;
  return {
    course: { id: course.id, title: course.title, version: course.version, preview: course.preview, languages: course.languages },
    lesson: found.lesson,
    nextLessonId: next?.id ?? null,
  };
};
