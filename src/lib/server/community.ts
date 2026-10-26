// Ratings, reports and moderation.
import { and, desc, eq, sql } from "drizzle-orm";
import type { SessionUser } from "./auth.ts";
import { can, deleteUserSessions } from "./auth.ts";
import type { DB } from "./db/index.ts";
import { courses, lessonProgress, ratings, reports, users } from "./db/schema.ts";
import { forbidden, invalid, notFound, unauthorized } from "./errors.ts";
import { getPlayable } from "./courses.ts";

export const REPORT_REASONS = {
  wrong: "Wrong or misleading content",
  low_quality: "Low-quality or spam content",
  copyright: "Copyright infringement",
  harmful: "Harmful, hateful or inappropriate",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

/** Rate a course 1-5. Only learners who completed at least one lesson can rate. */
export async function rateCourse(db: DB, user: SessionUser | null, courseId: string, stars: number, review?: string) {
  if (!can.account(user)) throw unauthorized("Create a free account to rate courses.");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw invalid("Rate from 1 to 5 stars.");
  const course = await getPlayable(db, user, courseId);
  if (course.ownerId === user.id) throw forbidden("You can't rate your own course.");
  const [played] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.courseId, courseId)));
  if (!played.n) throw forbidden("Finish at least one lesson before rating.");
  await db
    .insert(ratings)
    .values({ userId: user.id, courseId, stars, review: review?.trim().slice(0, 1000) || null })
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.courseId],
      set: { stars, review: review?.trim().slice(0, 1000) || null, createdAt: new Date() },
    });
  const [agg] = await db
    .select({ avg: sql<number>`avg(${ratings.stars})::real`, n: sql<number>`count(*)::int` })
    .from(ratings)
    .where(eq(ratings.courseId, courseId));
  await db.update(courses).set({ ratingAvg: agg.avg, ratingCount: agg.n }).where(eq(courses.id, courseId));
  return agg;
}

export async function myRating(db: DB, userId: string, courseId: string) {
  const [r] = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.courseId, courseId)));
  return r ?? null;
}

export async function reportCourse(db: DB, user: SessionUser | null, courseId: string, reason: string, details = "") {
  if (!can.account(user)) throw unauthorized("Create a free account to report content.");
  if (!(reason in REPORT_REASONS)) throw invalid("Pick a reason.");
  await getPlayable(db, user, courseId);
  const recent = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.reporterId, user.id), eq(reports.courseId, courseId), eq(reports.status, "open")));
  if (recent[0].n) return { duplicate: true };
  await db.insert(reports).values({ courseId, reporterId: user.id, reason, details: details.trim().slice(0, 2000) });
  return { duplicate: false };
}

function requireModerator(user: SessionUser | null) {
  if (!user) throw unauthorized();
  if (!can.moderate(user)) throw forbidden("Moderators only.");
}

export async function listReports(db: DB, user: SessionUser | null, status: "open" | "resolved" | "dismissed" = "open") {
  requireModerator(user);
  return db
    .select({
      id: reports.id,
      courseId: reports.courseId,
      courseTitle: courses.title,
      courseStatus: courses.status,
      ownerId: courses.ownerId,
      ownerName: users.name,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      resolution: reports.resolution,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(courses, eq(courses.id, reports.courseId))
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export type ModerationAction = "dismiss" | "remove_course" | "restore_course" | "ban_owner";

export async function resolveReport(db: DB, user: SessionUser | null, reportId: number, action: ModerationAction, note = "") {
  requireModerator(user);
  const [r] = await db
    .select({ id: reports.id, courseId: reports.courseId, ownerId: courses.ownerId })
    .from(reports)
    .innerJoin(courses, eq(courses.id, reports.courseId))
    .where(eq(reports.id, reportId));
  if (!r) throw notFound("Report not found.");
  if (action === "remove_course" || action === "ban_owner")
    await db.update(courses).set({ status: "removed" }).where(eq(courses.id, r.courseId));
  if (action === "restore_course") await db.update(courses).set({ status: "published" }).where(eq(courses.id, r.courseId));
  if (action === "ban_owner") await setBanned(db, user, r.ownerId, true);
  const status = action === "dismiss" ? "dismissed" : "resolved";
  // Resolve every open report on this course at once.
  await db
    .update(reports)
    .set({ status, resolvedBy: user!.id, resolvedAt: new Date(), resolution: `${action}${note ? `: ${note.slice(0, 500)}` : ""}` })
    .where(and(eq(reports.courseId, r.courseId), eq(reports.status, "open")));
}

export async function setBanned(db: DB, user: SessionUser | null, targetId: string, banned: boolean) {
  requireModerator(user);
  const [t] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetId));
  if (!t) throw notFound("User not found.");
  if (t.role === "admin" || (t.role === "moderator" && !can.admin(user))) throw forbidden("You can't ban that account.");
  await db.update(users).set({ banned }).where(eq(users.id, targetId));
  if (banned) await deleteUserSessions(db, targetId);
}

export async function setRole(db: DB, user: SessionUser | null, targetId: string, role: "user" | "moderator" | "admin") {
  if (!can.admin(user)) throw forbidden("Admins only.");
  if (targetId === user!.id && role !== "admin") throw invalid("You can't remove your own admin role.");
  await db.update(users).set({ role }).where(eq(users.id, targetId));
}

export async function listUsers(db: DB, user: SessionUser | null, q = "") {
  requireModerator(user);
  const like = `%${q.trim().replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      xp: users.xp,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.isGuest, false),
        q.trim() ? sql`(${users.name} ilike ${like} or ${users.email} ilike ${like})` : sql`${users.passwordHash} <> '!'`,
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(100);
}
