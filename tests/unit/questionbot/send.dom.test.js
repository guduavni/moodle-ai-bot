// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadQuestionBot, defaultConfig, resetDom, tick } from "./_load.js";

const QB = loadQuestionBot();

beforeEach(() => {
  resetDom();
  vi.restoreAllMocks();
});

function basicQue() {
  document.body.innerHTML = `
    <div class="que">
      <div class="qtext">Q?</div>
      <div class="answer">
        <div class="r0"><input type="radio" id="x1"><label for="x1">alpha</label></div>
      </div>
    </div>
  `;
}

function assistantText() {
  const bubble = document.querySelector("#qb-answer-box .qb-bubble-assistant");
  return bubble ? (bubble.innerText || bubble.textContent || "") : "";
}

describe("send() — request shape", () => {
  it("POSTs JSON with sesskey, kind=initial, and the scraped question/answers", async () => {
    basicQue();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "ok" })
    });
    globalThis.fetch = fetchMock;

    QB.init(defaultConfig({ ajaxurl: "/local/questionbot/ajax.php", sesskey: "abc123" }));
    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/local/questionbot/ajax.php?sesskey=abc123");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("same-origin");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(opts.body);
    expect(sent).toMatchObject({
      kind: "initial",
      questiontext: "Q?",
      answers: ["alpha"],
      courseid: 42,
      coursename: "Aviation Theory"
    });
    // Initial turns must not carry a `message` field — that's followup-only.
    expect(sent.message).toBeUndefined();
  });

  it("renders data.answer text into the assistant bubble", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "Hebrew answer text" })
    });
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    expect(document.getElementById("qb-answer-box")).not.toBeNull();
    expect(assistantText()).toBe("Hebrew answer text");
  });

  it("seeds a user bubble with the scraped question and numbered options", async () => {
    basicQue();
    let resolveFetch;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveFetch = r; })
    );
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);

    const userBubble = document.querySelector("#qb-answer-box .qb-bubble-user");
    expect(userBubble).not.toBeNull();
    const text = userBubble.innerText || userBubble.textContent;
    expect(text).toContain("Q?");
    expect(text).toContain("1. alpha");

    // While the request is pending the assistant bubble shows the loading dots,
    // not the answer text yet.
    const assistant = document.querySelector("#qb-answer-box .qb-bubble-assistant");
    expect(assistant).not.toBeNull();
    expect(assistant.querySelectorAll(".qb-loading-dot").length).toBe(3);

    resolveFetch({ json: async () => ({ answer: "done" }) });
    await tick(0);
    await tick(0);
  });

  it("falls back to 'לא התקבלה תשובה' when data.answer missing", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => ({}) });
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    expect(assistantText()).toMatch(/לא התקבלה תשובה/);
  });

  it("renders 'שגיאה: ...' in an error bubble when fetch rejects", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const errBubble = document.querySelector("#qb-answer-box .qb-bubble-error");
    expect(errBubble).not.toBeNull();
    const text = errBubble.innerText || errBubble.textContent;
    expect(text).toMatch(/שגיאה.*network down/);
  });

  it("debounces inject-button double-clicks while the initial request is in-flight", async () => {
    basicQue();
    let resolveFetch;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveFetch = r; })
    );
    globalThis.fetch = fetchMock;

    QB.init(defaultConfig());

    const btn = document.querySelector(".questionbot-btn");
    btn.click();
    btn.click();
    btn.click();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(btn.dataset.qbLoading).toBe("1");
    expect(btn.disabled).toBe(true);

    resolveFetch({ json: async () => ({ answer: "done" }) });
    await tick(0);
    await tick(0);

    expect(btn.dataset.qbLoading).toBe("0");
    expect(btn.disabled).toBe(false);
  });

  it("close button removes the chat panel", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "ok" })
    });
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const close = document.getElementById("qb-close");
    expect(close).not.toBeNull();
    close.click();
    expect(document.getElementById("qb-answer-box")).toBeNull();
  });
});
