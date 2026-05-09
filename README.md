# moodle-ai-bot

Go Yeda / SkyTutor — Hebrew aviation tutor for Moodle. A Moodle local plugin (`QBot/questionbot/`) injects an "❓ הסבר לי את השאלה" button into quiz pages; clicking it sends the question to a Vercel serverless function (`api/chat.js`) that calls OpenAI and returns a Hebrew explanation.

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
| `npm test` | Vitest: jsdom DOM tests for `questionbot.js` + integration tests for `api/chat.js` (~34 specs, ~1s) |
| `npm run test:e2e` | Playwright headless against the mock Moodle page (~6 specs) |
| `npm run test:e2e:headed` | Same, but in a visible Chromium window so you can watch it run |
| `npm run mock:moodle` | Serves the browser-visible mock at http://localhost:3030 — open in a browser, click "❓", switch the scenario picker |

### What each layer covers

- **`tests/unit/questionbot/`** — JS DOM tests for the AMD module. Verifies the three label-fallback patterns (`label[for=id]` / wrapped `<input>` inside `<label>` / row-clone fallback), question-text scraping, boilerplate filtering, length and dedup filters, button injection, MutationObserver re-injection, request shape, debounce, error rendering.
- **`tests/integration/chat-handler.test.js`** — drives the `api/chat.js` default-export handler with a stubbed `globalThis.fetch`. Covers GET vs POST, missing/short question, missing `OPENAI_API_KEY`, OpenAI error forwarding, `cleanAnswer` Markdown/LaTeX stripping, Supabase logging on/off and failure resilience.
- **`tests/mock-moodle/`** — a static Hebrew/RTL page that mimics a real quiz attempt with all three label patterns, served by a tiny dependency-free Node server that stands in for `ajax.php`. Scenario picker: `success`, `slow-3s`, `401`, `network-error`, `dynamic-question`. Use this to demo or debug end-to-end without touching real Moodle.
- **`tests/e2e/full-flow.spec.ts`** — Playwright drives the mock page above and asserts injection, request shape, error rendering, debounce, MutationObserver.

### Running just one file

```
npx vitest run tests/unit/questionbot/scrape.dom.test.js
npx playwright test tests/e2e/full-flow.spec.ts --headed
```
