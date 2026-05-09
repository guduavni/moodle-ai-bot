// api/chat.js
//
// Backwards-compat proxy: existing Moodle plugin installs have
// `https://moodle-ai-bot.vercel.app/api/chat` saved in the plugin's `apiurl`
// setting (mdl_config_plugins) and we cannot rewrite stored values from this
// repo. So this URL must keep responding — but the chat path itself moved to
// skytutor-agent in PR #4 (its own Hebrew system prompt + DynamoDB session
// history). This handler forwards to skytutor and reshapes the response so
// the legacy plugin keeps rendering as it did before.
//
// New installs can still point `apiurl` directly at skytutor; both paths
// converge on the same upstream.

const SKYTUTOR_URL =
  process.env.SKYTUTOR_API_URL ||
  "https://skytutor-agent.vercel.app/api/moodle/chat/";

function pickFirst(...candidates) {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
}

function extractParams(req) {
  // Accept multiple aliases for the question param so all known caller
  // shapes work without modification:
  //   - Legacy ajax.php (pre-PR #4) GET'd with `?q=` via http_build_query.
  //     Some Moodle environments double-encode the ampersand and we end up
  //     with `?amp;q=`, hence the explicit alias.
  //   - Post-PR ajax.php POSTs `{question, username, course}`.
  //   - Multi-turn followup turns POST `{message}` instead of `{question}`.
  // Course also has two spellings (`course` from upstream-shaped callers,
  // `coursename` from the popup JS).
  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const query = req.query || {};

  const question = pickFirst(
    body.question,
    body.questionText,
    body.message,
    body.q,
    body.quiz_question,
    body["amp;q"],
    query.question,
    query.questionText,
    query.message,
    query.q,
    query.quiz_question,
    query["amp;q"]
  );
  const username = pickFirst(body.username, query.username);
  const course = pickFirst(
    body.course,
    body.coursename,
    query.course,
    query.coursename
  );
  return { question, username, course };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({
      answer: "שיטה לא נתמכת.",
      error: "method not allowed"
    });
    return;
  }

  // Vercel parses JSON bodies when Content-Type matches; for other
  // content types (or string bodies from quirky callers) we re-parse here.
  let body = req.body;
  if (typeof body === "string" && body.length > 0) {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};
  req.body = body;

  const { question, username, course } = extractParams(req);

  if (!question) {
    res.status(400).json({
      answer: "לא זוהה טקסט שאלה.",
      error: "missing question"
    });
    return;
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(SKYTUTOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ username, course, question })
    });
  } catch (err) {
    res.status(200).json({
      answer: "שגיאת תקשורת מול הבוט.\n\n" + (err && err.message ? err.message : String(err))
    });
    return;
  }

  const text = await upstreamRes.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  if (upstreamRes.status === 401) {
    res.status(200).json({
      answer:
        "הבוט דחה את הבקשה בהרשאה 401.\n\n" +
        "נשלחו הפרטים הבאים:\n" +
        "שם משתמש: " + (username || "(ריק)") + "\n" +
        "קורס: " + (course || "(ריק)") + "\n\n" +
        "יש לוודא שבשרת הבוט שם המשתמש ושם הקורס מוגדרים כמאושרים."
    });
    return;
  }

  if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
    res.status(200).json({
      answer:
        "הבוט החזיר שגיאת HTTP: " + upstreamRes.status + "\n\n" +
        "תשובת שרת:\n" +
        (parsed ? JSON.stringify(parsed) : (text || "").slice(0, 800))
    });
    return;
  }

  if (!text) {
    res.status(200).json({ answer: "לא התקבלה תשובה מהבוט." });
    return;
  }

  if (parsed && typeof parsed === "object") {
    const answer =
      parsed.answer ||
      parsed.message ||
      parsed.response ||
      parsed.text ||
      JSON.stringify(parsed);
    const out = { answer };
    if (parsed.sessionId) out.sessionId = String(parsed.sessionId);
    res.status(200).json(out);
    return;
  }

  // Upstream returned a non-JSON, non-empty body. Forward it verbatim.
  res.status(200).json({ answer: text });
}

// Exported for unit tests.
export { extractParams, pickFirst, SKYTUTOR_URL };
