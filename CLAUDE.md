# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this project is

**Go Yeda / SkyTutor** — an AI tutor for Hebrew-speaking flight students. A Moodle local plugin injects an "❓ הסבר לי את השאלה" button into quiz pages; clicking it opens a multi-turn chat panel that talks to the **skytutor-agent** project (`/api/moodle/chat`) via the plugin's `ajax.php` proxy. The first turn is auto-seeded with the scraped question + answer choices and asks for a Hebrew aviation-theory explanation; the user can then keep typing follow-up questions in the same panel. skytutor-agent persists the conversation server-side (DynamoDB session keyed by `moodle-YYYY-MM-DD-{actorId}`).

## Repo layout

Two halves in one repo, no monorepo tooling:

- `QBot/questionbot/` — Moodle local plugin `local_questionbot` (PHP + AMD JS).
  - `version.php` — plugin version + Moodle 4.4+ requirement.
  - `lib.php` — `before_footer` hook that injects the AMD module on quiz attempt/review/summary and `question/preview` pages.
  - `amd/src/questionbot.js` — scrapes `.qtext` + radio/checkbox labels, opens a fixed-position RTL chat panel (header + scrollable thread of user/assistant bubbles + textarea + שלח button), POSTs each turn to `ajax.php` with a `kind` discriminator (`"initial"` for the first turn, `"followup"` for the rest). Uses `MutationObserver` to re-inject the inject-button on dynamic content. Enter sends; Shift+Enter inserts a newline.
  - `amd/build/questionbot.min.js` — built artifact (must be regenerated after `src` changes; Moodle loads `build/` in production). Currently a verbatim copy of `src/`.
  - `ajax.php` — Moodle endpoint. Receives `{ kind, ... }` from JS, builds the upstream `question` (Hebrew aviation-instructor framing for `kind=initial`; raw user message for `kind=followup`), and **POSTs** `{ username, course, question }` as JSON to the upstream API. Forwards `answer` and `sessionId` (when present) back to the JS caller.
  - `settings.php` + `lang/{en,he}/local_questionbot.php` — admin settings + translations.
  - `local_questionbot.zip` — packaged plugin for Moodle install.

- `api/` — Vercel serverless functions, **orphaned from the popup flow**.
  - `stats.js` — reads Supabase `question_logs` for the dashboard, returns `{ totalQuestions, rows }`. Still wired up to the root `dashboard.html`.
  - `dashboard.html` — older/stale dashboard (expects `topQuestions/courses/topUsers/latest` shapes that `stats.js` no longer returns). Don't edit unless you also update `stats.js` to match.

- `dashboard.html` (root) — the **active** Hebrew/RTL dashboard. Reads `/api/stats`. Recent work has been here.

The legacy `api/chat.js` (direct-OpenAI Vercel function) was removed in #2 once the popup migrated fully to skytutor-agent.

## External dependencies

- **skytutor-agent** — separate project at `/Users/oradeldar/projects/skytutor-agent`, deployed to `https://skytutor-agent.vercel.app`. The popup talks to its `/api/moodle/chat` POST endpoint, which expects `{ question, username, course }` and returns `{ answer, sessionId }`. Multi-turn continuity is automatic (the endpoint scopes a session per Moodle user per day). System prompt + RAG live in that project, not here.
- **Production API URL** — `https://skytutor-agent.vercel.app/api/moodle/chat/` (hardcoded as fallback in `QBot/questionbot/ajax.php` if the plugin's `apiurl` setting is empty).
- **Supabase** (still used by the dashboard only) — table `question_logs`. Env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (code also accepts the typo'd `SUPBASE_*` and a few other aliases — leave the fallbacks alone unless cleaning up env config).

A root `package.json` exists for **dev tooling only** (`vitest`, `jsdom`, `@playwright/test`). Vercel ignores `devDependencies` for serverless functions — the `/api` deploy is unaffected. No `vercel.json`. No CI yet.

## Tests

All test code lives under `tests/` and is **non-invasive** — production source in `QBot/questionbot/` is untouched. Layers:

1. **JS unit (jsdom)** — `tests/unit/questionbot/*.dom.test.js`. Loads `amd/src/questionbot.js` via an AMD `define` shim and drives `init()` against a synthesized DOM.
   - `scrape.dom.test.js` — `cleanText`, `getQuestion`, `getAnswers` (three labelling fallbacks, length filter, dedup, prefix stripping).
   - `inject.dom.test.js` — button injection per `.que`, `data-qb` guard, `MutationObserver` re-injection.
   - `send.dom.test.js` — initial-turn request shape (`kind: "initial"`), assistant-bubble rendering, fallback / error bubble paths, inject-button debounce, close button.
   - `chat.dom.test.js` — multi-turn behavior: שלח/Enter sends `kind: "followup"`; Shift+Enter newlines; thread accumulates bubbles in order; send-button debounce while a follow-up is in flight; empty/whitespace input is a no-op; error during a follow-up renders an error bubble without locking the input.
2. **Browser-visible mock Moodle** — `tests/mock-moodle/{index.html,server.js}`. A static page that mimics a real quiz attempt (three `.que` blocks, all three labelling patterns) + a tiny no-deps Node server that stands in for `ajax.php`. The mock server understands `kind=initial|followup`, returns a stable `sessionId`, and produces a distinct follow-up reply per turn. Scenario picker: `success` / `slow-3s` / `401` / `network-error` / `dynamic-question`.
3. **Playwright E2E** — `tests/e2e/full-flow.spec.ts`. Drives the mock page above; asserts injection, initial-turn request shape, follow-up turn (kind=followup, distinct second assistant bubble), error rendering, send-button debounce, inject-button debounce, MutationObserver.

## Conventions to honor

- **Hebrew + RTL everywhere user-facing.** HTML uses `lang="he" dir="rtl"`. Keep new UI consistent.
- **Plain text answers only.** skytutor-agent's `cleanAnswer` strips Markdown / LaTeX before responding. The popup renders responses with `.innerText` — do not switch to `.innerHTML`.
- **Aviation domain.** Answers should explain reasoning (not just the final choice) and prefer principles from Oxford/FAA literature. Don't fabricate aviation data.
- **Two dashboards exist.** Root `dashboard.html` is canonical. `api/dashboard.html` is stale — flag before editing.
- **The popup is the only intended caller of `ajax.php`.** Don't widen the request shape with aliases — if a new caller needs to use `ajax.php`, add an explicit branch.
- **Server-side session continuity.** Don't try to manage `sessionId` from the JS side; skytutor-agent derives it from `username` + the current date. The JS only needs to keep sending `kind=followup` turns to the same proxy.

## Things to watch

- After editing `amd/src/questionbot.js`, the matching `amd/build/questionbot.min.js` must be regenerated; Moodle serves the build artifact, not the source. Today that's just `cp src/questionbot.js build/questionbot.min.js`.
- `ajax.php` already POSTs upstream — long Hebrew questions are no longer at risk of URL-length truncation.
- The `kind=initial` branch in `ajax.php` still prepends the Hebrew aviation-instructor framing; the `kind=followup` branch forwards the user's message verbatim. Keep the framing in sync if you update the upstream system prompt in skytutor-agent.
- The Supabase env-var fallbacks include misspellings (`SUPBASE_URL`). Treat that as a bug compatibility layer in the dashboard path, not a target.

## Workflow rules (from global instructions)

- Never commit directly to `main`. Branch, bump patch version (here that's `$plugin->version` in `QBot/questionbot/version.php` for plugin changes), open issue, open PR linking `Closes #N`.
- Never `--no-verify`, never force-push `main`, confirm before destructive ops.
