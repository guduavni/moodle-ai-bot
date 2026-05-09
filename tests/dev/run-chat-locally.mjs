#!/usr/bin/env node
//
// Local dev server for `api/chat.js`.
//
// Serves the proxy handler on http://localhost:3031/api/chat so you can
// exercise it end-to-end (real fetch to skytutor, real Hebrew answers)
// without waiting for a Vercel deploy. Use this BEFORE merging a PR that
// changes `api/chat.js` to validate behavior against the live skytutor.
//
// Wires up Vercel's `req.query` / `req.body` / `res.status().json()` shape
// on top of Node's plain http module — no `vercel` CLI needed.
//
// Run:
//   npm run dev:chat
//
// Then either:
//   curl -sS -X POST -H 'Content-Type: application/json' \
//     --data '{"username":"admin","course":"ידע טכני כללי","question":"test"}' \
//     'http://localhost:3031/api/chat'
//
// Or point the mock-Moodle browser harness at it:
//   MOODLE_AI_BOT_PROXY_URL=http://localhost:3031/api/chat npm run mock:moodle
//   → open http://localhost:3030/ and pick the `live-proxy` scenario.

import http from "node:http";
import { URL } from "node:url";
import handler from "../../api/chat.js";

const PORT = Number(process.env.CHAT_DEV_PORT || 3031);
const SKYTUTOR_URL = process.env.SKYTUTOR_API_URL || "https://skytutor-agent.vercel.app/api/moodle/chat/";

function readBody(req) {
  return new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => resolve(buf));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== "/api/chat") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found", path: url.pathname }));
    return;
  }

  // Vercel parses query string into req.query.
  req.query = {};
  for (const [k, v] of url.searchParams.entries()) req.query[k] = v;

  // Vercel parses JSON bodies (when Content-Type matches) into req.body.
  // Pass anything else through as a string; the handler re-parses.
  let body = {};
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const raw = await readBody(req);
    if (raw) {
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (ct.includes("application/json")) {
        try { body = JSON.parse(raw); } catch { body = raw; }
      } else {
        body = raw;
      }
    }
  }
  req.body = body;

  // Vercel's res.status(N).json(obj) helpers, layered on Node's http.ServerResponse.
  let pendingStatus = 200;
  res.status = (n) => { pendingStatus = n; return res; };
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.writeHead(pendingStatus);
    res.end(JSON.stringify(obj));
    return res;
  };

  const t0 = Date.now();
  console.log(`\n[chat-dev] ${req.method} ${req.url}`);
  if (Object.keys(req.query).length) console.log("[chat-dev]   query=", req.query);
  if (req.method !== "GET") console.log("[chat-dev]   body=", typeof body === "string" ? body.slice(0, 200) : body);

  try {
    await handler(req, res);
    console.log(`[chat-dev] ← ${pendingStatus} in ${Date.now() - t0}ms`);
  } catch (err) {
    console.log(`[chat-dev] ✗ handler threw: ${err && err.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err && err.message || err) }));
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`api/chat dev server: http://localhost:${PORT}/api/chat`);
  console.log(`forwards to:         ${SKYTUTOR_URL}`);
  console.log(`\nQuick smoke test:`);
  console.log(`  curl -sS -X POST -H 'Content-Type: application/json' \\`);
  console.log(`    --data '{"username":"admin","course":"ידע טכני כללי","question":"מה זה הזדקרות?"}' \\`);
  console.log(`    'http://localhost:${PORT}/api/chat'`);
  console.log(`\nFrom the mock-Moodle browser:`);
  console.log(`  MOODLE_AI_BOT_PROXY_URL=http://localhost:${PORT}/api/chat npm run mock:moodle`);
  console.log(`  → http://localhost:3030/  →  pick "live-proxy"  →  click ❓`);
});
