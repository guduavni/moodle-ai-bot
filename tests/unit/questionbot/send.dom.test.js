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

describe("send() — request shape", () => {
  it("POSTs JSON with sesskey in query string", async () => {
    basicQue();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "ok" })
    });
    globalThis.fetch = fetchMock;

    QB.init(defaultConfig({ ajaxurl: "/local/questionbot/ajax.php", sesskey: "abc123" }));
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();
    await Promise.resolve();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/local/questionbot/ajax.php?sesskey=abc123");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("same-origin");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(opts.body);
    expect(sent).toMatchObject({
      questiontext: "Q?",
      answers: ["alpha"],
      courseid: 42,
      coursename: "Aviation Theory"
    });
  });

  it("renders data.answer text into #qb-answer-box", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ answer: "Hebrew answer text" })
    });
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const box = document.getElementById("qb-answer-box");
    expect(box).not.toBeNull();
    const inner = box.querySelector("div");
    expect(inner.innerText || inner.textContent).toBe("Hebrew answer text");
  });

  it("falls back to 'לא התקבלה תשובה' when data.answer missing", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockResolvedValue({ json: async () => ({}) });
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const inner = document.getElementById("qb-answer-box").querySelector("div");
    expect(inner.innerText || inner.textContent).toMatch(/לא התקבלה תשובה/);
  });

  it("renders 'שגיאה: ...' when fetch rejects", async () => {
    basicQue();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await tick(0);
    await tick(0);

    const inner = document.getElementById("qb-answer-box").querySelector("div");
    expect(inner.innerText || inner.textContent).toMatch(/שגיאה.*network down/);
  });

  it("debounces double-clicks while a request is in-flight", async () => {
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

  it("close button removes the answer panel", async () => {
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
