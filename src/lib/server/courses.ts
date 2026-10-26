// Course lifecycle: create → edit draft (Studio or MCP) → publish immutable versions → learners play.
import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { assessCourse, type QualityReport } from "#lib/core/quality.ts";
import { CourseContentSchema, CourseMetaSchema, LessonSchema, type CourseContent, type CourseMeta, type Lesson } from "#lib/core/schema.ts";
import type { SessionUser } from "./auth.ts";
import { can } from "./auth.ts";
import type { DB } from "./db/index.ts";
import { courseVersions, courses, users, type Provenance } from "./db/schema.ts";
import { conflict, forbidden, invalid, notFound, unauthorized } from "./errors.ts";

export const OPEN_LICENSE = "CC-BY-SA-4.0";
export const CLOSED_LICENSE = "All rights reserved";

export type Visibility = "public" | "unlisted" | "private";
export type CourseRow = typeof courses.$inferSelect;

export const shortId = (prefix: string) => `${prefix}-${randomBytes(4).toString("hex")}`;

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "course";

const isOwner = (u: SessionUser | null, c: Pick<CourseRow, "ownerId">) => !!u && u.id === c.ownerId;
export const canEdit = (u: SessionUser | null, c: Pick<CourseRow, "ownerId">) => isOwner(u, c) || can.moderate(u);

/** Who may see a course's published version. */
export function canView(u: SessionUser | null, c: Pick<CourseRow, "ownerId" | "status" | "visibility">) {
  if (canEdit(u, c)) return true;
  return c.status === "published" && c.visibility !== "private";
}

function zodMessage(e: { issues: { path: PropertyKey[]; message: string }[] }) {
  return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

export function parseContent(content: unknown): CourseContent {
  const r = CourseContentSchema.safeParse(content);
  if (!r.success) throw invalid(`Invalid course content — ${zodMessage(r.error)}`, r.error.issues);
  return r.data;
}

export function parseMeta(meta: unknown): CourseMeta {
  const r = CourseMetaSchema.safeParse(meta);
  if (!r.success) throw invalid(`Invalid course details — ${zodMessage(r.error)}`, r.error.issues);
  return r.data;
}

export const docOf = (c: Pick<CourseRow, "title" | "subject" | "description" | "languages" | "draft">) =>
  ({
    title: c.title,
    subject: c.subject as CourseMeta["subject"],
    description: c.description,
    ...(c.languages ? { languages: c.languages } : {}),
    units: c.draft.units,
  }) satisfies CourseMeta & CourseContent;

export async function createCourse(
  db: DB,
  user: SessionUser | null,
  input: { meta: unknown; content?: unknown; provenance?: Provenance; visibility?: Visibility },
): Promise<CourseRow> {
  if (!can.account(user)) throw unauthorized("Create a free account to make courses.");
  const meta = parseMeta(input.meta);
  const content = input.content === undefined ? { units: [] } : parseContent(input.content);
  const base = slugify(meta.title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const [row] = await db
      .insert(courses)
      .values({
        id,
        ownerId: user.id,
        title: meta.title,
        subject: meta.subject,
        description: meta.description,
        languages: meta.languages ?? null,
        visibility: input.visibility ?? "public",
        license: input.visibility === "private" ? CLOSED_LICENSE : OPEN_LICENSE,
        provenance: input.provenance ?? { kind: "human" },
        draft: content,
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw conflict("Couldn't find a free id for this course title.");
}

async function load(db: DB, id: string): Promise<CourseRow> {
  const [row] = await db.select().from(courses).where(eq(courses.id, id));
  if (!row) throw notFound(`Course "${id}" not found.`);
  return row;
}

export async function getForEdit(db: DB, user: SessionUser | null, id: string) {
  const row = await load(db, id);
  if (!canEdit(user, row)) throw user ? forbidden("Only the course's creator can edit it.") : unauthorized();
  return { course: row, quality: assessCourse(docOf(row)) };
}

/**
 * Save the working copy. Pass baseRevision (from the last load) to detect concurrent edits,
 * e.g. an agent changing the course while it's open in the Studio.
 */
export async function saveDraft(
  db: DB,
  user: SessionUser | null,
  id: string,
  input: { meta?: unknown; content?: unknown; baseRevision?: number },
): Promise<{ course: CourseRow; quality: QualityReport }> {
  const row = await load(db, id);
  if (!canEdit(user, row)) throw user ? forbidden("Only the course's creator can edit it.") : unauthorized();
  const patch: Partial<typeof courses.$inferInsert> = { updatedAt: new Date() };
  if (input.meta !== undefined) {
    const meta = parseMeta(input.meta);
    Object.assign(patch, { title: meta.title, subject: meta.subject, description: meta.description, languages: meta.languages ?? null });
  }
  if (input.content !== undefined) patch.draft = parseContent(input.content);
  const base = input.baseRevision ?? row.draftRevision;
  const [saved] = await db
    .update(courses)
    .set({ ...patch, draftRevision: sql`${courses.draftRevision} + 1` })
    .where(and(eq(courses.id, id), eq(courses.draftRevision, base)))
    .returning();
  if (!saved) throw conflict("This course was changed somewhere else (maybe by an agent). Reload to get the latest version.");
  return { course: saved, quality: assessCourse(docOf(saved)) };
}

/** Read-modify-write on the draft with optimistic concurrency, retried on conflict. */
export async function updateDraft(db: DB, user: SessionUser | null, id: string, change: (content: CourseContent) => CourseContent | void) {
  for (let attempt = 0; ; attempt++) {
    const { course } = await getForEdit(db, user, id);
    const content = structuredClone(course.draft);
    const next = change(content) ?? content;
    try {
      return await saveDraft(db, user, id, { content: next, baseRevision: course.draftRevision });
    } catch (e) {
      if (attempt < 3 && (e as { status?: number }).status === 409) continue;
      throw e;
    }
  }
}

export async function updateSettings(db: DB, user: SessionUser | null, id: string, input: { visibility?: Visibility }) {
  const { course } = await getForEdit(db, user, id);
  const visibility = input.visibility ?? course.visibility;
  const [row] = await db
    .update(courses)
    .set({ visibility, license: visibility === "private" ? CLOSED_LICENSE : OPEN_LICENSE, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  return row;
}

/** Snapshot the draft as a new immutable version. Only publishable (error-free) drafts qualify. */
export async function publish(db: DB, user: SessionUser | null, id: string) {
  const { course, quality } = await getForEdit(db, user, id);
  if (course.status === "removed" && !can.moderate(user)) throw forbidden("This course was removed by a moderator.");
  if (!quality.publishable)
    throw invalid(
      `Fix ${quality.errors} error${quality.errors === 1 ? "" : "s"} before publishing.`,
      quality.issues.filter((i) => i.level === "error"),
    );
  const version = (course.publishedVersion ?? 0) + 1;
  await db.insert(courseVersions).values({
    courseId: id,
    version,
    title: course.title,
    subject: course.subject,
    description: course.description,
    languages: course.languages,
    content: course.draft,
    quality: { score: quality.score, rank: quality.rank, lessons: quality.lessons, steps: quality.steps },
    publishedBy: user!.id,
  });
  const [row] = await db
    .update(courses)
    .set({ status: "published", publishedVersion: version, qualityScore: quality.score, qualityRank: quality.rank, updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  return { course: row, version, quality };
}

export async function unpublish(db: DB, user: SessionUser | null, id: string) {
  await getForEdit(db, user, id);
  await db.update(courses).set({ status: "draft", updatedAt: new Date() }).where(eq(courses.id, id));
}

export async function deleteCourse(db: DB, user: SessionUser | null, id: string) {
  const row = await load(db, id);
  if (!isOwner(user, row) && !can.admin(user)) throw forbidden("Only the creator or an admin can delete a course.");
  await db.delete(courses).where(eq(courses.id, id));
}

export interface CatalogEntry {
  id: string;
  title: string;
  subject: string;
  description: string;
  visibility: Visibility;
  status: CourseRow["status"];
  license: string;
  provenance: Provenance;
  publishedVersion: number | null;
  qualityScore: number;
  qualityRank: string;
  ratingAvg: number | null;
  ratingCount: number;
  ownerId: string;
  ownerName: string;
  updatedAt: Date;
  lessons: number;
}

const catalogColumns = {
  id: courses.id,
  title: courses.title,
  subject: courses.subject,
  description: courses.description,
  visibility: courses.visibility,
  status: courses.status,
  license: courses.license,
  provenance: courses.provenance,
  publishedVersion: courses.publishedVersion,
  qualityScore: courses.qualityScore,
  qualityRank: courses.qualityRank,
  ratingAvg: courses.ratingAvg,
  ratingCount: courses.ratingCount,
  ownerId: courses.ownerId,
  ownerName: users.name,
  updatedAt: courses.updatedAt,
  lessons: sql<number>`coalesce((select (cv.quality->>'lessons')::int from ${courseVersions} cv where cv.course_id = ${courses.id} and cv.version = ${courses.publishedVersion}), 0)`,
};

/** Public catalog: published, public courses ranked by quality, then ratings. */
export async function listCatalog(
  db: DB,
  opts: { subject?: string; q?: string; ownerId?: string; limit?: number; offset?: number } = {},
): Promise<CatalogEntry[]> {
  const where: SQL[] = [eq(courses.status, "published"), eq(courses.visibility, "public")];
  if (opts.subject) where.push(eq(courses.subject, opts.subject));
  if (opts.ownerId) where.push(eq(courses.ownerId, opts.ownerId));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim().replace(/[%_\\]/g, (m) => "\\" + m)}%`;
    where.push(or(ilike(courses.title, q), ilike(courses.description, q))!);
  }
  return db
    .select(catalogColumns)
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(and(...where))
    .orderBy(desc(courses.qualityScore), sql`${courses.ratingAvg} desc nulls last`, desc(courses.updatedAt))
    .limit(Math.min(opts.limit ?? 60, 100))
    .offset(opts.offset ?? 0);
}

/** Courses the user created (all states). */
export async function listOwned(db: DB, user: SessionUser): Promise<CatalogEntry[]> {
  return db
    .select(catalogColumns)
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(eq(courses.ownerId, user.id))
    .orderBy(desc(courses.updatedAt));
}

export async function listByIds(db: DB, ids: string[]): Promise<CatalogEntry[]> {
  if (!ids.length) return [];
  return db.select(catalogColumns).from(courses).innerJoin(users, eq(users.id, courses.ownerId)).where(inArray(courses.id, ids));
}

export interface PlayableCourse {
  id: string;
  version: number;
  title: string;
  subject: CourseMeta["subject"];
  description: string;
  languages: { target: string; source: string } | null;
  content: CourseContent;
  quality: { score: number; rank: string; lessons: number; steps: number };
  license: string;
  provenance: Provenance;
  ownerId: string;
  ownerName: string;
  visibility: Visibility;
  status: CourseRow["status"];
  ratingAvg: number | null;
  ratingCount: number;
  /** True when the viewer is looking at the draft (creator preview). */
  preview: boolean;
}

/**
 * A course as learners see it: the requested (or latest) published version.
 * Creators can pass preview=true to play their unpublished draft.
 */
export async function getPlayable(
  db: DB,
  user: SessionUser | null,
  id: string,
  opts: { version?: number; preview?: boolean } = {},
): Promise<PlayableCourse> {
  const [row] = await db
    .select({ course: courses, ownerName: users.name })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.ownerId))
    .where(eq(courses.id, id));
  if (!row || !canView(user, row.course)) throw notFound(`Course "${id}" not found.`);
  const c = row.course;
  const base = {
    id: c.id,
    license: c.license,
    provenance: c.provenance,
    ownerId: c.ownerId,
    ownerName: row.ownerName,
    visibility: c.visibility,
    status: c.status,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
  };
  if (opts.preview || !c.publishedVersion) {
    if (!canEdit(user, c)) throw notFound(`Course "${id}" not found.`);
    const q = assessCourse(docOf(c));
    return {
      ...base,
      version: 0,
      title: c.title,
      subject: c.subject as CourseMeta["subject"],
      description: c.description,
      languages: c.languages,
      content: c.draft,
      quality: { score: q.score, rank: q.rank, lessons: q.lessons, steps: q.steps },
      preview: true,
    };
  }
  const version = opts.version && opts.version <= c.publishedVersion ? opts.version : c.publishedVersion;
  const [v] = await db
    .select()
    .from(courseVersions)
    .where(and(eq(courseVersions.courseId, id), eq(courseVersions.version, version)));
  if (!v) throw notFound(`Version ${version} of "${id}" not found.`);
  return {
    ...base,
    version,
    title: v.title,
    subject: v.subject as CourseMeta["subject"],
    description: v.description,
    languages: v.languages,
    content: v.content,
    quality: v.quality,
    preview: false,
  };
}

export const findLesson = (content: CourseContent, lessonId: string) => {
  for (const unit of content.units) {
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    if (lesson) return { unit, lesson };
  }
  return null;
};

// ---- Fine-grained draft edits (used by MCP agents and the AI assistant) ----

export async function addUnit(db: DB, user: SessionUser | null, id: string, title: string) {
  const unitId = shortId("u");
  await updateDraft(db, user, id, (c) => {
    c.units.push({ id: unitId, title, lessons: [] });
  });
  return unitId;
}

export async function upsertLesson(
  db: DB,
  user: SessionUser | null,
  id: string,
  unitId: string,
  input: { lessonId?: string; title: string; concepts?: string[]; steps: unknown },
) {
  const lessonId = input.lessonId ?? shortId("l");
  const parsed = LessonSchema.safeParse({ id: lessonId, title: input.title, concepts: input.concepts ?? [], steps: input.steps });
  if (!parsed.success) throw invalid(`Invalid lesson — ${zodMessage(parsed.error)}`, parsed.error.issues);
  const lesson: Lesson = parsed.data;
  const result = await updateDraft(db, user, id, (c) => {
    const unit = c.units.find((u) => u.id === unitId);
    if (!unit)
      throw notFound(
        `Unit "${unitId}" not found. Units: ${c.units.map((u) => `${u.id} (${u.title})`).join(", ") || "none — call add_unit first"}.`,
      );
    const existing = unit.lessons.findIndex((l) => l.id === lessonId);
    if (existing >= 0) unit.lessons[existing] = lesson;
    else if (input.lessonId && findLesson(c, input.lessonId)) throw invalid(`Lesson "${input.lessonId}" belongs to a different unit.`);
    else unit.lessons.push(lesson);
  });
  return { lessonId, ...result };
}

export async function deleteLesson(db: DB, user: SessionUser | null, id: string, lessonId: string) {
  return updateDraft(db, user, id, (c) => {
    if (!findLesson(c, lessonId)) throw notFound(`Lesson "${lessonId}" not found.`);
    for (const u of c.units) u.lessons = u.lessons.filter((l) => l.id !== lessonId);
  });
}

export async function listVersions(db: DB, user: SessionUser | null, id: string) {
  await getForEdit(db, user, id);
  return db
    .select({ version: courseVersions.version, publishedAt: courseVersions.publishedAt, quality: courseVersions.quality })
    .from(courseVersions)
    .where(eq(courseVersions.courseId, id))
    .orderBy(desc(courseVersions.version));
}
