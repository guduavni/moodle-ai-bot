import { describe, it, expect, beforeEach, vi } from "vitest";
import handler, { extractParams, pickFirst } from "../../api/chat.js";

function mockReqRes(opts = {}) {
  const req = {
    method: opts.method || "POST",
    query: opts.query || {},
    body: opts.body !== undefined ? opts.body : {},
    headers: opts.headers || {}
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(obj) { this.body = obj; return this; }
  };
  return { req, res };
}

function fetchJson(status, payload) {
  return Promise.resolve({
    status,
    text: async () => typeof payload === "string" ? payload : JSON.stringify(payload)
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api/chat.js — pure helpers", () => {
  it("pickFirst returns the first non-empty trimmed string", () => {
    expect(pickFirst(undefined, null, "", "  ", "x")).toBe("x");
    expect(pickFirst(null, undefined)).toBe("");
    expect(pickFirst(0, "y")).toBe("0"); // 0 stringifies to "0", which is non-empty
    expect(pickFirst("  hello  ")).toBe("hello");
  });

  it("extractParams reads the new POST body shape", () => {
    const { question, username, course } = extractParams({
      body: { question: "Q?", username: "admin", course: "ידע טכני כללי" },
      query: {}
    });
    expect(question).toBe("Q?");
    expect(username).toBe("admin");
    expect(course).toBe("ידע טכני כללי");
  });

  it("extractParams reads the legacy GET shape (?q= / ?coursename=)", () => {
    const { question, username, course } = extractParams({
      body: {},
      query: { q: "Q?", username: "admin", coursename: "ידע טכני כללי" }
    });
    expect(question).toBe("Q?");
    expect(username).toBe("admin");
    expect(course).toBe("ידע טכני כללי");
  });

  it("extractParams accepts known param aliases (questionText, message, amp;q)", () => {
    expect(extractParams({ body: { questionText: "qt" }, query: {} }).question).toBe("qt");
    expect(extractParams({ body: { message: "msg" }, query: {} }).question).toBe("msg");
    expect(extractParams({ body: {}, query: { "amp;q": "qq" } }).question).toBe("qq");
  });

  it("extractParams prefers body over query when both are present", () => {
    expect(
      extractParams({ body: { question: "from-body" }, query: { q: "from-query" } }).question
    ).toBe("from-body");
  });
});

describe("api/chat.js — handler dispatch", () => {
  it("rejects unsupported methods with 405", async () => {
    const { req, res } = mockReqRes({ method: "DELETE" });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe("method not allowed");
  });

  it("returns 400 when no question is supplied", async () => {
    globalThis.fetch = vi.fn();
    const { req, res } = mockReqRes({ method: "POST", body: { username: "admin" } });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("missing question");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("re-parses a string body (non-JSON Content-Type quirk)", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(
      fetchJson(200, { answer: "ok", sessionId: "s1" })
    );
    const { req, res } = mockReqRes({
      method: "POST",
      body: JSON.stringify({ question: "Q?", username: "admin", course: "C" })
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toBe("ok");
  });
});

describe("api/chat.js — upstream forwarding", () => {
  it("forwards POST {question, username, course} to skytutor and returns {answer, sessionId}", async () => {
    const fetchMock = vi.fn().mockReturnValue(
      fetchJson(200, { answer: "Hebrew answer", sessionId: "moodle-2026-05-09-user:abc" })
    );
    globalThis.fetch = fetchMock;

    const { req, res } = mockReqRes({
      method: "POST",
      body: { question: "Q?", username: "admin", course: "ידע טכני כללי" }
    });
    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/moodle\/chat\//);
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({
      username: "admin",
      course: "ידע טכני כללי",
      question: "Q?"
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ answer: "Hebrew answer", sessionId: "moodle-2026-05-09-user:abc" });
  });

  it("forwards legacy GET ?q= to the same skytutor POST shape", async () => {
    const fetchMock = vi.fn().mockReturnValue(fetchJson(200, { answer: "Hebrew answer" }));
    globalThis.fetch = fetchMock;

    const { req, res } = mockReqRes({
      method: "GET",
      query: { q: "Q?", username: "admin", course: "C" }
    });
    await handler(req, res);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ username: "admin", course: "C", question: "Q?" });
    expect(res.body).toEqual({ answer: "Hebrew answer" });
    // No sessionId returned upstream → none echoed.
    expect(res.body.sessionId).toBeUndefined();
  });

  it("renders skytutor 401 as a Hebrew enrollment-mismatch message (still HTTP 200 to caller)", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(
      fetchJson(401, { error: "not authorized" })
    );

    const { req, res } = mockReqRes({
      method: "POST",
      body: { question: "Q?", username: "stranger", course: "X" }
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toMatch(/הבוט דחה את הבקשה בהרשאה 401/);
    expect(res.body.answer).toContain("שם משתמש: stranger");
    expect(res.body.answer).toContain("קורס: X");
  });

  it("renders non-2xx upstream errors as Hebrew HTTP-N message with body excerpt", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(
      fetchJson(500, { error: "internal" })
    );

    const { req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toMatch(/הבוט החזיר שגיאת HTTP: 500/);
    expect(res.body.answer).toContain("internal");
  });

  it("renders network errors as a Hebrew comms-error message", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const { req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.answer).toMatch(/שגיאת תקשורת מול הבוט/);
    expect(res.body.answer).toContain("ECONNREFUSED");
  });

  it("falls back through alternative answer keys (message/response/text)", async () => {
    globalThis.fetch = vi.fn().mockReturnValueOnce(fetchJson(200, { message: "alt-msg" }));
    let { req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } });
    await handler(req, res);
    expect(res.body.answer).toBe("alt-msg");

    globalThis.fetch = vi.fn().mockReturnValueOnce(fetchJson(200, { response: "alt-resp" }));
    ({ req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } }));
    await handler(req, res);
    expect(res.body.answer).toBe("alt-resp");

    globalThis.fetch = vi.fn().mockReturnValueOnce(fetchJson(200, { text: "alt-text" }));
    ({ req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } }));
    await handler(req, res);
    expect(res.body.answer).toBe("alt-text");
  });

  it("forwards a non-JSON upstream body verbatim into {answer}", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(fetchJson(200, "raw text reply"));

    const { req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } });
    await handler(req, res);

    expect(res.body.answer).toBe("raw text reply");
  });

  it("returns Hebrew 'no answer' when upstream body is empty", async () => {
    globalThis.fetch = vi.fn().mockReturnValue(fetchJson(200, ""));

    const { req, res } = mockReqRes({ method: "POST", body: { question: "Q?" } });
    await handler(req, res);

    expect(res.body.answer).toBe("לא התקבלה תשובה מהבוט.");
  });
});
