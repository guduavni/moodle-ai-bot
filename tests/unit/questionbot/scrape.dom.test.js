// @vitest-environment jsdom
//
// These tests cover the cleanText / getQuestion / getAnswers logic indirectly,
// by triggering the button click through a stubbed fetch and inspecting the
// JSON body the JS would have sent to ajax.php.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadQuestionBot, defaultConfig, resetDom } from "./_load.js";

const QB = loadQuestionBot();

function stubFetch() {
  const calls = [];
  globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
    calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({
      json: async () => ({ answer: "stub answer" })
    });
  });
  return calls;
}

beforeEach(() => {
  resetDom();
  vi.restoreAllMocks();
});

describe("getQuestion + cleanText", () => {
  it("strips Hebrew and English boilerplate from the question text", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">
          ❓ הסבר לי את השאלה
          What is stall? Select one:
        </div>
        <div class="answer">
          <div class="r0"><input type="radio" id="x"><label for="x">a. correct</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());

    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.questiontext).toBe("What is stall?");
  });

  it("returns empty when .qtext is absent (and ajax.php returns Hebrew error in real flow)", async () => {
    // Construct a .que with no qtext — inject() should skip it entirely.
    document.body.innerHTML = `<div class="que"><div class="answer"></div></div>`;
    stubFetch();
    QB.init(defaultConfig());
    expect(document.querySelectorAll(".questionbot-btn").length).toBe(0);
  });
});

describe("getAnswers — three labelling fallbacks", () => {
  it("standard <input id> + <label for>", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio" id="a1"><label for="a1">a. alpha</label></div>
          <div class="r1"><input type="radio" id="a2"><label for="a2">b. beta</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["alpha", "beta"]);
  });

  it("input wrapped inside its <label>", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><label><input type="radio"> wrapped one</label></div>
          <div class="r1"><label><input type="radio"> wrapped two</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["wrapped one", "wrapped two"]);
  });

  it("input alone in .r0/.r1 (no <label>) — falls back to row-clone text", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio"> only the row text</div>
          <div class="r1"><input type="radio"> another row text</div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["only the row text", "another row text"]);
  });
});

describe("getAnswers — filters", () => {
  it("drops 'איפוס' / 'Clear my choice' / boilerplate text", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio" id="g1"><label for="g1">a. valid one</label></div>
          <div class="r1"><input type="radio" id="g2"><label for="g2">איפוס הבחירה שלי</label></div>
          <div class="r2"><input type="radio" id="g3"><label for="g3">Clear my choice</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["valid one"]);
  });

  it("drops answers longer than 180 chars", async () => {
    const long = "x".repeat(200);
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio" id="s1"><label for="s1">short</label></div>
          <div class="r1"><input type="radio" id="s2"><label for="s2">${long}</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["short"]);
  });

  it("dedupes duplicate answers", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio" id="d1"><label for="d1">same</label></div>
          <div class="r1"><input type="radio" id="d2"><label for="d2">same</label></div>
          <div class="r2"><input type="radio" id="d3"><label for="d3">unique</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["same", "unique"]);
  });

  it("strips letter prefixes 'a.' / 'א.' / '1.'", async () => {
    document.body.innerHTML = `
      <div class="que">
        <div class="qtext">Q?</div>
        <div class="answer">
          <div class="r0"><input type="radio" id="p1"><label for="p1">a. english</label></div>
          <div class="r1"><input type="radio" id="p2"><label for="p2">א. עברית</label></div>
          <div class="r2"><input type="radio" id="p3"><label for="p3">1. numbered</label></div>
        </div>
      </div>
    `;
    const calls = stubFetch();
    QB.init(defaultConfig());
    document.querySelector(".questionbot-btn").click();
    await Promise.resolve();

    expect(calls[0].body.answers).toEqual(["english", "עברית", "numbered"]);
  });
});
