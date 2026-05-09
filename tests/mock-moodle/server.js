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

// Live skytutor proxy config — only used when scenario=live.
const SKYTUTOR_API_URL = process.env.SKYTUTOR_API_URL || "https://skytutor-agent.vercel.app/api/moodle/chat/";
const SKYTUTOR_USERNAME = process.env.SKYTUTOR_USERNAME || "admin";
const SKYTUTOR_COURSE_OVERRIDE = process.env.SKYTUTOR_COURSE || "";

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

/**
 * Mirror the prompt-building behavior of QBot/questionbot/ajax.php for the
 * `live` scenario, so a real skytutor call sees the same upstream payload it
 * would see in production.
 */
function buildUpstreamQuestion(parsed) {
  const kind = parsed && parsed.kind ? String(parsed.kind) : "initial";

  if (kind === "followup") {
    return String((parsed && parsed.message) || "").trim();
  }

  const questiontext = String((parsed && parsed.questiontext) || "").trim();
  const answersList = (parsed && Array.isArray(parsed.answers)) ? parsed.answers : [];

  let q = "ענה בעברית כמדריך תאוריה תעופתית מקצועי.\n\n";
  q += "הסבר את השאלה הבאה לחניך טיס פרטי.\n";
  q += "אל תסתפק בתשובה קצרה. הסבר את העיקרון התעופתי, את דרך החשיבה, ולמה תשובות אחרות אינן מתאימות אם ניתן להסיק זאת מהנתונים.\n\n";
  q += "שאלה:\n" + questiontext + "\n\n";

  if (answersList.length > 0) {
    let answerstext = "";
    answersList.forEach((a, i) => {
      answerstext += (i + 1) + ". " + String(a).trim() + "\n";
    });
    q += "אפשרויות תשובה:\n" + answerstext;
  }

  return q;
}

async function proxyToSkytutor(parsed) {
  const question = buildUpstreamQuestion(parsed);
  if (!question) {
    return { status: 400, body: { answer: "שאלה ריקה — לא נשלחה ל-skytutor." } };
  }

  const course =
    SKYTUTOR_COURSE_OVERRIDE ||
    String((parsed && parsed.coursename) || "").trim() ||
    "ידע טכני כללי";

  const payload = {
    username: SKYTUTOR_USERNAME,
    course,
    question,
  };

  console.log("[live] → POST " + SKYTUTOR_API_URL);
  console.log("[live]   username=" + payload.username + " course=\"" + course + "\"");
  console.log("[live]   question (first 120): " + question.slice(0, 120).replace(/\n/g, " ") + (question.length > 120 ? "…" : ""));

  let res;
  try {
    res = await fetch(SKYTUTOR_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log("[live] ✗ network error: " + err.message);
    return { status: 502, body: { answer: "שגיאת רשת אל skytutor: " + err.message } };
  }

  const text = await res.text();
  console.log("[live] ← " + res.status + " (" + text.length + " bytes)");

  let parsedRes = null;
  try {
    parsedRes = JSON.parse(text);
  } catch {
    parsedRes = null;
  }

  if (res.status === 401) {
    return {
      status: 200,
      body: {
        answer:
          "skytutor החזיר 401 (לא מאומת).\n\n" +
          "נשלח: username=\"" + payload.username + "\", course=\"" + course + "\".\n" +
          "ודא שהמשתמש רשום לקורס במודל המוגדר ב-MOODLE_URL של skytutor."
      },
    };
  }

  if (res.status < 200 || res.status >= 300) {
    return {
      status: 200,
      body: {
        answer:
          "skytutor החזיר HTTP " + res.status + ".\n\n" +
          "תשובת שרת:\n" + (parsedRes ? JSON.stringify(parsedRes, null, 2) : text.slice(0, 800)),
      },
    };
  }

  if (!parsedRes) {
    return { status: 200, body: { answer: text || "(תגובה ריקה מ-skytutor)" } };
  }

  const answer =
    parsedRes.answer ||
    parsedRes.message ||
    parsedRes.response ||
    parsedRes.text ||
    JSON.stringify(parsedRes);

  const out = { answer };
  if (parsedRes.sessionId) out.sessionId = String(parsedRes.sessionId);
  return { status: 200, body: out };
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

    if (scenario === "live") {
      const result = await proxyToSkytutor(parsed);
      send(
        res,
        result.status,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify(result.body)
      );
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
  console.log("Scenarios: success / slow-3s / 401 / network-error / dynamic-question / live (skytutor).");
  console.log("Live mode → " + SKYTUTOR_API_URL);
  console.log("           username=\"" + SKYTUTOR_USERNAME + "\"" +
    (SKYTUTOR_COURSE_OVERRIDE ? " course=\"" + SKYTUTOR_COURSE_OVERRIDE + "\" (env override)" : " course=<from page coursename>"));
});
