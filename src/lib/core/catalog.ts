// The Kiln lesson format: subjects, step types and the widget registry.
// Descriptions here are shown to creators in the Studio and to agents via MCP.

export const SPEC_VERSION = "1.0";

export interface StepTypeInfo {
  label: string;
  fields: string;
  graded: boolean;
}

export interface WidgetInfo {
  title: string;
  subject: Subject;
  description: string;
  params: Record<string, string>;
}

export const SUBJECTS = ["language", "science", "math", "code", "other"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const STEP_TYPES = {
  info: {
    label: "Teach card",
    fields: "title?, text (supports **bold**), say? (text read aloud), lang?",
    graded: false,
  },
  choice: {
    label: "Multiple choice",
    fields: "prompt, options[] (2-6), answer (index of correct option), explain?, misconceptions? {optionIndex: feedback}, say?, lang?",
    graded: true,
  },
  predict: {
    label: "Predict (no penalty)",
    fields: "prompt, options[], answer (index), explain (shown after guessing), misconceptions?",
    graded: true,
  },
  translate: {
    label: "Translate",
    fields:
      "prompt (sentence to translate), answers[] (ALL accepted translations), words[]? (word-bank tiles incl. distractors; omit for typing), say?, lang?",
    graded: true,
  },
  fill: {
    label: "Fill in the blank",
    fields: "prompt (use ___ for the blank), answers[] (accepted fills), hint?",
    graded: true,
  },
  listen: {
    label: "Listen & type",
    fields: "say (text spoken by TTS), lang (BCP-47, e.g. es-ES), answers[] (accepted transcriptions)",
    graded: true,
  },
  match: {
    label: "Match pairs",
    fields: "prompt?, pairs[] ([left, right], 3-6 pairs)",
    graded: true,
  },
  numeric: {
    label: "Numeric answer",
    fields: "prompt, answer (number), tolerance? (absolute, default 1% of answer), unit?, explain?. Learners may type 8/3 or pi/2",
    graded: true,
  },
  expression: {
    label: "Math expression",
    fields:
      "prompt, answer (expression, e.g. 20x^3 - 2), variable? (default x), range? [min,max] where answers are compared (default [-3,3]), upToConstant? (true for antiderivatives: accepts any F + C), explain?",
    graded: true,
  },
  widget: {
    label: "Interactive widget",
    fields: "widget (id from list_widgets), params {}, goal (instruction shown to learner), explain?",
    graded: true,
  },
} as const satisfies Record<string, StepTypeInfo>;

export type StepType = keyof typeof STEP_TYPES;

export const WIDGETS = {
  pendulum: {
    title: "Pendulum lab",
    subject: "science",
    description:
      "Swinging pendulum with length and mass sliders and a live period readout. Two modes: with targetPeriod the learner tunes it until the period matches; without it, length is fixed and the learner must try 3 different masses (discovers mass doesn't matter). Teaches T = 2π√(L/g).",
    params: {
      targetPeriod: "number, seconds (e.g. 2.0). Omit for the mass-exploration mode",
      tolerance: "number, seconds (default 0.05)",
      startLength: "number, metres 0.1-2.5 (default 0.5)",
      g: "number, m/s² (default 9.81; 1.62 = Moon)",
    },
  },
  grapher: {
    title: "Line grapher",
    subject: "math",
    description: "Plot y = m·x + b with sliders. Target points are drawn; the learner adjusts m and b until the line passes through them.",
    params: {
      targetSlope: "number",
      targetIntercept: "number",
      tolerance: "number (default 0.1)",
    },
  },
  limit: {
    title: "Limit explorer",
    subject: "math",
    description:
      "Plots f(x) with a hole at x = a. The learner slides x toward a (fine control near a) and watches f(x). Completes once they've come within 0.01 of a from BOTH sides.",
    params: {
      fn: "expression in x, e.g. (x^2-1)/(x-1) or sin(x)/x",
      a: "number, the point x approaches",
      limit: "number (optional, computed numerically if omitted)",
      x: "[min, max] view (default a±3)",
      y: "[min, max] view (default auto)",
    },
  },
  tangent: {
    title: "Secant → tangent",
    subject: "math",
    description:
      'Curve f with point P at x = a. mode "secant": learner shrinks h and the secant PQ turns into the tangent while its slope converges to f′(a); completes when h < 0.01. mode "slope": learner tunes the slope of a line through P until it is tangent; completes when within tolerance of f′(a).',
    params: {
      fn: "expression in x",
      a: "number",
      mode: '"secant" (default) or "slope"',
      tolerance: "number (slope mode, default 0.15)",
      x: "[min, max]",
      y: "[min, max]",
    },
  },
  riemann: {
    title: "Riemann sums",
    subject: "math",
    description:
      "Area under f from a to b approximated with n rectangles (left/middle/right). Shows estimate, true area and error. Completes when the error is at most targetError.",
    params: {
      fn: "expression in x",
      a: "number",
      b: "number",
      targetError: "number (default 0.05)",
      method: '"left" (default), "mid" or "right" — learner can switch',
      x: "[min, max]",
      y: "[min, max]",
    },
  },
  slopetracer: {
    title: "Slope tracer",
    subject: "math",
    description:
      "Top: f with a moving tangent. Bottom: the slope at each visited x is plotted. As the learner sweeps x across the domain, the graph of f′ appears. Completes at 85% coverage, then reveals f′.",
    params: {
      fn: "expression in x",
      x: "[min, max] (default [-3, 3])",
      y: "[min, max] for f",
      dy: "[min, max] for f′",
      reveal: 'string shown after completion, e.g. "2x"',
    },
  },
  balance: {
    title: "Equation balance",
    subject: "math",
    description:
      "A balance scale showing a·x + b = c with weights. The learner chooses x until the scale balances. Builds intuition for solving linear equations.",
    params: { a: "integer coefficient", b: "integer", c: "integer (choose so x is a whole number 0-10)" },
  },
} as const satisfies Record<string, WidgetInfo>;

export type WidgetId = keyof typeof WIDGETS;

export const RANKS = [
  { min: 90, name: "Gold" },
  { min: 75, name: "Silver" },
  { min: 50, name: "Bronze" },
  { min: 0, name: "Draft" },
] as const;

export type Rank = (typeof RANKS)[number]["name"];

export const rankFor = (score: number): Rank => RANKS.find((r) => score >= r.min)!.name;
