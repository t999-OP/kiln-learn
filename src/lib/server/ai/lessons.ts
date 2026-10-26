// AI lesson drafting and revision. The model writes a lesson in a flat, provider-friendly
// shape; we convert it to real steps, run the quality pipeline, and do one repair round
// with the reported problems before saving it to the course draft.
import { z } from "zod";
import { STEP_TYPES, WIDGETS } from "#lib/core/catalog.ts";
import { authoringGuide } from "#lib/core/guide.ts";
import { assessCourse, type Issue } from "#lib/core/quality.ts";
import { StepSchema, type CourseContent, type CourseMeta, type Lesson, type Step } from "#lib/core/schema.ts";
import { AiError, generateObject } from "./providers.ts";
import type { AiConfig } from "./settings.ts";

const stepTypes = Object.keys(STEP_TYPES) as [Step["type"], ...Step["type"][]];
const widgetIds = Object.keys(WIDGETS) as [keyof typeof WIDGETS, ...(keyof typeof WIDGETS)[]];

/** Flat step: one object type with optional fields, which every provider's JSON mode handles well. */
const AiStep = z.object({
  type: z.enum(stepTypes),
  title: z.string().optional(),
  text: z.string().optional().describe("info: the teaching text, supports **bold** and *italic*"),
  prompt: z.string().optional(),
  options: z.array(z.string()).optional().describe("choice/predict: 3-4 options"),
  answerIndex: z.number().int().optional().describe("choice/predict: 0-based index of the correct option"),
  misconceptions: z
    .array(z.object({ option: z.number().int(), feedback: z.string() }))
    .optional()
    .describe("feedback per WRONG option index"),
  answers: z.array(z.string()).optional().describe("translate/fill/listen: every accepted answer"),
  words: z.array(z.string()).optional().describe("translate word-bank tiles incl. 2-4 distractors"),
  say: z.string().optional().describe("text to speak aloud"),
  lang: z.string().optional().describe("BCP-47 tag for say, e.g. es-ES"),
  hint: z.string().optional(),
  pairs: z
    .array(z.object({ left: z.string(), right: z.string() }))
    .optional()
    .describe("match: 3-6 pairs"),
  answerNumber: z.number().optional().describe("numeric answer"),
  tolerance: z.number().optional(),
  unit: z.string().optional(),
  answerExpression: z.string().optional().describe("expression answer, e.g. 3x^2 - 2"),
  variable: z.string().optional(),
  upToConstant: z.boolean().optional(),
  widget: z.enum(widgetIds).optional(),
  widgetParamsJson: z.string().optional().describe('widget params as a JSON object string, e.g. {"targetPeriod":2}'),
  goal: z.string().optional().describe("widget: what the learner should do"),
  graphFunctions: z.array(z.string()).optional().describe("optional graph: expressions in x"),
  graphXMin: z.number().optional(),
  graphXMax: z.number().optional(),
  graphYMin: z.number().optional(),
  graphYMax: z.number().optional(),
  graphPoints: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional()
    .describe("highlighted points"),
  graphHoles: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional()
    .describe("open circles, e.g. a removable discontinuity"),
  explain: z.string().optional().describe("why the answer is right"),
});
type AiStep = z.infer<typeof AiStep>;

export const AiLesson = z.object({
  title: z.string(),
  concepts: z.array(z.string()).describe("short concept ids, e.g. es:greetings or calc:power-rule"),
  steps: z.array(AiStep),
});
export type AiLesson = z.infer<typeof AiLesson>;

const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

/** Convert the flat AI shape into real steps; returns per-step parse problems for the repair round. */
export function toSteps(ai: AiLesson): { steps: Step[]; problems: string[] } {
  const steps: Step[] = [];
  const problems: string[] = [];
  ai.steps.forEach((s: AiStep, i) => {
    const graph =
      s.graphFunctions?.length && ["info", "choice", "predict", "numeric", "expression"].includes(s.type)
        ? clean({
            fns: s.graphFunctions,
            x: s.graphXMin !== undefined && s.graphXMax !== undefined ? ([s.graphXMin, s.graphXMax] as [number, number]) : undefined,
            y: s.graphYMin !== undefined && s.graphYMax !== undefined ? ([s.graphYMin, s.graphYMax] as [number, number]) : undefined,
            points: s.graphPoints?.length ? s.graphPoints.map((p) => [p.x, p.y] as [number, number]) : undefined,
            holes: s.graphHoles?.length ? s.graphHoles.map((p) => [p.x, p.y] as [number, number]) : undefined,
          })
        : undefined;
    let params: Record<string, unknown> | undefined;
    if (s.widgetParamsJson) {
      try {
        params = JSON.parse(s.widgetParamsJson);
      } catch {
        problems.push(`step ${i + 1}: widgetParamsJson is not valid JSON`);
      }
    }
    const candidate = clean({
      type: s.type,
      title: s.title,
      text: s.text,
      prompt: s.prompt,
      options: s.options,
      answer:
        s.type === "numeric"
          ? s.answerNumber
          : s.type === "expression"
            ? s.answerExpression
            : s.type === "choice" || s.type === "predict"
              ? s.answerIndex
              : undefined,
      answers: s.answers,
      words: s.words?.length ? s.words : undefined,
      say: s.say,
      lang: s.lang,
      hint: s.hint,
      pairs: s.pairs?.map((p) => [p.left, p.right] as [string, string]),
      tolerance: s.tolerance,
      unit: s.unit,
      variable: s.variable,
      upToConstant: s.upToConstant,
      widget: s.widget,
      params,
      goal: s.goal,
      explain: s.explain,
      misconceptions: s.misconceptions?.length
        ? Object.fromEntries(s.misconceptions.map((m) => [String(m.option), m.feedback]))
        : undefined,
      graph,
    });
    const parsed = StepSchema.safeParse(candidate);
    if (parsed.success) steps.push(parsed.data);
    else problems.push(`step ${i + 1} (${s.type}): ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  return { steps, problems };
}

/** Back to the flat shape, so the model can revise an existing lesson. */
export function fromLesson(lesson: Lesson): AiLesson {
  return {
    title: lesson.title,
    concepts: lesson.concepts,
    steps: lesson.steps.map((s) => {
      const base: AiStep = { type: s.type };
      const o = s as Record<string, unknown>;
      for (const k of [
        "title",
        "text",
        "prompt",
        "options",
        "answers",
        "words",
        "say",
        "lang",
        "hint",
        "tolerance",
        "unit",
        "variable",
        "upToConstant",
        "widget",
        "goal",
        "explain",
      ])
        if (o[k] !== undefined) (base as Record<string, unknown>)[k] = o[k];
      if (s.type === "choice" || s.type === "predict") {
        base.answerIndex = s.answer;
        if (s.misconceptions)
          base.misconceptions = Object.entries(s.misconceptions).map(([option, feedback]) => ({ option: Number(option), feedback }));
      }
      if (s.type === "numeric") base.answerNumber = s.answer;
      if (s.type === "expression") base.answerExpression = s.answer;
      if (s.type === "match") base.pairs = s.pairs.map(([left, right]) => ({ left, right }));
      if (s.type === "widget" && s.params) base.widgetParamsJson = JSON.stringify(s.params);
      if ("graph" in s && s.graph) {
        base.graphFunctions = s.graph.fns;
        if (s.graph.x) [base.graphXMin, base.graphXMax] = s.graph.x;
        if (s.graph.y) [base.graphYMin, base.graphYMax] = s.graph.y;
        if (s.graph.points) base.graphPoints = s.graph.points.map(([x, y]) => ({ x, y }));
        if (s.graph.holes) base.graphHoles = s.graph.holes.map(([x, y]) => ({ x, y }));
      }
      return base;
    }),
  };
}

const SYSTEM = `You are an expert instructional designer writing lessons for Kiln, an open platform for Duolingo- and Brilliant-style interactive lessons.

${authoringGuide()}

## Output format
Return the lesson as JSON with title, concepts and steps. Each step is a flat object:
- choice/predict: prompt, options, answerIndex (0-based), explain, misconceptions [{option, feedback}] for wrong options
- numeric: prompt, answerNumber, tolerance, unit, explain
- expression: prompt, answerExpression (math syntax above), variable, upToConstant, explain
- match: pairs [{left, right}]
- widget: widget, widgetParamsJson (a JSON object as a string), goal, explain
- optional graph on info/choice/predict/numeric/expression: graphFunctions, graphXMin/graphXMax, graphYMin/graphYMax, graphPoints, graphHoles
Write in the learner's language unless the course teaches a language. Be accurate: every answer must be correct.`;

export const MAX_SOURCE_CHARS = 50_000;

export interface LessonContext {
  meta: CourseMeta;
  content: CourseContent;
  unitTitle: string;
}

function contextBlock(ctx: LessonContext) {
  const existing = ctx.content.units.flatMap((u) => u.lessons.map((l) => `- ${u.title}: ${l.title}`)).join("\n") || "(none yet)";
  return `Course: ${ctx.meta.title} (subject: ${ctx.meta.subject})
Description: ${ctx.meta.description || "—"}
${ctx.meta.languages ? `Teaches ${ctx.meta.languages.target} to speakers of ${ctx.meta.languages.source}.\n` : ""}Unit for this lesson: ${ctx.unitTitle}
Existing lessons (continue from these, don't repeat them):
${existing}`;
}

/** Quality-check a single lesson in the context of its course. */
function lessonIssues(ctx: LessonContext, lesson: Lesson): Issue[] {
  const report = assessCourse({ ...ctx.meta, units: [{ id: "u", title: ctx.unitTitle, lessons: [lesson] }] });
  return report.issues.filter((i) => i.lessonId === lesson.id);
}

async function generateWithRepair(cfg: AiConfig, ctx: LessonContext, prompt: string, lessonId: string) {
  let ai = await generateObject(cfg, { system: SYSTEM, prompt, schema: AiLesson });
  let { steps, problems } = toSteps(ai);
  let lesson: Lesson = { id: lessonId, title: ai.title, concepts: ai.concepts, steps };
  let issues = lessonIssues(ctx, lesson);
  const errors = issues.filter((i) => i.level === "error");
  if (problems.length || errors.length || !steps.length) {
    const report = [...problems, ...issues.map((i) => `${i.where.replace(/^lesson "[^"]*", /, "")}: [${i.level}] ${i.msg}`)].join("\n");
    ai = await generateObject(cfg, {
      system: SYSTEM,
      prompt: `${prompt}\n\nYour previous draft:\n${JSON.stringify(ai)}\n\nThe quality checker found these problems. Return the complete corrected lesson:\n${report}`,
      schema: AiLesson,
    });
    ({ steps, problems } = toSteps(ai));
    lesson = { id: lessonId, title: ai.title, concepts: ai.concepts, steps };
    issues = lessonIssues(ctx, lesson);
  }
  if (!steps.length) throw new AiError("The model didn't produce any usable steps. Try again or use a more capable model.", 422);
  return { lesson, issues, dropped: problems };
}

export async function draftLesson(cfg: AiConfig, ctx: LessonContext, input: { instructions: string; source?: string; lessonId: string }) {
  if (input.source && input.source.length > MAX_SOURCE_CHARS)
    throw new AiError(
      `The source material is too long (${input.source.length.toLocaleString()} characters, max ${MAX_SOURCE_CHARS.toLocaleString()}). Split it into smaller parts.`,
      400,
    );
  const prompt = `${contextBlock(ctx)}

Write ONE new lesson (6-12 steps) for this unit.
Instructions from the creator: ${input.instructions || "Pick the most useful next topic."}
${input.source ? `\nBase the lesson on this source material:\n"""\n${input.source}\n"""` : ""}`;
  return generateWithRepair(cfg, ctx, prompt, input.lessonId);
}

export async function reviseLesson(
  cfg: AiConfig,
  ctx: LessonContext,
  input: { lesson: Lesson; instructions: string; weakSteps?: { step: number; correctRate: number; attempts: number }[] },
) {
  const issues = lessonIssues(ctx, input.lesson);
  const prompt = `${contextBlock(ctx)}

Improve this existing lesson. Keep what works; fix what doesn't. Keep roughly the same length unless asked otherwise.
Instructions from the creator: ${input.instructions || "Fix every quality issue and make weak steps clearer."}

Current lesson:
${JSON.stringify(fromLesson(input.lesson))}

Quality issues:
${issues.map((i) => `- ${i.where.replace(/^lesson "[^"]*", /, "")}: [${i.level}] ${i.msg}`).join("\n") || "(none)"}
${input.weakSteps?.length ? `\nSteps learners struggle with (first-try success rate):\n${input.weakSteps.map((w) => `- step ${w.step + 1}: ${Math.round(w.correctRate * 100)}% of ${w.attempts}`).join("\n")}\nMake these clearer or add accepted answers — don't just make them trivial.` : ""}`;
  return generateWithRepair(cfg, ctx, prompt, input.lesson.id);
}
