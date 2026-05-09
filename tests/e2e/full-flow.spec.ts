import { test, expect } from "@playwright/test";

test.describe("Mock Moodle quiz — question bot end-to-end", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the AMD module to register and inject() to run.
    await page.waitForFunction(() => document.querySelectorAll(".questionbot-btn").length > 0);
  });

  test("injects exactly one button per .que on initial load", async ({ page }) => {
    const buttonCount = await page.locator(".questionbot-btn").count();
    const queCount = await page.locator(".que").count();
    expect(buttonCount).toBe(queCount);
    expect(buttonCount).toBeGreaterThanOrEqual(3);
  });

  test("happy path: click → POST kind=initial → answer renders in an assistant bubble", async ({ page }) => {
    await page.selectOption("#scenario-picker", "success");

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/ajax") && req.method() === "POST"
    );

    await page.locator(".questionbot-btn").first().click();

    const req = await requestPromise;
    expect(req.url()).toMatch(/sesskey=fake-sesskey-abc123/);

    const body = JSON.parse(req.postData() || "{}");
    expect(body).toMatchObject({
      kind: "initial",
      courseid: 42,
      coursename: "מבוא לתאוריה תעופתית"
    });
    expect(body.questiontext).toContain("הזדקרות");
    expect(Array.isArray(body.answers)).toBe(true);
    expect(body.answers.length).toBeGreaterThan(0);

    // Sanity: the bot's own button text must never be scraped as an answer,
    // even if it happens to be inside .qtext when the click handler runs.
    expect(body.answers.some((a: string) => a.includes("הסבר לי את השאלה"))).toBe(false);

    const panel = page.locator("#qb-answer-box");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".qb-bubble-assistant")).toContainText("הזדקרות");

    // Seeded user bubble shows the original question + numbered options.
    await expect(panel.locator(".qb-bubble-user").first()).toContainText("הזדקרות");
  });

  test("follow-up turn: typing a question + שלח sends kind=followup and adds a second assistant bubble", async ({ page }) => {
    await page.selectOption("#scenario-picker", "success");
    await page.locator(".questionbot-btn").first().click();

    // Wait for the initial assistant bubble to settle.
    await expect(page.locator("#qb-answer-box .qb-bubble-assistant").first()).toContainText("הזדקרות");

    const followupRequest = page.waitForRequest((req) =>
      req.url().includes("/ajax") && req.method() === "POST"
    );

    await page.locator("#qb-input").fill("תוכל להסביר את עיקרון ברנולי?");
    await page.locator("#qb-send").click();

    const req = await followupRequest;
    const body = JSON.parse(req.postData() || "{}");
    expect(body).toMatchObject({
      kind: "followup",
      message: "תוכל להסביר את עיקרון ברנולי?"
    });
    // Followups must NOT carry the structured initial-turn fields.
    expect(body.questiontext).toBeUndefined();
    expect(body.answers).toBeUndefined();

    // Two assistant bubbles in the thread, in order.
    const assistantBubbles = page.locator("#qb-answer-box .qb-bubble-assistant");
    await expect(assistantBubbles).toHaveCount(2);
    await expect(assistantBubbles.nth(1)).toContainText("תור #");
  });

  test("send-button debounce: clicking שלח twice while a follow-up is pending fires only one request", async ({ page }) => {
    await page.selectOption("#scenario-picker", "success");
    await page.locator(".questionbot-btn").first().click();
    await expect(page.locator("#qb-answer-box .qb-bubble-assistant").first()).toContainText("הזדקרות");

    // Switch to slow-3s so the followup hangs long enough to retry the click.
    await page.selectOption("#scenario-picker", "slow-3s");

    let followupCalls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/ajax") && r.method() === "POST") followupCalls++;
    });

    await page.locator("#qb-input").fill("שאלה נוספת");
    const sendBtn = page.locator("#qb-send");
    await sendBtn.click();
    await sendBtn.click({ force: true }).catch(() => {});
    await sendBtn.click({ force: true }).catch(() => {});

    await page.waitForTimeout(500);
    expect(followupCalls).toBe(1);

    // Cleanup: wait for the slow response so the test exits cleanly.
    await page.waitForResponse((r) => r.url().includes("/ajax"));
  });

  test("error rendering: scenario=401 produces a Hebrew error in an assistant bubble", async ({ page }) => {
    await page.selectOption("#scenario-picker", "401");
    await page.locator(".questionbot-btn").first().click();

    const panel = page.locator("#qb-answer-box");
    await expect(panel).toBeVisible();
    // The plugin reads `data.answer` from the JSON body; the mock returns
    // { answer: "הבוט דחה את הבקשה (401)." } even on 401, so it lands in the
    // assistant bubble (this exercises the proxy's resilient JSON parsing path,
    // not the .catch network-error path).
    await expect(panel.locator(".qb-bubble-assistant")).toContainText("דחה את הבקשה");
  });

  test("network error: scenario=network-error renders 'שגיאה: ...' in an error bubble", async ({ page }) => {
    await page.selectOption("#scenario-picker", "network-error");
    await page.locator(".questionbot-btn").first().click();

    const panel = page.locator("#qb-answer-box");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".qb-bubble-error")).toContainText(/שגיאה/);
  });

  test("inject-button debounce: rapid double-click on ❓ fires only one initial request", async ({ page }) => {
    await page.selectOption("#scenario-picker", "slow-3s");

    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/ajax") && r.method() === "POST") calls++;
    });

    const btn = page.locator(".questionbot-btn").first();
    await btn.click();
    await btn.click({ force: true }).catch(() => {});
    await btn.click({ force: true }).catch(() => {});

    await page.waitForTimeout(500);
    expect(calls).toBe(1);

    // Cleanup: wait for the slow response so the test exits cleanly.
    await page.waitForResponse((r) => r.url().includes("/ajax"));
  });

  test("MutationObserver: scenario=dynamic-question gives the new .que its own button", async ({ page }) => {
    const initialCount = await page.locator(".questionbot-btn").count();
    await page.selectOption("#scenario-picker", "dynamic-question");

    // The picker change handler appends a new .que; the observer should re-inject.
    await expect(page.locator("#dynamic-q .questionbot-btn")).toBeVisible();
    const finalCount = await page.locator(".questionbot-btn").count();
    expect(finalCount).toBe(initialCount + 1);
  });
});
