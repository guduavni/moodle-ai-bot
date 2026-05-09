// Loads QBot/questionbot/amd/src/questionbot.js into a jsdom environment.
// The source is an AMD module: it calls define(name, deps, factory). We shim
// `define` to capture the factory return value so tests can drive `init()`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QB_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "QBot",
  "questionbot",
  "amd",
  "src",
  "questionbot.js"
);

export function loadQuestionBot() {
  const src = fs.readFileSync(QB_PATH, "utf8");
  let captured;
  globalThis.define = function (name, deps, factory) {
    captured = factory();
  };
  globalThis.define.amd = true;

  // Evaluate the AMD source in the current realm so it can register against define().
  // eslint-disable-next-line no-new-func
  new Function(src)();

  if (!captured || typeof captured.init !== "function") {
    throw new Error("questionbot.js did not export init() via define()");
  }
  return captured;
}

export function tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

export function defaultConfig(overrides = {}) {
  return {
    ajaxurl: "/ajax",
    sesskey: "fake-sesskey",
    buttontext: "❓ הסבר לי את השאלה",
    courseid: 42,
    coursename: "Aviation Theory",
    rtl: true,
    ...overrides
  };
}

// Reset the document body, remove the global panel if any, and clear the AMD shim.
export function resetDom() {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  const old = document.getElementById("qb-answer-box");
  if (old) old.remove();
}
