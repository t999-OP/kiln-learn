import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CourseContent } from "#lib/core/schema.ts";
import type { QualityReport } from "#lib/core/quality.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["user", "moderator", "admin"]);
export const visibilityEnum = pgEnum("visibility", ["public", "unlisted", "private"]);
export const courseStatusEnum = pgEnum("course_status", ["draft", "published", "removed"]);
export const reportStatusEnum = pgEnum("report_status", ["open", "resolved", "dismissed"]);
export const aiProviderEnum = pgEnum("ai_provider", ["anthropic", "openai", "openrouter", "ollama", "openai_compatible"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for guest learners, who have no credentials. */
    email: text("email"),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Anonymous learner created on first lesson; becomes a real account on sign-up. */
    isGuest: boolean("is_guest").notNull().default(false),
    role: roleEnum("role").notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    xp: integer("xp").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    lastActiveDay: date("last_active_day"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`), index("users_guest_idx").on(t.isGuest, t.lastActiveDay)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type Provenance = { kind: "human" } | { kind: "agent"; agent: string; model?: string };

export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull().default(""),
    languages: jsonb("languages").$type<{ target: string; source: string }>(),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    status: courseStatusEnum("status").notNull().default("draft"),
    license: text("license").notNull().default("CC-BY-SA-4.0"),
    provenance: jsonb("provenance").$type<Provenance>().notNull().default({ kind: "human" }),
    /** Working copy edited in the Studio and via MCP. Learners never see it directly. */
    draft: jsonb("draft").$type<CourseContent>().notNull().default({ units: [] }),
    draftRevision: integer("draft_revision").notNull().default(0),
    /** Latest published version learners play (null until first publish). */
    publishedVersion: integer("published_version"),
    qualityScore: integer("quality_score").notNull().default(0),
    qualityRank: text("quality_rank").notNull().default("Draft"),
    ratingAvg: real("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("courses_owner_idx").on(t.ownerId), index("courses_catalog_idx").on(t.status, t.visibility, t.qualityScore)],
);

/** Immutable published snapshots. Learners mid-course keep the version they started. */
export const courseVersions = pgTable(
  "course_versions",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    languages: jsonb("languages").$type<{ target: string; source: string }>(),
    content: jsonb("content").$type<CourseContent>().notNull(),
    quality: jsonb("quality").$type<Pick<QualityReport, "score" | "rank" | "lessons" | "steps">>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.version] })],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    bestAccuracy: smallint("best_accuracy").notNull(),
    plays: integer("plays").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId, t.lessonId] })],
);

/** Aggregated first-try results per step: the "learning data" quality stage. */
export const stepStats = pgTable(
  "step_stats",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    lessonId: text("lesson_id").notNull(),
    step: smallint("step").notNull(),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.version, t.lessonId, t.step] })],
);

export const ratings = pgTable(
  "ratings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    stars: smallint("stars").notNull(),
    review: text("review"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

export const reports = pgTable(
  "reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: reportStatusEnum("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

/** Personal access tokens for MCP agents and the API. Only the hash is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters, shown in the UI so users can tell tokens apart. */
    prefix: text("prefix").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/** Bring-your-own-key AI settings. The key is encrypted with the server secret (AES-256-GCM). */
export const aiSettings = pgTable("ai_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: aiProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  baseUrl: text("base_url"),
  apiKeyEnc: text("api_key_enc"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activity = pgTable(
  "activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    courseId: text("course_id"),
    agent: text("agent").notNull(),
    tool: text("tool").notNull(),
    ok: boolean("ok").notNull(),
    summary: text("summary").notNull().default(""),
    at: createdAt(),
  },
  (t) => [index("activity_user_idx").on(t.userId, t.at)],
);
