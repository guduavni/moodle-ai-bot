# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this project is

**Go Yeda / SkyTutor** — an AI tutor for Hebrew-speaking flight students. A Moodle local plugin injects an "❓ הסבר לי את השאלה" button into quiz pages; clicking it sends the question + answer choices to a Vercel serverless function that calls OpenAI and returns a Hebrew explanation grounded in aviation-theory reasoning (Oxford / FAA style).

## Repo layout

Two halves in one repo, no monorepo tooling:

- `QBot/questionbot/` — Moodle local plugin `local_questionbot` (PHP + AMD JS).
  - `version.php` — plugin version + Moodle 4.4+ requirement.
  - `lib.php` — `before_footer` hook that injects the AMD module on quiz attempt/review/summary and `question/preview` pages.
  - `amd/src/questionbot.js` — scrapes `.qtext` + radio/checkbox labels, POSTs to `ajax.php`, renders the answer in a fixed-position RTL panel. Uses `MutationObserver` to re-inject on dynamic content.
  - `amd/build/questionbot.min.js` — built artifact (must be regenerated after `src` changes; Moodle loads `build/` in production).
  - `ajax.php` — Moodle endpoint that builds the Hebrew prompt and **GETs** the external API with `username`, `course`, `q` as query params.
  - `settings.php` + `lang/{en,he}/local_questionbot.php` — admin settings + translations.
  - `local_questionbot.zip` — packaged plugin for Moodle install.

- `api/` — Vercel serverless functions.
  - `chat.js` — accepts GET or POST, accepts many aliased param names, calls OpenAI `gpt-4.1-mini` (temp 0.3, `max_tokens: 1500`), strips Markdown/LaTeX with `cleanAnswer`, optionally logs to Supabase `question_logs`. Default Hebrew aviation-tutor system prompt lives here and is the source of truth.
  - `stats.js` — reads `question_logs` for the dashboard, returns `{ totalQuestions, rows }`.
  - `dashboard.html` — older/stale dashboard (expects `topQuestions/courses/topUsers/latest` shapes that `stats.js` no longer returns). Don't edit unless you also update `stats.js` to match.

- `dashboard.html` (root) — the **active** Hebrew/RTL dashboard. Reads `/api/stats`. Recent work has been here.

## External dependencies

- **OpenAI** — model `gpt-4.1-mini`. Key in env var `OPENAI_API_KEY`.
- **Supabase** — table `question_logs` with columns `username`, `course`, `question_text`, `answer`, `created_at`. Env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (code also accepts the typo'd `SUPBASE_*` and a few other aliases — leave the fallbacks alone unless cleaning up env config).
- **Production API URL** — `https://skytutor-agent.vercel.app/api/moodle/chat/` (hardcoded as fallback in `QBot/questionbot/ajax.php` if the plugin's `apiurl` setting is empty).

A root `package.json` exists for **dev tooling only** (`vitest`, `jsdom`, `@playwright/test`). Vercel ignores `devDependencies` for serverless functions — the `/api` deploy is unaffected. No `vercel.json`. No CI yet.

## Tests

All test code lives under `tests/` and is **non-invasive** — production source in `api/` and `QBot/questionbot/` is untouched. Layers:

1. **JS unit (jsdom)** — `tests/unit/questionbot/*.dom.test.js`. Loads `amd/src/questionbot.js` via an AMD `define` shim and drives `init()` against a synthesized DOM. Covers cleanText, getQuestion, getAnswers (all three labelling fallbacks, length filter, dedup, prefix stripping), inject (incl. data-qb guard), MutationObserver re-injection, send (request shape, debounce, panel rendering, error path).
2. **API integration** — `tests/integration/chat-handler.test.js`. Imports `chat.js`'s default-export handler and drives it with stubbed `globalThis.fetch`. Covers GET vs POST, missing/short question, missing OPENAI_KEY, OpenAI error forwarding, cleanAnswer being applied, Supabase logging on/off and failure resilience.
3. **Browser-visible mock Moodle** — `tests/mock-moodle/{index.html,server.js}`. A static page that mimics a real quiz attempt (three `.que` blocks, all three labelling patterns) + a tiny no-deps Node server that stands in for `ajax.php`. Has a scenario picker (`success` / `slow-3s` / `401` / `network-error` / `dynamic-question`).
4. **Playwright E2E** — `tests/e2e/full-flow.spec.ts`. Drives the mock page above; asserts injection, request shape, error rendering, debounce, MutationObserver.

## Conventions to honor

- **Hebrew + RTL everywhere user-facing.** HTML uses `lang="he" dir="rtl"`. Keep new UI consistent.
- **Plain text answers only.** The system prompt forbids Markdown, asterisks, hashes, code blocks, and LaTeX. `cleanAnswer` in `api/chat.js` enforces this on the way out — if you change the prompt, keep the cleaner aligned and vice versa.
- **Aviation domain.** Answers should explain reasoning (not just the final choice) and prefer principles from Oxford/FAA literature. Don't fabricate aviation data.
- **Two dashboards exist.** Root `dashboard.html` is canonical. `api/dashboard.html` is stale — flag before editing.
- **Param-name tolerance is intentional.** `chat.js` accepts `q`, `question`, `questionText`, `quiz_question`, `amp;q`, etc. because the Moodle plugin and other callers send different shapes. Don't tighten this without checking all call sites.

## Things to watch

- The Moodle proxy GETs the full prompt in the URL (`ajax.php` builds `$url = $apiurl . '?' . http_build_query($params)`). Long questions can hit URL-length limits — switching to POST is a known improvement, not yet done.
- After editing `amd/src/questionbot.js`, the matching `amd/build/questionbot.min.js` must be regenerated; Moodle serves the build artifact, not the source.
- The Supabase env-var fallbacks include misspellings (`SUPBASE_URL`). Treat that as a bug compatibility layer, not a target.

## Workflow rules (from global instructions)

- Never commit directly to `main`. Branch, bump patch version (here that's `$plugin->version` in `QBot/questionbot/version.php` for plugin changes), open issue, open PR linking `Closes #N`.
- Never `--no-verify`, never force-push `main`, confirm before destructive ops.
