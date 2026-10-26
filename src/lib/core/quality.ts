// Quality pipeline, stage 1 (static analysis). Errors block publishing; warnings lower
// the score. Stage 2 (real learner results) and stage 3 (AI review) build on this report.
import { parse } from "./mathexpr.ts";
import { RANKS, STEP_TYPES, SUBJECTS, WIDGETS, rankFor, type Rank } from "./catalog.ts";
import type { CourseDoc, Graph, Step } from "./schema.ts";

export interface Issue {
  level: "error" | "warning";
  /** Human-readable location, e.g. `lesson "Hola", step 3`. */
  where: string;
  msg: string;
  lessonId?: string;
  /** 0-based step index within the lesson. */
  step?: number;
}

export interface QualityReport {
  score: number;
  rank: Rank;
  publishable: boolean;
  lessons: number;
  steps: number;
  errors: number;
  warnings: number;
  issues: Issue[];
}

const tokens = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const validRange = (r: unknown) => Array.isArray(r) && r.length === 2 && r.every((n) => Number.isFinite(n)) && r[0] < r[1];

function parseError(src: string, vars = ["x"]): string | null {
  try {
    parse(src, vars);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function checkGraph(g: Graph | undefined, err: (m: string) => void) {
  if (!g) return;
  if (!Array.isArray(g.fns) || !g.fns.length) return err("graph.fns must list at least one expression in x.");
  for (const f of g.fns) {
    const e = parseError(f);
    if (e) err(`graph function "${f}": ${e}`);
  }
  if (g.x && !validRange(g.x)) err("graph.x must be [min, max].");
  if (g.y && !validRange(g.y)) err("graph.y must be [min, max].");
}

function checkStep(step: Step, err: (m: string) => void, warn: (m: string) => void) {
  if (!step || !(step.type in STEP_TYPES))
    return err(`Unknown step type "${(step as { type?: string })?.type}". Use one of: ${Object.keys(STEP_TYPES).join(", ")}.`);
  if ("graph" in step) checkGraph(step.graph, err);

  switch (step.type) {
    case "info":
      if (!nonEmpty(step.text)) err("Teach card needs text.");
      break;
    case "choice":
    case "predict": {
      if (!nonEmpty(step.prompt)) err("Missing prompt.");
      const n = step.options?.length ?? 0;
      if (n < 2) err("Needs at least 2 options.");
      else if (n < 3) warn("Only 2 options — guessing gives 50%. Add a plausible distractor.");
      if (!Number.isInteger(step.answer) || step.answer < 0 || step.answer >= n) err("answer must be the index of the correct option.");
      if (new Set((step.options ?? []).map((o) => o.trim().toLowerCase())).size !== n) err("Options contain duplicates.");
      if (step.options?.some((o) => !nonEmpty(o))) err("Options can't be empty.");
      if (!nonEmpty(step.explain)) warn("No explanation — learners who get it wrong won't learn why.");
      if (step.type === "predict" && !step.misconceptions) warn("Predict steps work best with misconception feedback per wrong option.");
      break;
    }
    case "translate":
    case "fill":
    case "listen": {
      if (step.type === "listen") {
        if (!nonEmpty(step.say)) err("Listen step needs `say`.");
        if (!nonEmpty(step.lang)) warn("No `lang` — the voice may use the wrong accent.");
      } else if (!nonEmpty(step.prompt)) err("Missing prompt.");
      if (step.type === "fill" && !step.prompt.includes("___")) err("Fill prompt must contain ___ for the blank.");
      const answers = (step.answers ?? []).filter(nonEmpty);
      if (!answers.length) err("Needs at least one accepted answer.");
      else if (step.type === "translate" && answers.length < 2 && !step.words)
        warn("Only one accepted translation for a typed answer. Real learners phrase it many ways — add alternatives.");
      if (step.type === "translate" && step.words && answers.length) {
        if (step.words.length < 2) err("words[] must be a list of tiles.");
        else {
          const bank = step.words.map((w) => tokens(w).join(" "));
          const buildable = answers.some((a) => {
            const pool = [...bank];
            return tokens(a).every((t) => {
              const i = pool.indexOf(t);
              if (i < 0) return false;
              pool.splice(i, 1);
              return true;
            });
          });
          if (!buildable) err("No accepted answer can be built from the word-bank tiles.");
          const needed = Math.min(...answers.map((a) => tokens(a).length));
          if (step.words.length <= needed) warn("Word bank has no distractor tiles — it's solvable without understanding.");
        }
      }
      break;
    }
    case "match": {
      const pairs = step.pairs ?? [];
      if (pairs.length < 2) err("Needs at least 2 pairs.");
      else if (pairs.length < 3) warn("Use 3-6 pairs for a real matching challenge.");
      if (pairs.some((p) => !nonEmpty(p[0]) || !nonEmpty(p[1]))) err("Each pair needs a left and a right side.");
      break;
    }
    case "numeric":
      if (!nonEmpty(step.prompt)) err("Missing prompt.");
      if (!Number.isFinite(step.answer)) err("answer must be a number.");
      if (!nonEmpty(step.explain)) warn("No explanation of how to get the number.");
      break;
    case "expression": {
      if (!nonEmpty(step.prompt)) err("Missing prompt.");
      const e = nonEmpty(step.answer) ? parseError(step.answer, [step.variable || "x"]) : "missing";
      if (e) err(`answer must be a valid expression (${e}).`);
      if (step.range && !validRange(step.range)) err("range must be [min, max].");
      if (!nonEmpty(step.explain)) warn("No explanation of how to get the expression.");
      break;
    }
    case "widget": {
      const w = WIDGETS[step.widget];
      if (!w) {
        err(`Unknown widget "${step.widget}". Available: ${Object.keys(WIDGETS).join(", ")}.`);
        break;
      }
      const fn = step.params?.fn;
      if ("fn" in w.params && fn !== undefined) {
        const e = nonEmpty(fn) ? parseError(fn) : "must be an expression";
        if (e) err(`widget fn "${String(fn)}": ${e}`);
      }
      if (!nonEmpty(step.goal)) err("Widget step needs a goal telling the learner what to do.");
      for (const k of Object.keys(step.params ?? {})) if (!(k in w.params)) warn(`Widget "${step.widget}" ignores unknown param "${k}".`);
      break;
    }
  }
}

/** Score a course (metadata + content). Pure and fast: runs on every keystroke in the Studio. */
export function assessCourse(course: CourseDoc): QualityReport {
  const issues: Issue[] = [];
  const at = (where: string, extra: Partial<Issue> = {}) => ({
    err: (msg: string) => issues.push({ level: "error", where, msg, ...extra }),
    warn: (msg: string) => issues.push({ level: "warning", where, msg, ...extra }),
  });

  const c = at("course");
  if (!nonEmpty(course.title)) c.err("Missing title.");
  if (!(SUBJECTS as readonly string[]).includes(course.subject)) c.err(`subject must be one of ${SUBJECTS.join(", ")}.`);
  if (!nonEmpty(course.description)) c.warn("Add a description so learners know what they'll get.");
  const units = course.units ?? [];
  if (!units.length) c.err("Course has no units yet.");

  let lessonCount = 0;
  let stepCount = 0;
  const prompts = new Map<string, string>();
  for (const unit of units) {
    if (!unit.lessons?.length) at(`unit "${unit.title}"`).warn("Unit has no lessons.");
    for (const lesson of unit.lessons ?? []) {
      lessonCount++;
      const where = `lesson "${lesson.title}"`;
      const l = at(where, { lessonId: lesson.id });
      const steps = lesson.steps ?? [];
      stepCount += steps.length;
      if (!nonEmpty(lesson.title)) l.err("Lesson needs a title.");
      if (!steps.length) l.err("Lesson has no steps.");
      else {
        const graded = steps.filter((s) => STEP_TYPES[s.type]?.graded).length;
        if (graded < 3) l.warn(`Only ${graded} graded step(s). Aim for 5+ so learners actually practice.`);
        if (steps.length > 18) l.warn("Long lesson (>18 steps). Split it — short lessons get finished.");
        if (STEP_TYPES[steps[0].type]?.graded && steps[0].type !== "predict")
          l.warn("First step tests before teaching anything. Start with a teach card or a prediction.");
      }
      steps.forEach((s, i) => {
        const sw = `${where}, step ${i + 1}`;
        const sa = at(sw, { lessonId: lesson.id, step: i });
        checkStep(s, sa.err, sa.warn);
        const text = "prompt" in s ? s.prompt : "say" in s ? s.say : undefined;
        if (nonEmpty(text)) {
          const key = `${s.type}:${text.trim().toLowerCase()}`;
          if (prompts.has(key)) sa.warn(`Duplicate of ${prompts.get(key)}.`);
          else prompts.set(key, sw);
        }
      });
    }
  }

  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.length - errors;
  let score = 100 - errors * 15 - warnings * 3;
  if (lessonCount < 2) score -= 10; // thin courses rank lower
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    rank: errors ? RANKS[RANKS.length - 1].name : rankFor(score),
    publishable: errors === 0 && lessonCount > 0,
    lessons: lessonCount,
    steps: stepCount,
    errors,
    warnings,
    issues,
  };
}
