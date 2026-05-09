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

/**
 * Open the chat by clicking the inject button, resolve the initial fetch
 * with `initialAnswer`, and return helpers + the fetch mock so each test
 * can drive follow-ups from a known starting state.
 */
async function openChatAndResolveInitial(initialAnswer) {
  basicQue();

  const fetchMock = vi.fn();
  let pendingResolve = null;
  fetchMock.mockImplementation(
    () => new Promise((resolve) => { pendingResolve = resolve; })
  );
  globalThis.fetch = fetchMock;

  QB.init(defaultConfig());
  document.querySelector(".questionbot-btn").click();
  await tick(0);

  // Resolve the initial turn.
  pendingResolve({ json: async () => ({ answer: initialAnswer }) });
  await tick(0);
  await tick(0);

  return {
    fetchMock,
    input: () => document.getElementById("qb-input"),
    sendBtn: () => document.getElementById("qb-send"),
    bubbles: () =>
      Array.from(document.querySelectorAll("#qb-thread > .qb-bubble")),
    nextResolve: () => pendingResolve,
    setNextResolve: (fn) => { pendingResolve = fn; },
  };
}

describe("multi-turn chat — follow-up turns", () => {
  it("clicking שלח sends a follow-up POST with kind=followup and the typed message", async () => {
    const ctx = await openChatAndResolveInitial("first answer");

    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);

    // Wire a fresh in-flight promise for the next call.
    let resolveFollowup;
    ctx.fetchMock.mockImplementationOnce(
      () => new Promise((r) => { resolveFollowup = r; })
    );

    ctx.input().value = "תוכל להסביר את עיקרון ברנולי?";
    ctx.sendBtn().click();
    await tick(0);

    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
    const [url, opts] = ctx.fetchMock.mock.calls[1];
    expect(url).toMatch(/sesskey=/);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      kind: "followup",
      message: "תוכל להסביר את עיקרון ברנולי?",
    });
    // Followups must not include the structured initial-turn fields.
    expect(body.questiontext).toBeUndefined();
    expect(body.answers).toBeUndefined();

    resolveFollowup({ json: async () => ({ answer: "second answer" }) });
    await tick(0);
    await tick(0);

    const bubbles = ctx.bubbles();
    // Order: seed-user, assistant#1, follow-up-user, assistant#2.
    expect(bubbles).toHaveLength(4);
    expect(bubbles[0].className).toContain("qb-bubble-user");
    expect(bubbles[1].className).toContain("qb-bubble-assistant");
    expect(bubbles[1].innerText || bubbles[1].textContent).toBe("first answer");
    expect(bubbles[2].className).toContain("qb-bubble-user");
    expect(bubbles[2].innerText || bubbles[2].textContent).toBe(
      "תוכל להסביר את עיקרון ברנולי?"
    );
    expect(bubbles[3].className).toContain("qb-bubble-assistant");
    expect(bubbles[3].innerText || bubbles[3].textContent).toBe("second answer");
  });

  it("Enter (without Shift) sends; Shift+Enter inserts a newline", async () => {
    const ctx = await openChatAndResolveInitial("ok");

    let resolveFollowup;
    ctx.fetchMock.mockImplementationOnce(
      () => new Promise((r) => { resolveFollowup = r; })
    );

    const input = ctx.input();

    // Shift+Enter should NOT send.
    input.value = "line1";
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await tick(0);
    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);

    // Plain Enter sends.
    input.value = "send me";
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    }));
    await tick(0);
    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);

    const body = JSON.parse(ctx.fetchMock.mock.calls[1][1].body);
    expect(body.kind).toBe("followup");
    expect(body.message).toBe("send me");

    resolveFollowup({ json: async () => ({ answer: "done" }) });
    await tick(0);
    await tick(0);
  });

  it("clicking send while a follow-up is in flight does not fire a second request", async () => {
    const ctx = await openChatAndResolveInitial("first");

    let resolveFollowup;
    ctx.fetchMock.mockImplementationOnce(
      () => new Promise((r) => { resolveFollowup = r; })
    );

    ctx.input().value = "Q2";
    ctx.sendBtn().click();
    await tick(0);

    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);
    expect(ctx.sendBtn().disabled).toBe(true);
    expect(ctx.input().disabled).toBe(true);

    // Try to send again while the previous is still pending.
    ctx.input().value = "Q3";
    ctx.sendBtn().click();
    ctx.sendBtn().click();
    await tick(0);
    expect(ctx.fetchMock).toHaveBeenCalledTimes(2);

    resolveFollowup({ json: async () => ({ answer: "second" }) });
    await tick(0);
    await tick(0);

    expect(ctx.sendBtn().disabled).toBe(false);
    expect(ctx.input().disabled).toBe(false);
  });

  it("empty / whitespace-only input does not fire a request", async () => {
    const ctx = await openChatAndResolveInitial("first");

    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);

    ctx.input().value = "";
    ctx.sendBtn().click();
    ctx.input().value = "    ";
    ctx.sendBtn().click();
    await tick(0);

    expect(ctx.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("error during a follow-up renders an error bubble but keeps the input usable", async () => {
    const ctx = await openChatAndResolveInitial("first");

    ctx.fetchMock.mockImplementationOnce(
      () => Promise.reject(new Error("boom"))
    );

    ctx.input().value = "Q2";
    ctx.sendBtn().click();
    await tick(0);
    await tick(0);

    const errBubble = document.querySelector("#qb-answer-box .qb-bubble-error");
    expect(errBubble).not.toBeNull();
    const text = errBubble.innerText || errBubble.textContent;
    expect(text).toMatch(/שגיאה.*boom/);

    expect(ctx.sendBtn().disabled).toBe(false);
    expect(ctx.input().disabled).toBe(false);
  });
});
