import { db } from "#lib/server/db/index.ts";
import { listByIds, listCatalog } from "#lib/server/courses.ts";
import { leaderboard, startedCourses } from "#lib/server/progress.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
  const d = await db();
  const q = url.searchParams.get("q") ?? "";
  const subject = url.searchParams.get("subject") ?? "";
  const [catalog, all, top] = await Promise.all([
    listCatalog(d, { q, subject: subject || undefined }),
    q || subject ? listCatalog(d, { limit: 100 }) : null,
    leaderboard(d, 5),
  ]);
  let continuing: { course: Awaited<ReturnType<typeof listByIds>>[number]; done: number }[] = [];
  let doneByCourse: Record<string, number> = {};
  if (locals.user) {
    const started = await startedCourses(d, locals.user.id);
    doneByCourse = Object.fromEntries(started.map((s) => [s.courseId, s.done]));
    const rows = await listByIds(
      d,
      started.slice(0, 3).map((s) => s.courseId),
    );
    continuing = started
      .slice(0, 3)
      .map((s) => ({ course: rows.find((r) => r.id === s.courseId)!, done: s.done }))
      .filter((c) => c.course && c.course.status === "published" && c.done < c.course.lessons);
  }
  const subjects = [...new Set((all ?? catalog).map((c) => c.subject))];
  return { catalog, subjects, q, subject, continuing, doneByCourse, leaderboard: top };
};
