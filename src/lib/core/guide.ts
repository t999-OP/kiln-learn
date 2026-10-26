// The authoring guide agents receive over MCP and creators see in the Studio help.
import { SPEC_VERSION, STEP_TYPES, WIDGETS } from "./catalog.ts";

export function authoringGuide(): string {
  const steps = Object.entries(STEP_TYPES)
    .map(([k, v]) => `- **${k}** (${v.label}${v.graded ? "" : ", not graded"}): ${v.fields}`)
    .join("\n");
  const widgets = Object.entries(WIDGETS)
    .map(
      ([k, w]) =>
        `- **${k}** — ${w.description}\n  params: ${Object.entries(w.params)
          .map(([p, d]) => `${p}: ${d}`)
          .join("; ")}`,
    )
    .join("\n");
  return `# Kiln authoring guide (spec v${SPEC_VERSION})

A course = units → lessons → steps. Learners play one lesson at a time (Duolingo-style): each graded step is checked instantly, wrong answers come back at the end of the lesson, and they earn XP.

## Workflow for agents
1. create_course → add_unit → upsert_lesson (one call per lesson, with all its steps).
2. Read the quality report returned by upsert_lesson. Fix every error; fix warnings where sensible.
3. validate_course before telling the user you're done. Aim for rank Gold (score ≥ 90).
4. Later: get_lesson_stats shows which steps real learners fail most — rewrite those.

## Step types
${steps}

## Widgets (for type "widget")
${widgets}

## Math syntax (expression steps, graphs, widget fn)
3x^2 + 2x - 1 · (x^2-1)/(x-1) · sin(x)/x · e^(2x) · ln(x) · sqrt(x) · |x| · pi. Implicit multiplication works (2x, 3(x+1), x sin x).
Learners' expression answers are checked by value at many points, so any equivalent form is accepted (x*2 = 2x).

## Graphs on steps
info, choice, predict, numeric and expression steps can show a graph:
"graph": {"fns": ["x^2", "2x"], "x": [-3, 3], "y": [-2, 9], "points": [[1, 1]], "holes": [[1, 2]]}

## What "high quality" means here
- Teach before you test: open lessons with an info card or a predict step.
- 5-12 steps per lesson, mostly graded, mixing at least 3 step types.
- translate/fill/listen: list EVERY reasonable accepted answer (word order variants, with/without articles, contractions). Matching ignores case, punctuation and accents.
- Word banks need 2-4 distractor tiles.
- Every choice/predict/numeric step gets an \`explain\`. Predict steps should map wrong options to the misconception they reveal.
- Science/math: use the predict → widget → explain pattern. Let learners discover the rule, then name it.
- Calculus: limit / tangent / slopetracer / riemann widgets make the idea visible before the formula; follow with expression steps to practice the rule.
- Free courses are public and licensed CC-BY-SA-4.0.

## Example lesson steps
[
  {"type":"info","title":"Hola!","text":"**hola** means *hello*.","say":"hola","lang":"es-ES"},
  {"type":"choice","prompt":"What does \\"hola\\" mean?","options":["Goodbye","Hello","Thanks"],"answer":1,"explain":"Hola = hello."},
  {"type":"translate","prompt":"Hello, I am Ana","answers":["Hola, soy Ana","Hola, yo soy Ana"],"words":["Hola","soy","Ana","yo","gracias","eres"]},
  {"type":"predict","prompt":"Double the mass. The period…","options":["gets longer","gets shorter","stays the same"],"answer":2,"misconceptions":{"0":"Heavier isn't slower — gravity pulls harder but there's more to move."},"explain":"Mass cancels out."},
  {"type":"widget","widget":"pendulum","params":{"targetPeriod":2},"goal":"Make the pendulum swing with a period of 2.0 s."}
]
`;
}
