# AGENTS.md

This is the canonical onboarding file for any AI coding agent working in this repository.
If another agent-specific file exists (for example `CLAUDE.md`), treat this file as source of truth.

## Mission

Track deals for LCBO today, built so it can grow into a general multi-retailer
tracker later, without breaking the static-data contract the frontend depends on.

## First 5 Minutes

1. Read this file fully.
2. Skim [README.md](../../README.md) for product and data-sourcing context.
3. Note the shape of the project: no backend server, no build step. `index.html`,
   `app.js`, `style.css` are shipped as-is and read straight out of `data/*.json`.
4. `data/*.json` is generated output, not hand-authored — see Ground Rules.

## Ground Rules

- No backend server, no bundler, no framework. Keep the frontend plain
  HTML/CSS/JS. Don't introduce a build step without discussing it with the
  user first.
- `data/*.json` (`deals.json`, `stores.json`, `price-history.json`) is
  generated output — never hand-edit it. Change the generating script instead
  (`scripts/fetch-deals.mjs`, `scripts/fetch-stores.mjs`) and re-run it.
- Never fabricate a "regular price" or discount. LCBO.dev doesn't expose one —
  discounts must be derived from an observed prior price recorded in
  `data/price-history.json`. See the comment block at the top of
  `scripts/fetch-deals.mjs` for why.
- Respect api.lcbo.dev's rate limit (60 req/60s) and fair-use terms (personal
  use, daily polling) — see the README's Data section. The same expectation
  applies to any future retailer API.
- Keep changes scoped; don't refactor unrelated areas.

## Repo Facts

- Static frontend: `index.html` / `app.js` / `style.css`. No build tooling,
  no `package.json`, no frontend dependencies.
- Data fetchers: plain Node ESM scripts under `scripts/`, no npm dependencies.
  Run directly with `node scripts/fetch-stores.mjs`, `node scripts/fetch-deals.mjs`.
- `scripts/lib/lcbo-client.mjs` is the shared GraphQL client + pagination
  helper both fetch scripts depend on.
- Scheduled by `.github/workflows/fetch-deals.yml` (daily cron +
  `workflow_dispatch`), which runs both scripts and commits any resulting
  `data/*.json` diff back to `main`.
- No test suite, no lint config in this repo currently.

## Running Locally

- Open `index.html` directly in a browser, or serve the folder:
  `python3 -m http.server 8000` (per README).
- To test the data fetchers locally: `node scripts/fetch-stores.mjs` then
  `node scripts/fetch-deals.mjs`. This will modify `data/*.json` in your
  working tree — don't commit a test run unless it's an intentional refresh.

## High-Impact Paths

- `data/*.json` — the frontend's only data source, with no schema validation.
  A shape change here breaks the UI silently.
- `scripts/lib/lcbo-client.mjs` — shared by both fetch scripts; a bug here
  breaks both.
- `.github/workflows/fetch-deals.yml` — the only thing keeping data fresh in
  production. A broken script here means stale data with no alerting.

## Change Workflow

1. Understand the request and impacted files.
2. Edit only the necessary files.
3. If touching `scripts/`, run the relevant script locally and confirm
   `data/*.json` still looks sane.
4. If touching `app.js`, open `index.html` in a browser and manually exercise
   the changed flow — there's no test suite to lean on.
5. Report: what changed, why, and what was validated.

## Skills Folder

- `docs/ai/skills/<skill-name>/SKILL.md` is the entrypoint convention for a
  reusable playbook.
- Available skills:
  - [`docs/ai/skills/adding-a-retailer/SKILL.md`](./skills/adding-a-retailer/SKILL.md)
    — playbook for extending DealRadar to a new retailer beyond LCBO.

## Agent-Specific Files

- `CLAUDE.md` may exist for Claude-specific bootstrapping.
- If guidance conflicts, follow this file (`AGENTS.md`) unless a human
  explicitly instructs otherwise.
