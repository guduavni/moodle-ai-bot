#!/usr/bin/env node
// Mock Moodle + ajax.php for the question-bot demo.
// No external deps. Run: node tests/mock-moodle/server.js

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const QB_JS = path.join(
  REPO_ROOT,
  "QBot",
  "questionbot",
  "amd",
  "src",
  "questionbot.js"
);

const PORT = Number(process.env.PORT || 3030);

const INITIAL_ANSWER =
  "הזדקרות היא תופעה אווירודינמית שמתרחשת כאשר זווית התקיפה עוברת את הזווית הקריטית — בכל תנאי טיסה, כולל טיסה ישרה ואופקית. המהירות אינה הגורם הישיר.\n\n" +
  "ברגע שזווית התקיפה חורגת מעבר לערך הקריטי, זרימת האוויר על פני הכנף מאבדת את ההצמדה (separation), מקדם העילוי צונח באופן חד וכוח העילוי קורס.\n\n" +
  "מהירות ההזדקרות היא נגזרת של אותה זווית קריטית: ככל שהמטוס כבד יותר או נמצא בעומס G גדול יותר, נדרשת מהירות גבוהה יותר כדי לייצר עילוי השווה למשקל לפני שמגיעים לזווית התקיפה הקריטית. זו הסיבה ל-Accelerated Stall — בפנייה חדה ההזדקרות תתרחש במהירות גבוהה יותר ממהירות ההזדקרות הנקייה.\n\n" +
  "(תשובה לדוגמה — נשלחה מהשרת המקומי, לא מ-skytutor.)";

// Per-day session counter that mimics skytutor's `moodle-YYYY-MM-DD-{actor}`
// scoping. Tests don't actually need persistence — they only need to see that
// follow-up turns get a different reply, and that a sessionId is returned.
const SESSION_ID = "moodle-mock-" + new Date().toISOString().split("T")[0];
let turnCounter = 0;

function buildFollowupAnswer(message, turn) {
  return (
    "תשובה להמשך השיחה (תור #" + turn + "):\n\n" +
    "השאלה שנשאלה: \"" + message + "\".\n\n" +
    "במצב אמיתי, skytutor משתמש בהיסטוריית הסשן " + SESSION_ID + " כדי להמשיך את ההסבר ברצף.\n" +
    "(תשובה לדוגמה — נשלחה מהשרת המקומי.)"
  );
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => resolve(buf));
  });
}

function serveStatic(res, file, contentType) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { "Content-Type": "text/plain" }, "not found");
    send(res, 200, { "Content-Type": contentType + "; charset=utf-8" }, data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return serveStatic(res, path.join(ROOT, "index.html"), "text/html");
  }

  if (req.method === "GET" && url.pathname === "/qb.js") {
    return serveStatic(res, QB_JS, "application/javascript");
  }

  if (req.method === "POST" && url.pathname === "/ajax") {
    const body = await readBody(req);
    const scenario = url.searchParams.get("scenario") || "success";
    const sesskey = url.searchParams.get("sesskey") || "";

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { error: "non-json body" };
    }

    console.log("\n[ajax] scenario=" + scenario + " sesskey=" + sesskey);
    console.log("[ajax] body=", parsed);

    if (scenario === "401") {
      return send(
        res,
        401,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ answer: "הבוט דחה את הבקשה (401)." })
      );
    }

    if (scenario === "network-error") {
      req.socket.destroy();
      return;
    }

    const kind = parsed && parsed.kind ? String(parsed.kind) : "initial";
    let answer;

    if (kind === "followup") {
      turnCounter += 1;
      const message = (parsed && parsed.message) ? String(parsed.message) : "";
      answer = buildFollowupAnswer(message, turnCounter + 1);
    } else {
      turnCounter = 1;
      answer = INITIAL_ANSWER;
    }

    const respond = () => {
      send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ answer, sessionId: SESSION_ID })
      );
    };

    if (scenario === "slow-3s") {
      setTimeout(respond, 3000);
      return;
    }

    respond();
    return;
  }

  send(res, 404, { "Content-Type": "text/plain" }, "not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("\nMock Moodle running at http://localhost:" + PORT);
  console.log("Open it in a browser, click ❓, then keep typing follow-ups.");
  console.log("Switch the scenario picker to test slow / 401 / network-error / dynamic-question.");
});
