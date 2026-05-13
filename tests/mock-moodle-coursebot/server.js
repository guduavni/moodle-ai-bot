#!/usr/bin/env node
// Mock Moodle + coursebot/ajax.php for browser-visible Coursebot demo.
// No external deps. Run: node tests/mock-moodle-coursebot/server.js

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CB_JS = path.join(REPO_ROOT, "coursebot", "amd", "src", "chat.js");
const CB_LOGO = path.join(REPO_ROOT, "coursebot", "pix", "logo.png");

const PORT = Number(process.env.PORT || 3031);

// Upstream URLs for the live scenarios.
//   `live`        → straight to skytutor (bypasses api/chat.js).
//   `live-proxy`  → through the deployed api/chat proxy on moodle-ai-bot.vercel.app.
const SKYTUTOR_API_URL = process.env.SKYTUTOR_API_URL || "https://skytutor-agent.vercel.app/api/moodle/conversation/";
const PROXY_API_URL = process.env.MOODLE_AI_BOT_PROXY_URL || "https://moodle-ai-bot.vercel.app/api/chat";
const SKYTUTOR_USERNAME = process.env.SKYTUTOR_USERNAME || "admin";
const SKYTUTOR_COURSE_OVERRIDE = process.env.SKYTUTOR_COURSE || "";

const CANNED_ANSWER =
  "תשובה לדוגמה מהשרת המקומי (לא מ-skytutor):\n\n" +
  "כדי להבין את העיקרון האווירודינמי, נתחיל מההגדרה: עילוי נוצר בגלל הפרש הלחצים בין החלק התחתון לחלק העליון של הכנף, " +
  "ופרופיל הכנף וזווית התקיפה הם הגורמים הקובעים את גודלו.\n\n" +
  "ככל שזווית התקיפה גדלה, גדל מקדם העילוי — עד הזווית הקריטית. מעבר לזווית הקריטית הזרימה מתנתקת והעילוי קורס (הזדקרות).\n\n" +
  "(הודעת בדיקה — נשלחה מהשרת המקומי שמחקה את coursebot/ajax.php.)";

const REFUSAL_ANSWER =
  "אני יכול לסייע רק בשאלות הקשורות לתעופה. נסה לשאול שאלה הקשורה לאווירודינמיקה, מערכות מטוס, ניווט, או נהלי חירום.";

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
 * Mirror the payload shape that coursebot/ajax.php sends upstream:
 *   { username, course, message }
 * The widget only sends `{ q }`, so we reconstruct course/username
 * the same way the PHP side would (from session + course context).
 */
async function proxyToUpstream(parsed, upstreamUrl, label) {
  const q = String((parsed && parsed.q) || "").trim();
  if (!q) {
    return { status: 400, body: { error: "Missing q" } };
  }

  const course = SKYTUTOR_COURSE_OVERRIDE || "ידע טכני כללי";

  const payload = {
    username: SKYTUTOR_USERNAME,
    course,
    message: q,
  };

  const tag = "[" + label + "]";
  console.log(tag + " → POST " + upstreamUrl);
  console.log(tag + "   username=" + payload.username + " course=\"" + course + "\"");
  console.log(tag + "   message (first 120): " + q.slice(0, 120).replace(/\n/g, " ") + (q.length > 120 ? "…" : ""));

  let res;
  try {
    res = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(tag + " ✗ network error: " + err.message);
    return { status: 502, body: { error: "Upstream connection failed: " + err.message } };
  }

  const text = await res.text();
  console.log(tag + " ← " + res.status + " (" + text.length + " bytes)");

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
          label + " החזיר 401 (לא מאומת).\n\n" +
          "נשלח: username=\"" + payload.username + "\", course=\"" + course + "\".\n" +
          "ודא שהמשתמש רשום לקורס במודל המוגדר ב-MOODLE_URL של skytutor.",
      },
    };
  }

  if (res.status < 200 || res.status >= 300) {
    return {
      status: 200,
      body: {
        answer:
          label + " החזיר HTTP " + res.status + ".\n\n" +
          "תשובת שרת:\n" + (parsedRes ? JSON.stringify(parsedRes, null, 2) : text.slice(0, 800)),
      },
    };
  }

  if (!parsedRes) {
    return { status: 200, body: { answer: text || "(תגובה ריקה מ-" + label + ")" } };
  }

  return { status: 200, body: parsedRes };
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

  if (req.method === "GET" && url.pathname === "/cb.js") {
    return serveStatic(res, CB_JS, "application/javascript");
  }

  if (req.method === "GET" && url.pathname === "/logo.png") {
    return fs.readFile(CB_LOGO, (err, data) => {
      if (err) return send(res, 404, { "Content-Type": "text/plain" }, "not found");
      send(res, 200, { "Content-Type": "image/png" }, data);
    });
  }

  if (req.method === "POST" && url.pathname === "/ajax") {
    const body = await readBody(req);
    const scenario = url.searchParams.get("scenario") || "success";
    const sesskey = url.searchParams.get("sesskey") || "";
    const courseid = url.searchParams.get("courseid") || "";

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { error: "non-json body" };
    }

    console.log("\n[ajax] scenario=" + scenario + " sesskey=" + sesskey + " courseid=" + courseid);
    console.log("[ajax] body=", parsed);

    if (scenario === "401") {
      return send(
        res,
        401,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ error: "auth rejected (mock 401)" })
      );
    }

    if (scenario === "network-error") {
      req.socket.destroy();
      return;
    }

    if (scenario === "refusal") {
      return send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ answer: REFUSAL_ANSWER, refused: true, sessionId: SESSION_ID })
      );
    }

    if (scenario === "live") {
      const result = await proxyToUpstream(parsed, SKYTUTOR_API_URL, "live");
      send(
        res,
        result.status,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify(result.body)
      );
      return;
    }

    if (scenario === "live-proxy") {
      const result = await proxyToUpstream(parsed, PROXY_API_URL, "live-proxy");
      send(
        res,
        result.status,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify(result.body)
      );
      return;
    }

    // success / slow-3s
    turnCounter += 1;
    const q = (parsed && parsed.q) ? String(parsed.q) : "";
    const answer = turnCounter === 1 ? CANNED_ANSWER : buildFollowupAnswer(q, turnCounter);

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
  console.log("\nMock Coursebot Moodle running at http://localhost:" + PORT);
  console.log("Open in a browser, click the round logo button (bottom-right), then chat.");
  console.log("Scenarios: success / slow-3s / 401 / refusal / network-error / live / live-proxy.");
  console.log("Live mode       → " + SKYTUTOR_API_URL);
  console.log("Live-proxy mode → " + PROXY_API_URL);
  console.log("                  username=\"" + SKYTUTOR_USERNAME + "\"" +
    (SKYTUTOR_COURSE_OVERRIDE ? " course=\"" + SKYTUTOR_COURSE_OVERRIDE + "\" (env override)" : " course=ידע טכני כללי"));
});
