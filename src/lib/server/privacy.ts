// GDPR data access: everything Kiln stores about a user, as JSON.
import { eq } from "drizzle-orm";
import type { DB } from "./db/index.ts";
import { activity, aiSettings, apiTokens, courses, lessonProgress, ratings, reports, users } from "./db/schema.ts";

export async function exportUserData(db: DB, userId: string) {
  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      xp: users.xp,
      streak: users.streak,
      lastActiveDay: users.lastActiveDay,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  const [progress, myRatings, myReports, myCourses, tokens, ai, log] = await Promise.all([
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId)),
    db.select().from(ratings).where(eq(ratings.userId, userId)),
    db
      .select({
        courseId: reports.courseId,
        reason: reports.reason,
        details: reports.details,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId)),
    db
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        visibility: courses.visibility,
        draft: courses.draft,
        createdAt: courses.createdAt,
      })
      .from(courses)
      .where(eq(courses.ownerId, userId)),
    db
      .select({
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId)),
    db
      .select({ provider: aiSettings.provider, model: aiSettings.model, baseUrl: aiSettings.baseUrl, updatedAt: aiSettings.updatedAt })
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId)),
    db.select().from(activity).where(eq(activity.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    progress,
    ratings: myRatings,
    reports: myReports,
    courses: myCourses,
    apiTokens: tokens,
    aiSettings: ai,
    activity: log,
  };
}
