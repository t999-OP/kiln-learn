// Structural schema for course content. Zod validates shape only (so half-finished
// drafts can be saved); the quality pipeline in quality.ts judges whether content is good.
import { z } from "zod";
import { SUBJECTS, WIDGETS } from "./catalog.ts";

const lang = z.string().describe("BCP-47 language tag for TTS, e.g. es-ES, de-DE, en-US");
const explain = z.string().describe("Shown after answering — say WHY");
const range = z.tuple([z.number(), z.number()]);

export const GraphSchema = z
  .object({
    fns: z.array(z.string()).describe("Expressions in x, e.g. x^2"),
    x: range.optional(),
    y: range.optional(),
    points: z.array(range).optional(),
    holes: z.array(range).optional().describe("Open circles, e.g. a removable discontinuity"),
  })
  .describe("Optional graph shown with the step");

export const StepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("info"),
    title: z.string().optional(),
    text: z.string(),
    say: z.string().optional(),
    lang: lang.optional(),
    graph: GraphSchema.optional(),
  }),
  z.object({
    type: z.enum(["choice", "predict"]),
    prompt: z.string(),
    options: z.array(z.string()).max(6),
    answer: z.number().int().describe("0-based index of the correct option"),
    explain: explain.optional(),
    misconceptions: z.record(z.string(), z.string()).optional().describe('{"<wrong option index>": "targeted feedback"}'),
    say: z.string().optional(),
    lang: lang.optional(),
    graph: GraphSchema.optional(),
  }),
  z.object({
    type: z.literal("translate"),
    prompt: z.string(),
    answers: z.array(z.string()).describe("Every accepted translation"),
    words: z.array(z.string()).optional().describe("Word-bank tiles incl. 2-4 distractors; omit for free typing"),
    say: z.string().optional(),
    lang: lang.optional(),
  }),
  z.object({
    type: z.literal("fill"),
    prompt: z.string().describe("Contains ___"),
    answers: z.array(z.string()),
    hint: z.string().optional(),
  }),
  z.object({ type: z.literal("listen"), say: z.string(), lang: lang.optional(), answers: z.array(z.string()) }),
  z.object({ type: z.literal("match"), prompt: z.string().optional(), pairs: z.array(z.tuple([z.string(), z.string()])).max(8) }),
  z.object({
    type: z.literal("numeric"),
    prompt: z.string(),
    answer: z.number(),
    tolerance: z.number().optional(),
    unit: z.string().optional(),
    explain: explain.optional(),
    graph: GraphSchema.optional(),
  }),
  z.object({
    type: z.literal("expression"),
    prompt: z.string(),
    answer: z.string().describe("Reference expression, e.g. 3x^2 - 2"),
    variable: z.string().optional().describe("Default x"),
    range: range.optional().describe("Where answers are compared, default [-3, 3]"),
    upToConstant: z.boolean().optional().describe("Accept any F + C (antiderivatives)"),
    explain: explain.optional(),
    graph: GraphSchema.optional(),
  }),
  z.object({
    type: z.literal("widget"),
    widget: z.enum(Object.keys(WIDGETS) as [keyof typeof WIDGETS, ...(keyof typeof WIDGETS)[]]),
    params: z.record(z.string(), z.unknown()).optional(),
    goal: z.string(),
    explain: explain.optional(),
  }),
]);

export const LessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  concepts: z.array(z.string()).default([]).describe("Shared concept ids taught, e.g. calc:derivative"),
  steps: z.array(StepSchema),
});

export const UnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  lessons: z.array(LessonSchema),
});

export const CourseContentSchema = z.object({
  units: z.array(UnitSchema),
});

export const CourseMetaSchema = z.object({
  title: z.string().min(1).max(120),
  subject: z.enum(SUBJECTS),
  description: z.string().max(500).default(""),
  languages: z.object({ target: z.string(), source: z.string() }).optional(),
});

export type Graph = z.infer<typeof GraphSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type CourseContent = z.infer<typeof CourseContentSchema>;
export type CourseMeta = z.infer<typeof CourseMetaSchema>;

/** What the quality pipeline and player need: metadata + content. */
export type CourseDoc = CourseMeta & CourseContent;
