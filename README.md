# Kiln

[![CI](https://github.com/t999-OP/kiln-learn/actions/workflows/ci.yml/badge.svg)](https://github.com/t999-OP/kiln-learn/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Content: CC BY-SA 4.0](https://img.shields.io/badge/content-CC%20BY--SA%204.0-lightgrey)](https://creativecommons.org/licenses/by-sa/4.0/)

**Open-source, self-hostable platform for interactive lessons** — Duolingo-style language practice and Brilliant-style science and math, created by people _and_ AI agents.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/home-dark.png">
  <img alt="Course catalog" src="docs/screenshots/home-light.png" width="49%">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/lesson-widget-dark.png">
  <img alt="An interactive pendulum experiment inside a lesson" src="docs/screenshots/lesson-widget-light.png" width="49%">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/lesson-math-dark.png">
  <img alt="A calculus question with a graph and live math input" src="docs/screenshots/lesson-math-light.png" width="49%">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/studio-dark.png">
  <img alt="The Studio editor with live quality scoring and the AI assistant" src="docs/screenshots/studio-light.png" width="49%">
</picture>
</p>

- **Learn**: bite-sized lessons with instant feedback, hearts, XP, streaks and mistakes that come back until they stick. **No account needed** — progress is kept automatically in an anonymous guest profile; signing up (optional) keeps it and syncs it across devices. Results finished offline sync later.
- **Create**: a free Studio with 10 exercise types (multiple choice, predict, translate with word banks, fill-in, listen, match, numeric, typed math, teaching cards and interactive widgets), graphs, and live quality scoring.
- **Interactive widgets**: pendulum lab, equation balance, line grapher, limit explorer, secant → tangent, Riemann sums and slope tracer — sandboxed on their own origin.
- **AI, your way**: bring your own key (Anthropic, OpenAI, OpenRouter) or run a local model with Ollama to draft lessons from a prompt or source material, and to fix weak lessons. Every AI draft goes through the quality pipeline.
- **Agents via MCP**: connect Claude Code, Cursor, Kimi or any MCP client with a personal token; agents create, validate and publish courses as you.
- **Quality pipeline**: static checks (answers buildable from word banks, valid math, teaching before testing…) rank courses Gold/Silver/Bronze, and real learner first-try rates point creators at confusing steps.
- **Community**: ratings from learners who actually played, reports, a moderation queue, roles.
- **Privacy**: no third-party requests (fonts are self-hosted), data export and account deletion built in.

Public courses are licensed **CC BY-SA 4.0**. The software is **AGPL-3.0**.

## Quick start (development)

Requirements: Node.js ≥ 22.13 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. Without `DATABASE_URL`, Kiln uses an embedded Postgres in `data/pglite` and imports five example courses on first start. The first account you create becomes the admin (on a public server, set `KILN_ADMIN_EMAIL` so only your address can claim it).

## Self-hosting

```bash
cp .env.example .env    # set KILN_SECRET, POSTGRES_PASSWORD and ORIGIN
docker compose up -d
```

This runs Kiln and Postgres 17. Migrations run automatically on start. Kiln listens on **two ports**:

| Port | Purpose                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 3000 | The app                                                                                                         |
| 3001 | The widget sandbox origin — interactive widgets load from here so they can never touch the app's cookies or API |

Behind a reverse proxy with TLS, give the widget origin its own hostname and tell Kiln about both. Caddy example:

```
kiln.example.com {
  reverse_proxy localhost:3000
}
widgets.kiln.example.com {
  reverse_proxy localhost:3001
}
```

```bash
ORIGIN=https://kiln.example.com
WIDGET_ORIGIN=https://widgets.kiln.example.com
```

Without Docker: `pnpm build && node server.js` (set `DATABASE_URL` for Postgres).

**Back up** the Postgres database and `KILN_SECRET` (it encrypts stored AI keys). `GET /api/health` reports liveness and database connectivity.

### Configuration

All settings are environment variables; see [`.env.example`](.env.example) for the full list.

| Variable                               | Default                       |                                                                           |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                         | embedded PGlite               | `postgres://…` for production                                             |
| `KILN_SECRET`                          | generated into `data/.secret` | **Required in production.** Encrypts users' AI keys                       |
| `ORIGIN`                               | from request headers          | Public URL, e.g. `https://kiln.example.com`                               |
| `ADDRESS_HEADER`, `XFF_DEPTH`          | —                             | Client-IP header behind a proxy (rate limiting)                           |
| `WIDGET_PORT` / `WIDGET_ORIGIN`        | `3001` / same host, port 3001 | Widget sandbox                                                            |
| `KILN_ADMIN_EMAIL`                     | —                             | Only this address becomes admin on sign-up                                |
| `KILN_REGISTRATION`                    | `open`                        | `closed` disables self sign-up                                            |
| `KILN_AI_CUSTOM_URLS`                  | `admins`                      | Who may point AI at custom servers (Ollama etc.): `all`, `admins`, `none` |
| `KILN_AI_HOURLY_LIMIT`                 | `30`                          | AI requests per user per hour                                             |
| `KILN_SEED`                            | `true`                        | Import example courses into an empty instance                             |
| `KILN_IMPRINT_URL`, `KILN_PRIVACY_URL` | —                             | Footer links (an imprint is required for many EU operators)               |

## Connecting an agent (MCP)

1. In Kiln: **Settings → Agent tokens → Create token**.
2. Connect your client, e.g. Claude Code:

   ```bash
   claude mcp add --transport http kiln https://kiln.example.com/mcp --header "Authorization: Bearer kiln_pat_…"
   ```

3. Ask it for a course. The **Agents** page shows every change agents make on your behalf.

Tools: `get_authoring_guide`, `list_widgets`, `list_my_courses`, `search_catalog`, `get_course`, `create_course`, `update_course`, `add_unit`, `upsert_lesson`, `delete_lesson`, `validate_course`, `publish_course`, `get_lesson_stats`. Every write returns a quality report so agents can iterate until a course ranks Gold. `scripts/agent-demo.ts` is a minimal example client.

## AI models (bring your own key)

**Settings → AI models**: pick a provider and model, paste a key (stored encrypted), and test the connection. In the Studio, the AI assistant drafts a lesson from instructions and optional source material, or revises a lesson using its quality issues and real learner stats. Drafts get one automatic repair round from the quality checker before they're saved to your draft — nothing is published without you.

## Architecture

|                       |                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/core/`       | The lesson format (Zod schemas), widget and step catalog, quality pipeline, safe math engine, answer matching. Shared by server and browser.        |
| `src/lib/server/`     | Accounts and sessions, courses (drafts → immutable published versions), progress, community and moderation, AI providers, MCP, widget sandbox host. |
| `src/lib/server/db/`  | Drizzle schema; migrations live in `drizzle/`.                                                                                                      |
| `src/lib/components/` | Lesson player (one component per step type) and the Studio editor.                                                                                  |
| `src/routes/`         | SvelteKit pages, form actions and JSON endpoints (`/api/…`, `/mcp`).                                                                                |
| `widgets/`            | Interactive widgets. A widget is any HTML page that loads `sdk.js` and calls `Lesson.attempt({ correct, feedback })`.                               |
| `seed/`               | Example courses imported on first start.                                                                                                            |

Learners always play an immutable published version, so editing a course never breaks someone mid-lesson. Drafts use optimistic concurrency, so an agent and a person editing the same course never silently overwrite each other.

## Development

```bash
pnpm check          # svelte-check + TypeScript
pnpm test           # Vitest (embedded Postgres)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test   # against real Postgres
pnpm db:generate    # create a migration after changing src/lib/server/db/schema.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).

## License

Code: [AGPL-3.0](LICENSE). If you run a modified Kiln for others, you must publish your changes.
Public course content: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
