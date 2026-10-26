# Changelog

## 1.2.0 — 2026-10-26

Polish release, and the first public one.

- **Home**: a short "how it works" intro for first-time visitors with a one-click start (no account needed).
- **Courses**: progress bar, exercise count and estimated time, "Practice again" when finished, share button, link previews.
- **Creator profiles** at `/u/<id>`: published courses and learners reached.
- **Lessons**: subtle sound effects (with a remembered mute toggle) and keyboard hints.
- **Studio**: reorder lessons (also across units) and duplicate steps.
- **App**: installable (web manifest and icons), page-load indicator, skip link, reduced-motion support, cleaner graph labels.
- **Project**: Prettier formatting enforced in CI, issue and PR templates, Code of Conduct, private security reporting, Dependabot, README screenshots, `KILN_SOURCE_URL` for the AGPL source link.

## 1.1.0 — 2026-10-26

**Learn without an account.** Visitors can play lessons and keep their XP, streak and progress with no sign-up: the first finished lesson creates an anonymous guest profile (a cookie, no email or password).

- Signing up later turns the guest profile into the account, keeping everything; signing in to an existing account merges the guest progress into it.
- Accounts are still needed to create courses, rate, report, use the AI assistant and create agent tokens.
- Guests are left off the leaderboard, guest creation is rate-limited per network, and unused guest profiles are removed automatically (after a day if no lesson was finished, after a year of inactivity otherwise).
- Guests can download or delete their progress from Settings.

## 1.0.0 — 2026-10-25

First stable, self-hostable release.

**Learning**

- Lesson player with 10 step types: teach cards, multiple choice, predict, translate (typed or word bank), fill-in, listen, match, numeric, typed math expressions, and interactive widgets.
- Hearts, XP, timezone-aware streaks, re-queued mistakes, keyboard control, graphs on steps, a math keypad with live preview.
- Progress synced to the server; results finished offline are queued and synced later.
- Seven sandboxed widgets: pendulum lab, line grapher, equation balance, limit explorer, secant → tangent, Riemann sums, slope tracer.

**Creating**

- Studio with structured editors, live quality scoring (Gold/Silver/Bronze/Draft), autosave with conflict detection, per-step learner success rates.
- Immutable published versions; public, unlisted and private courses; CC BY-SA 4.0 for public content.
- BYOK AI assistant (Anthropic, OpenAI, OpenRouter, Ollama, OpenAI-compatible) to draft lessons from instructions or source material and to fix weak lessons, with an automatic quality-repair round.
- MCP server with personal access tokens so external agents can author, validate and publish courses; activity feed of agent changes.

**Community & operations**

- Accounts with scrypt passwords, hashed session/API tokens, roles (user, moderator, admin), ratings, reports and a moderation queue.
- GDPR data export and account deletion; no third-party requests.
- Postgres (or embedded PGlite) with automatic migrations; Docker image and compose file; health check; graceful shutdown; CI against real Postgres.
