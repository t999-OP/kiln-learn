# Contributing to Kiln

Thanks for helping! Kiln is AGPL-3.0; by contributing you agree your contribution is licensed the same way.

## Setup

```bash
corepack enable
pnpm install
pnpm dev
```

## Before opening a pull request

- `pnpm check` and `pnpm test` pass.
- New behavior has tests (`src/**/*.test.ts` for pure logic, `tests/` for anything touching the database).
- Schema changes come with a migration (`pnpm db:generate`).
- UI changes work in light and dark mode and at phone width.

## Adding a widget

1. Create `widgets/<id>.html`. Load `sdk.js`, read params in `Lesson.on("init", …)` and call `Lesson.attempt({ correct: true, feedback })` when the learner reaches the goal. Widgets have no network access.
2. Register it in `WIDGETS` in `src/lib/core/catalog.ts` with a description and params — that text is what creators and agents see.
3. Add a lesson step that uses it to a seed course or test.

## Adding a step type

Add the schema in `src/lib/core/schema.ts`, catalog entry and quality checks in `catalog.ts` / `quality.ts`, a player component in `src/lib/components/player/`, an editor section in `StepEditor.svelte`, and the flat AI mapping in `src/lib/server/ai/lessons.ts`.
