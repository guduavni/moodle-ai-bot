// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadQuestionBot, defaultConfig, resetDom, tick } from "./_load.js";

const QB = loadQuestionBot();

beforeEach(() => {
  resetDom();
});

describe("inject() — button injection into .que blocks", () => {
  it("adds one button per .que with .qtext", () => {
    document.body.innerHTML = `
      <div class="que"><div class="qtext">Q1?</div><div class="answer"></div></div>
      <div class="que"><div class="qtext">Q2?</div><div class="answer"></div></div>
    `;

    QB.init(defaultConfig());

    expect(document.querySelectorAll(".questionbot-btn").length).toBe(2);
    document.querySelectorAll(".que").forEach((q) => {
      expect(q.getAttribute("data-qb")).toBe("1");
      expect(q.querySelector(".qtext .questionbot-btn")).not.toBeNull();
    });
  });

  it("uses configured buttontext", () => {
    document.body.innerHTML = `<div class="que"><div class="qtext">Q?</div></div>`;
    QB.init(defaultConfig({ buttontext: "Explain this" }));

    const btn = document.querySelector(".questionbot-btn");
    expect(btn.innerText || btn.textContent).toBe("Explain this");
  });

  it("skips .que blocks that have no .qtext", () => {
    document.body.innerHTML = `
      <div class="que"><div class="answer"></div></div>
      <div class="que"><div class="qtext">has qtext</div></div>
    `;
    QB.init(defaultConfig());
    expect(document.querySelectorAll(".questionbot-btn").length).toBe(1);
  });

  it("does not double-inject if init runs twice (data-qb='1' guard)", () => {
    document.body.innerHTML = `<div class="que"><div class="qtext">Q?</div></div>`;
    QB.init(defaultConfig());
    QB.init(defaultConfig()); // second call
    expect(document.querySelectorAll(".questionbot-btn").length).toBe(1);
  });

  it("MutationObserver re-injects when a new .que is appended", async () => {
    document.body.innerHTML = `<div class="que"><div class="qtext">Q1?</div></div>`;
    QB.init(defaultConfig());
    expect(document.querySelectorAll(".questionbot-btn").length).toBe(1);

    const fresh = document.createElement("div");
    fresh.className = "que";
    fresh.innerHTML = `<div class="qtext">Q2 dynamic?</div>`;
    document.body.appendChild(fresh);

    // MutationObserver records are delivered on a microtask. Yield a few times
    // because the observer callback itself queues another microtask via inject().
    await tick(0);
    await tick(0);
    await tick(0);

    expect(document.querySelectorAll(".questionbot-btn").length).toBe(2);
    expect(fresh.getAttribute("data-qb")).toBe("1");
  });
});
