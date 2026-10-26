// Audit trail of agent and AI actions, shown on the Agents page.
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "./db/index.ts";
import { activity } from "./db/schema.ts";

export async function logActivity(
  db: DB,
  entry: { userId: string | null; courseId?: string | null; agent: string; tool: string; ok: boolean; summary: string },
) {
  await db.insert(activity).values({ ...entry, courseId: entry.courseId ?? null, summary: entry.summary.slice(0, 500) });
}

export async function recentActivity(db: DB, userId: string, limit = 50, afterId = 0) {
  const rows = await db
    .select()
    .from(activity)
    .where(and(eq(activity.userId, userId)))
    .orderBy(desc(activity.id))
    .limit(limit);
  return rows.filter((r) => r.id > afterId);
}
