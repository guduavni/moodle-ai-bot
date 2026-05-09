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

  test("happy path: click → POST to /ajax → answer panel renders Hebrew text", async ({ page }) => {
    await page.selectOption("#scenario-picker", "success");

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/ajax") && req.method() === "POST"
    );

    await page.locator(".questionbot-btn").first().click();

    const req = await requestPromise;
    expect(req.url()).toMatch(/sesskey=fake-sesskey-abc123/);

    const body = JSON.parse(req.postData() || "{}");
    expect(body).toMatchObject({
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
    await expect(panel).toContainText("הזדקרות");
  });

  test("error rendering: scenario=401 produces a Hebrew error in the panel", async ({ page }) => {
    await page.selectOption("#scenario-picker", "401");
    await page.locator(".questionbot-btn").first().click();

    const panel = page.locator("#qb-answer-box");
    await expect(panel).toBeVisible();
    // The plugin reads `data.answer` from the JSON body; the mock returns
    // { answer: "הבוט דחה את הבקשה (401)." } even on 401.
    await expect(panel).toContainText("דחה את הבקשה");
  });

  test("network error: scenario=network-error renders 'שגיאה: ...' in the panel", async ({ page }) => {
    await page.selectOption("#scenario-picker", "network-error");
    await page.locator(".questionbot-btn").first().click();

    const panel = page.locator("#qb-answer-box");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/שגיאה/);
  });

  test("debounce: rapid double-click fires only one network request", async ({ page }) => {
    await page.selectOption("#scenario-picker", "slow-3s");

    let calls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/ajax") && r.method() === "POST") calls++;
    });

    const btn = page.locator(".questionbot-btn").first();
    await btn.click();
    await btn.click({ force: true }).catch(() => {}); // disabled state may reject; ignore
    await btn.click({ force: true }).catch(() => {});

    // Wait long enough to be sure no second request goes out.
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
