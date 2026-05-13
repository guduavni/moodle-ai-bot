# moodle-ai-bot

Go Yeda / SkyTutor — Hebrew aviation tutor for Moodle. A Moodle local plugin (`QBot/questionbot/`) injects an "❓ הסבר לי את השאלה" button into quiz pages; clicking it opens a multi-turn chat panel that talks to the **skytutor-agent** project (`https://skytutor-agent.vercel.app/api/moodle/chat`) via the plugin's `ajax.php` proxy. skytutor-agent runs the Hebrew system prompt, the RAG pipeline, and the per-day session memory; this repo is the Moodle-side glue.

A small Vercel function `api/chat.js` is also deployed at `https://moodle-ai-bot.vercel.app/api/chat` as a backwards-compat proxy. It accepts the legacy GET shape (`?username=&course=&q=`) and the new POST shape (`{question, username, course}`) and forwards both to skytutor — so existing plugin installs whose stored `apiurl` setting points at this URL keep working without admin intervention.

## Tests

All tests live under `tests/` and exercise production code without modifying it.

### One-time setup

```
npm install                          # vitest, jsdom, @playwright/test
npx playwright install chromium      # browser binary for E2E (one-time)
```

### Run everything

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest: jsdom DOM tests for `questionbot.js` + integration tests for the `api/chat.js` proxy |
| `npm run test:e2e` | Playwright headless against the mock Moodle page |
| `npm run test:e2e:headed` | Same, but in a visible Chromium window so you can watch it run |
| `npm run mock:moodle` | Serves the browser-visible QBot mock at http://localhost:3030 — open in a browser, click "❓", switch the scenario picker |
| `npm run mock:moodle:coursebot` | Serves the browser-visible Coursebot mock at http://localhost:3031 — open in a browser, click the floating logo (bottom-right), pick a scenario |

### What each layer covers

- **`tests/unit/questionbot/`** — JS DOM tests for the AMD module. Covers the three label-fallback patterns (`label[for=id]` / wrapped `<input>` inside `<label>` / row-clone fallback), question-text scraping, boilerplate filtering, length and dedup filters, button injection, MutationObserver re-injection, the multi-turn chat panel (Enter sends, Shift+Enter newlines, send-button debounce, error bubble path, close-during-fetch race guard).
- **`tests/integration/chat-handler.test.js`** — drives the `api/chat.js` proxy handler with a stubbed `globalThis.fetch`. Covers GET-vs-POST dispatch, param-name aliases (`q` / `question` / `questionText` / `message` / `amp;q`), missing-question 400, skytutor 401 / non-2xx / network errors all reshaped to Hebrew `{answer}` for the legacy plugin, and sessionId pass-through.
- **`tests/mock-moodle/`** — a static Hebrew/RTL page that mimics a real quiz attempt with all three label patterns, served by a tiny dependency-free Node server that stands in for `ajax.php`. Scenario picker: `success`, `slow-3s`, `401`, `network-error`, `dynamic-question`, `live` (proxies straight to production skytutor for manual smoke tests). Use this to demo or debug end-to-end without touching real Moodle.
- **`tests/mock-moodle-coursebot/`** — parallel browser-visible mock for the `local_coursebot` plugin. Static `/course/view.php`-shaped page that loads `coursebot/amd/src/chat.js` and a no-deps Node server that stands in for `coursebot/ajax.php`. Scenario picker: `success`, `slow-3s`, `401`, `refusal`, `network-error`, `live` (skytutor direct), `live-proxy` (through deployed `api/chat`). Run with `npm run mock:moodle:coursebot`.
- **`tests/e2e/full-flow.spec.ts`** — Playwright drives the mock page above and asserts injection, initial-turn request shape, follow-up turns, error rendering, send-button debounce, inject-button debounce, and MutationObserver behavior.

### Running just one file

```
npx vitest run tests/unit/questionbot/scrape.dom.test.js
npx playwright test tests/e2e/full-flow.spec.ts --headed
```
