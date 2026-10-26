// Public creator profiles: who made what, and how many learners it reached.
import { and, countDistinct, eq, sql } from "drizzle-orm";
import type { DB } from "./db/index.ts";
import { courses, lessonProgress, users } from "./db/schema.ts";
import { listCatalog } from "./courses.ts";
import { notFound } from "./errors.ts";

export async function getProfile(db: DB, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw notFound("Profile not found.");
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      createdAt: users.createdAt,
      xp: users.xp,
      streak: users.streak,
      guest: users.isGuest,
      banned: users.banned,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!u || u.guest || u.banned) throw notFound("Profile not found.");
  const [published, [reach]] = await Promise.all([
    listCatalog(db, { ownerId: userId, limit: 100 }),
    db
      .select({ learners: countDistinct(lessonProgress.userId) })
      .from(lessonProgress)
      .innerJoin(courses, eq(courses.id, lessonProgress.courseId))
      .where(
        and(
          eq(courses.ownerId, userId),
          eq(courses.status, "published"),
          eq(courses.visibility, "public"),
          sql`${lessonProgress.userId} <> ${userId}`,
        ),
      ),
  ]);
  return { id: u.id, name: u.name, createdAt: u.createdAt, xp: u.xp, streak: u.streak, courses: published, learners: reach.learners };
}
