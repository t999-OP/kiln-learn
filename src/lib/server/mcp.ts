// MCP server: lets any agent (Claude Code, Cursor, Kimi, local models…) author courses as the
// user who owns the API token. Every write runs the same quality pipeline as the Studio.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SUBJECTS, WIDGETS } from "#lib/core/catalog.ts";
import { authoringGuide } from "#lib/core/guide.ts";
import type { QualityReport } from "#lib/core/quality.ts";
import { CourseMetaSchema, StepSchema } from "#lib/core/schema.ts";
import type { SessionUser } from "./auth.ts";
import { logActivity } from "./activity.ts";
import * as courses from "./courses.ts";
import type { DB } from "./db/index.ts";
import { ServiceError } from "./errors.ts";
import { stepStatsFor } from "./progress.ts";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

const summarize = (q: QualityReport) => ({
  score: q.score,
  rank: q.rank,
  publishable: q.publishable,
  errors: q.issues.filter((i) => i.level === "error").map(({ where, msg }) => ({ where, msg })),
  warnings: q.issues.filter((i) => i.level === "warning").map(({ where, msg }) => ({ where, msg })),
});

export interface McpContext {
  db: DB;
  user: SessionUser;
  tokenName: string;
}

export function buildMcpServer(ctx: McpContext) {
  const server = new McpServer(
    { name: "kiln", version: "1.0.0" },
    {
      instructions:
        "Kiln is an open platform for Duolingo/Brilliant-style interactive lessons. Call get_authoring_guide first, then create_course → add_unit → upsert_lesson. Every write returns a quality report; fix errors and aim for rank Gold, then publish_course when the user wants learners to see it.",
    },
  );
  const { db, user } = ctx;
  const agent = () => {
    const client = server.server.getClientVersion()?.name;
    return client ? `${client} (${ctx.tokenName})` : ctx.tokenName;
  };

  // Every tool: log to the activity feed and turn service errors into tool errors the agent can act on.
  const tool = <Args extends z.ZodRawShape>(
    name: string,
    config: { title: string; description: string; inputSchema?: Args; annotations?: Record<string, boolean> },
    handler: (args: z.infer<z.ZodObject<Args>>) => Promise<{ data: unknown; summary: string; courseId?: string }>,
  ) =>
    server.registerTool(
      name,
      config as never,
      (async (args: z.infer<z.ZodObject<Args>>) => {
        try {
          const r = await handler(args);
          if (!config.annotations?.readOnlyHint)
            await logActivity(db, { userId: user.id, courseId: r.courseId, agent: agent(), tool: name, ok: true, summary: r.summary });
          return json(r.data);
        } catch (e) {
          const message =
            e instanceof ServiceError ? `${e.message}${e.details ? `\n${JSON.stringify(e.details, null, 2)}` : ""}` : (e as Error).message;
          await logActivity(db, {
            userId: user.id,
            courseId: (args as { courseId?: string }).courseId,
            agent: agent(),
            tool: name,
            ok: false,
            summary: message.split("\n")[0],
          });
          return { isError: true, content: [{ type: "text" as const, text: message }] };
        }
      }) as never,
    );

  tool(
    "get_authoring_guide",
    {
      title: "Authoring guide",
      description:
        "The Kiln lesson format, all step types, widgets, math syntax, quality rules and examples. Read this before creating content.",
      annotations: { readOnlyHint: true },
    },
    async () => ({ data: authoringGuide(), summary: "read the guide" }),
  );

  tool(
    "list_widgets",
    {
      title: "List widgets",
      description: "Interactive widgets usable in `widget` steps, with their params.",
      annotations: { readOnlyHint: true },
    },
    async () => ({ data: WIDGETS, summary: "listed widgets" }),
  );

  tool(
    "list_my_courses",
    {
      title: "My courses",
      description: "Courses owned by the user this token belongs to, in every state.",
      annotations: { readOnlyHint: true },
    },
    async () => ({
      data: (await courses.listOwned(db, user)).map((c) => ({
        id: c.id,
        title: c.title,
        subject: c.subject,
        status: c.status,
        visibility: c.visibility,
        publishedVersion: c.publishedVersion,
        rank: c.qualityRank,
        score: c.qualityScore,
      })),
      summary: "listed courses",
    }),
  );

  tool(
    "search_catalog",
    {
      title: "Search catalog",
      description: "Search published public courses (to avoid duplicates or find inspiration).",
      inputSchema: { query: z.string().optional(), subject: z.enum(SUBJECTS).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, subject }) => ({
      data: (await courses.listCatalog(db, { q: query, subject, limit: 30 })).map((c) => ({
        id: c.id,
        title: c.title,
        subject: c.subject,
        by: c.ownerName,
        rank: c.qualityRank,
        lessons: c.lessons,
      })),
      summary: "searched catalog",
    }),
  );

  tool(
    "get_course",
    {
      title: "Get course draft",
      description: "Full working copy of a course you can edit (units, lessons, steps) plus its quality report.",
      inputSchema: { courseId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ courseId }) => {
      const { course, quality } = await courses.getForEdit(db, user, courseId);
      return {
        data: {
          id: course.id,
          title: course.title,
          subject: course.subject,
          description: course.description,
          languages: course.languages,
          status: course.status,
          visibility: course.visibility,
          publishedVersion: course.publishedVersion,
          units: course.draft.units,
          quality: summarize(quality),
        },
        summary: `read ${courseId}`,
      };
    },
  );

  tool(
    "create_course",
    {
      title: "Create course",
      description: "Create an empty course draft owned by the user. Returns its id. Public courses are licensed CC BY-SA 4.0.",
      inputSchema: {
        ...CourseMetaSchema.shape,
        description: z.string().describe("1-2 sentences: who it's for and what they'll be able to do"),
        visibility: z.enum(["public", "unlisted", "private"]).optional(),
        model: z.string().optional().describe("Your model id, shown as provenance"),
      },
    },
    async ({ model, visibility, ...meta }) => {
      const c = await courses.createCourse(db, user, {
        meta,
        visibility,
        provenance: { kind: "agent", agent: server.server.getClientVersion()?.name ?? ctx.tokenName, ...(model ? { model } : {}) },
      });
      return { data: { courseId: c.id, next: "add_unit, then upsert_lesson" }, summary: `created "${c.title}"`, courseId: c.id };
    },
  );

  tool(
    "update_course",
    {
      title: "Update course details",
      description: "Change title, subject, description, languages or visibility.",
      inputSchema: {
        courseId: z.string(),
        ...CourseMetaSchema.partial().shape,
        visibility: z.enum(["public", "unlisted", "private"]).optional(),
      },
    },
    async ({ courseId, visibility, ...patch }) => {
      const { course } = await courses.getForEdit(db, user, courseId);
      const meta = {
        title: course.title,
        subject: course.subject,
        description: course.description,
        languages: course.languages ?? undefined,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      };
      const r = await courses.saveDraft(db, user, courseId, { meta });
      if (visibility) await courses.updateSettings(db, user, courseId, { visibility });
      return { data: { ok: true, quality: summarize(r.quality) }, summary: `updated ${courseId}`, courseId };
    },
  );

  tool(
    "add_unit",
    {
      title: "Add unit",
      description: "Append a unit (a themed group of lessons) to a course.",
      inputSchema: { courseId: z.string(), title: z.string() },
    },
    async ({ courseId, title }) => ({
      data: { unitId: await courses.addUnit(db, user, courseId, title) },
      summary: `added unit "${title}"`,
      courseId,
    }),
  );

  tool(
    "upsert_lesson",
    {
      title: "Create or replace lesson",
      description:
        "Create a lesson in a unit, or replace one by lessonId. Pass ALL steps. Returns the quality report for the lesson — fix any errors it lists.",
      inputSchema: {
        courseId: z.string(),
        unitId: z.string(),
        lessonId: z.string().optional().describe("Omit to create a new lesson"),
        title: z.string(),
        concepts: z.array(z.string()).optional().describe("Shared concept ids, e.g. es:hola, calc:derivative"),
        steps: z.array(StepSchema).min(1),
      },
    },
    async ({ courseId, unitId, lessonId, title, concepts, steps }) => {
      const r = await courses.upsertLesson(db, user, courseId, unitId, { lessonId, title, concepts, steps });
      const mine = r.quality.issues.filter((i) => i.lessonId === r.lessonId).map(({ level, where, msg }) => ({ level, where, msg }));
      return {
        data: {
          lessonId: r.lessonId,
          lessonIssues: mine,
          course: { score: r.quality.score, rank: r.quality.rank, publishable: r.quality.publishable },
        },
        summary: `${lessonId ? "updated" : "wrote"} lesson "${title}" (${steps.length} steps) → ${r.quality.score}/100 ${r.quality.rank}`,
        courseId,
      };
    },
  );

  tool(
    "delete_lesson",
    {
      title: "Delete lesson",
      description: "Remove a lesson from the draft.",
      inputSchema: { courseId: z.string(), lessonId: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ courseId, lessonId }) => (
      await courses.deleteLesson(db, user, courseId, lessonId),
      { data: { ok: true }, summary: `deleted lesson ${lessonId}`, courseId }
    ),
  );

  tool(
    "validate_course",
    {
      title: "Validate course",
      description: "Run the quality pipeline on the draft: errors, warnings, score (0-100) and rank.",
      inputSchema: { courseId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ courseId }) => ({ data: summarize((await courses.getForEdit(db, user, courseId)).quality), summary: `validated ${courseId}` }),
  );

  tool(
    "publish_course",
    {
      title: "Publish course",
      description:
        "Publish the current draft as a new immutable version learners can play. Fails with the list of errors if the draft isn't publishable. Only do this when the user asked you to publish.",
      inputSchema: { courseId: z.string() },
    },
    async ({ courseId }) => {
      const r = await courses.publish(db, user, courseId);
      return {
        data: { version: r.version, score: r.quality.score, rank: r.quality.rank },
        summary: `published ${courseId} v${r.version}`,
        courseId,
      };
    },
  );

  tool(
    "get_lesson_stats",
    {
      title: "Learner stats",
      description:
        "First-try success per step from real learners on the live version, weakest first. Use it to find and rewrite confusing steps.",
      inputSchema: { courseId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ courseId }) => {
      const { course } = await courses.getForEdit(db, user, courseId);
      if (!course.publishedVersion) return { data: "Not published yet — no learner data.", summary: "read stats" };
      const live = await courses.getPlayable(db, user, courseId);
      const stats = await stepStatsFor(db, courseId, course.publishedVersion);
      const rows = live.content.units.flatMap((u) =>
        u.lessons.flatMap((l) =>
          Object.entries(stats[l.id] ?? {}).map(([i, s]) => {
            const step = l.steps[Number(i)] as Record<string, unknown> | undefined;
            return {
              lessonId: l.id,
              lesson: l.title,
              step: Number(i) + 1,
              type: step?.type,
              prompt: step?.prompt ?? step?.say ?? step?.goal,
              attempts: s.attempts,
              correctRate: Math.round((s.correct / s.attempts) * 100) / 100,
            };
          }),
        ),
      );
      rows.sort((a, b) => a.correctRate - b.correctRate);
      return { data: rows.length ? rows : "No learner data yet.", summary: "read stats" };
    },
  );

  return server;
}

// ---- Streamable HTTP sessions ----

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  userId: string;
  lastSeen: number;
}
const sessions = new Map<string, Session>();
const IDLE_MS = 30 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastSeen > IDLE_MS) (sessions.delete(id), s.transport.close());
}, 60_000).unref?.();

const rpcError = (status: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function handleMcp(request: Request, ctx: McpContext): Promise<Response> {
  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return rpcError(404, "Session expired — reconnect.");
    if (s.userId !== ctx.user.id) return rpcError(403, "This session belongs to a different token.");
    s.lastSeen = Date.now();
    return s.transport.handleRequest(request);
  }
  if (request.method !== "POST") return rpcError(400, "Missing session.");
  const body = await request.json().catch(() => null);
  if (!isInitializeRequest(body)) return rpcError(400, "Start with an initialize request.");
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => void sessions.set(id, { transport, userId: ctx.user.id, lastSeen: Date.now() }),
    onsessionclosed: (id) => void sessions.delete(id),
  });
  await buildMcpServer(ctx).connect(transport);
  return transport.handleRequest(request, { parsedBody: body });
}
