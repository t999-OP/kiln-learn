// AI features as the Studio and API use them: load the user's provider, generate, save to the draft.
import type { SessionUser } from "../auth.ts";
import type { DB } from "../db/index.ts";
import { invalid, unauthorized } from "../errors.ts";
import { rateLimit } from "../ratelimit.ts";
import { logActivity } from "../activity.ts";
import { findLesson, getForEdit, shortId, upsertLesson } from "../courses.ts";
import { stepStatsFor } from "../progress.ts";
import type { CourseMeta } from "#lib/core/schema.ts";
import { AiError } from "./providers.ts";
import { draftLesson, reviseLesson } from "./lessons.ts";
import { getAiConfig, type AiConfig } from "./settings.ts";

async function setup(db: DB, user: SessionUser | null, courseId: string) {
  if (!user || user.guest) throw unauthorized("Create a free account to use the AI assistant.");
  const limit = rateLimit(`ai:${user.id}`, Number(process.env.KILN_AI_HOURLY_LIMIT ?? 30), 60 * 60_000);
  if (!limit.ok) throw new AiError(`AI limit reached. Try again in ${Math.ceil(limit.retryAfter / 60)} min.`, 429);
  const cfg = await getAiConfig(db, user.id);
  if (!cfg) throw new AiError("Connect an AI model first in Settings → AI models.", 400);
  const { course } = await getForEdit(db, user, courseId);
  const meta: CourseMeta = {
    title: course.title,
    subject: course.subject as CourseMeta["subject"],
    description: course.description,
    ...(course.languages ? { languages: course.languages } : {}),
  };
  return { cfg, course, meta };
}

const agentName = (cfg: AiConfig) => `AI assistant · ${cfg.model}`;

async function run<T extends { lessonId: string; title: string; steps: number }>(
  db: DB,
  user: SessionUser,
  cfg: AiConfig,
  courseId: string,
  tool: string,
  fn: () => Promise<T>,
) {
  try {
    const r = await fn();
    await logActivity(db, {
      userId: user.id,
      courseId,
      agent: agentName(cfg),
      tool,
      ok: true,
      summary: `${tool === "draft_lesson" ? "drafted" : "revised"} "${r.title}" (${r.steps} steps)`,
    });
    return r;
  } catch (e) {
    await logActivity(db, { userId: user.id, courseId, agent: agentName(cfg), tool, ok: false, summary: (e as Error).message });
    throw e;
  }
}

export async function aiDraftLesson(
  db: DB,
  user: SessionUser | null,
  courseId: string,
  input: { unitId: string; instructions: string; source?: string },
) {
  const { cfg, course, meta } = await setup(db, user, courseId);
  const unit = course.draft.units.find((u) => u.id === input.unitId);
  if (!unit) throw invalid("Pick a unit for the new lesson.");
  return run(db, user!, cfg, courseId, "draft_lesson", async () => {
    const { lesson, issues, dropped } = await draftLesson(
      cfg,
      { meta, content: course.draft, unitTitle: unit.title },
      { ...input, lessonId: shortId("l") },
    );
    const saved = await upsertLesson(db, user, courseId, input.unitId, {
      title: lesson.title,
      concepts: lesson.concepts,
      steps: lesson.steps,
    });
    return {
      lessonId: saved.lessonId,
      title: lesson.title,
      steps: lesson.steps.length,
      issues,
      dropped,
      revision: saved.course.draftRevision,
    };
  });
}

export async function aiReviseLesson(db: DB, user: SessionUser | null, courseId: string, lessonId: string, instructions: string) {
  const { cfg, course, meta } = await setup(db, user, courseId);
  const found = findLesson(course.draft, lessonId);
  if (!found) throw invalid("Lesson not found.");
  const stats = course.publishedVersion ? ((await stepStatsFor(db, courseId, course.publishedVersion))[lessonId] ?? {}) : {};
  const weakSteps = Object.entries(stats)
    .map(([step, s]) => ({ step: Number(step), correctRate: s.correct / s.attempts, attempts: s.attempts }))
    .filter((w) => w.attempts >= 5 && w.correctRate < 0.6);
  return run(db, user!, cfg, courseId, "revise_lesson", async () => {
    const { lesson, issues, dropped } = await reviseLesson(
      cfg,
      { meta, content: course.draft, unitTitle: found.unit.title },
      { lesson: found.lesson, instructions, weakSteps },
    );
    const saved = await upsertLesson(db, user, courseId, found.unit.id, {
      lessonId,
      title: lesson.title,
      concepts: lesson.concepts,
      steps: lesson.steps,
    });
    return { lessonId, title: lesson.title, steps: lesson.steps.length, issues, dropped, revision: saved.course.draftRevision };
  });
}
