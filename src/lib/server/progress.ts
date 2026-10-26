// Learner progress, XP and streaks, plus the per-step learning data creators and agents use
// to find weak exercises (quality pipeline stage 2).
import { and, eq, sql } from "drizzle-orm";
import { STEP_TYPES } from "#lib/core/catalog.ts";
import type { SessionUser } from "./auth.ts";
import type { DB } from "./db/index.ts";
import { lessonProgress, stepStats, users } from "./db/schema.ts";
import { invalid, ServiceError, unauthorized } from "./errors.ts";
import { rateLimit } from "./ratelimit.ts";
import { findLesson, getPlayable } from "./courses.ts";

export interface LessonResult {
  courseId: string;
  version: number;
  lessonId: string;
  /** First-try correctness for each graded step index. */
  results: { step: number; correct: boolean }[];
  /** Learner's local calendar day (YYYY-MM-DD), so streaks follow their timezone. */
  day: string;
}

export const xpFor = (accuracy: number) => 10 + Math.round(accuracy / 10) + (accuracy === 100 ? 5 : 0);

function dayOffset(day: string, from: Date) {
  return Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(from.toISOString().slice(0, 10) + "T00:00:00Z")) / 86_400_000);
}

export async function completeLesson(db: DB, user: SessionUser | null, r: LessonResult) {
  if (!user) throw unauthorized("Sign in to save your progress.");
  if (!rateLimit(`progress:${user.id}`, 120, 60 * 60_000).ok)
    throw new ServiceError(429, "That's a lot of lessons in an hour — take a short break and try again.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day) || Math.abs(dayOffset(r.day, new Date())) > 1) throw invalid("Invalid day.");
  const course = await getPlayable(db, user, r.courseId, { version: r.version });
  if (course.preview || course.version !== r.version) throw invalid("That version of the course isn't available.");
  const found = findLesson(course.content, r.lessonId);
  if (!found) throw invalid("Unknown lesson.");
  const steps = found.lesson.steps;

  // Only accept results for real, graded steps, once each.
  const seen = new Set<number>();
  const results = r.results.filter(
    (x) =>
      Number.isInteger(x.step) &&
      x.step >= 0 &&
      x.step < steps.length &&
      STEP_TYPES[steps[x.step].type].graded &&
      !seen.has(x.step) &&
      seen.add(x.step),
  );
  const accuracy = results.length ? Math.round((results.filter((x) => x.correct).length / results.length) * 100) : 100;
  const xp = xpFor(accuracy);

  await db
    .insert(lessonProgress)
    .values({ userId: user.id, courseId: r.courseId, lessonId: r.lessonId, version: r.version, bestAccuracy: accuracy, xp })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.courseId, lessonProgress.lessonId],
      set: {
        version: r.version,
        bestAccuracy: sql`greatest(${lessonProgress.bestAccuracy}, ${accuracy})`,
        plays: sql`${lessonProgress.plays} + 1`,
        xp: sql`${lessonProgress.xp} + ${xp}`,
        completedAt: new Date(),
      },
    });

  for (const x of results)
    await db
      .insert(stepStats)
      .values({ courseId: r.courseId, version: r.version, lessonId: r.lessonId, step: x.step, attempts: 1, correct: x.correct ? 1 : 0 })
      .onConflictDoUpdate({
        target: [stepStats.courseId, stepStats.version, stepStats.lessonId, stepStats.step],
        set: { attempts: sql`${stepStats.attempts} + 1`, correct: sql`${stepStats.correct} + ${x.correct ? 1 : 0}` },
      });

  // Streak: +1 if last active yesterday (learner's calendar), unchanged if today, else reset to 1.
  const last = user.lastActiveDay;
  const gap = last ? dayOffset(r.day, new Date(last + "T00:00:00Z")) : null;
  const streak = gap === 0 ? user.streak : gap === 1 ? user.streak + 1 : 1;
  const [u] = await db
    .update(users)
    .set({
      xp: sql`${users.xp} + ${xp}`,
      streak: gap !== null && gap < 0 ? user.streak : streak,
      lastActiveDay: gap !== null && gap < 0 ? last : r.day,
    })
    .where(eq(users.id, user.id))
    .returning({ xp: users.xp, streak: users.streak });
  return { xp, accuracy, totalXp: u.xp, streak: u.streak };
}

export async function courseProgress(db: DB, userId: string, courseId: string) {
  const rows = await db
    .select({ lessonId: lessonProgress.lessonId, bestAccuracy: lessonProgress.bestAccuracy, plays: lessonProgress.plays })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.courseId, courseId)));
  return Object.fromEntries(rows.map((r) => [r.lessonId, r]));
}

/** Courses the user has started, with completed-lesson counts. */
export async function startedCourses(db: DB, userId: string) {
  return db
    .select({ courseId: lessonProgress.courseId, done: sql<number>`count(*)::int`, last: sql<Date>`max(${lessonProgress.completedAt})` })
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, userId))
    .groupBy(lessonProgress.courseId)
    .orderBy(sql`max(${lessonProgress.completedAt}) desc`);
}

/** Per-step first-try success for one version: { lessonId: { stepIndex: { attempts, correct } } }. */
export async function stepStatsFor(db: DB, courseId: string, version: number) {
  const rows = await db
    .select()
    .from(stepStats)
    .where(and(eq(stepStats.courseId, courseId), eq(stepStats.version, version)));
  const out: Record<string, Record<number, { attempts: number; correct: number }>> = {};
  for (const r of rows) (out[r.lessonId] ??= {})[r.step] = { attempts: r.attempts, correct: r.correct };
  return out;
}

export async function leaderboard(db: DB, limit = 20) {
  return db
    .select({ id: users.id, name: users.name, xp: users.xp, streak: users.streak })
    .from(users)
    .where(and(eq(users.banned, false), eq(users.isGuest, false), sql`${users.xp} > 0`))
    .orderBy(sql`${users.xp} desc`)
    .limit(limit);
}
