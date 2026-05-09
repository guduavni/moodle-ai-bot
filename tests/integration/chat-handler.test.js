import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/chat.js";

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let bodySent;
  return {
    setHeader: (k, v) => { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    send(body) { bodySent = body; return this; },
    get _state() { return { statusCode, headers, body: bodySent }; }
  };
}

const OPENAI_OK = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] })
});

const OPENAI_FAIL = (status, payload) => ({
  ok: false,
  status,
  json: async () => payload
});

const SUPABASE_OK = () => ({
  ok: true,
  status: 201,
  text: async () => ""
});

const SUPABASE_FAIL = () => ({
  ok: false,
  status: 500,
  text: async () => "supabase exploded"
});

beforeEach(() => {
  vi.resetAllMocks();
  // Clean every chat.js env var so tests start from a known state.
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPBASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPBASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat handler — request shape", () => {
  it("GET reads question from req.query.q and returns OpenAI's content", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValueOnce(OPENAI_OK("שלום עולם"));
    vi.stubGlobal("fetch", fetchMock);

    const req = { method: "GET", query: { q: "what is stall?" } };
    const res = makeRes();
    await handler(req, res);

    expect(res._state.statusCode).toBe(200);
    expect(res._state.body).toBe("שלום עולם");
    expect(res._state.headers["Content-Type"]).toMatch(/text\/plain/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.method).toBe("POST");
    const sent = JSON.parse(opts.body);
    expect(sent.model).toBe("gpt-4.1-mini");
    expect(sent.messages[1]).toEqual({ role: "user", content: "what is stall?" });
  });

  it("POST with object body works the same as GET", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValueOnce(OPENAI_OK("hi"));
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "POST", body: { question: "what is stall?" } }, res);

    expect(res._state.statusCode).toBe(200);
    expect(res._state.body).toBe("hi");
  });

  it("POST with stringified body is JSON-parsed", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValueOnce(OPENAI_OK("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler(
      { method: "POST", body: JSON.stringify({ question: "what is stall?" }) },
      res
    );

    expect(res._state.statusCode).toBe(200);
    expect(res._state.body).toBe("ok");
  });

  it("POST with malformed JSON body is treated as empty (so triggers 400)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "POST", body: "{not json" }, res);

    expect(res._state.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("chat handler — error paths", () => {
  it("returns 400 when question is missing", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "GET", query: {} }, res);

    expect(res._state.statusCode).toBe(400);
    expect(res._state.body).toMatch(/לא התקבלה שאלה/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when question is shorter than 3 chars", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn());

    const res = makeRes();
    await handler({ method: "GET", query: { q: "hi" } }, res);

    expect(res._state.statusCode).toBe(400);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(res._state.statusCode).toBe(500);
    expect(res._state.body).toMatch(/OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards OpenAI's status when OpenAI errors", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(OPENAI_FAIL(429, { error: "rate limited" }))
    );

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(res._state.statusCode).toBe(429);
    expect(res._state.body).toMatch(/rate limited/);
  });
});

describe("chat handler — Supabase logging", () => {
  it("posts to Supabase when SUPABASE_URL and key are set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.SUPABASE_URL = "https://supa.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "supa-secret";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OPENAI_OK("answer text"))
      .mockResolvedValueOnce(SUPABASE_OK());
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler(
      { method: "POST", body: { question: "what is stall?", username: "alice", course: "PPL" } },
      res
    );

    expect(res._state.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [supaUrl, supaOpts] = fetchMock.mock.calls[1];
    expect(supaUrl).toBe("https://supa.example.com/rest/v1/question_logs");
    expect(supaOpts.headers.apikey).toBe("supa-secret");
    expect(supaOpts.headers.Authorization).toBe("Bearer supa-secret");
    const logged = JSON.parse(supaOpts.body);
    expect(logged).toEqual({
      username: "alice",
      course: "PPL",
      question_text: "what is stall?",
      answer: "answer text"
    });
  });

  it("does NOT call Supabase when env vars are absent", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValueOnce(OPENAI_OK("hi"));
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(res._state.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only OpenAI
  });

  it("Supabase 500 does NOT affect the 200 returned to the caller", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.SUPABASE_URL = "https://supa.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "supa-secret";

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(OPENAI_OK("answer"))
        .mockResolvedValueOnce(SUPABASE_FAIL())
    );

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(res._state.statusCode).toBe(200);
    expect(res._state.body).toBe("answer");
  });

  it("accepts the typo'd SUPBASE_URL / SUPBASE_SERVICE_ROLE_KEY env vars", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.SUPBASE_URL = "https://supa.example.com";
    process.env.SUPBASE_SERVICE_ROLE_KEY = "supa-secret";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(OPENAI_OK("ok"))
      .mockResolvedValueOnce(SUPABASE_OK());
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("chat handler — answer cleaning", () => {
  it("applies cleanAnswer to OpenAI content before returning", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(OPENAI_OK("**bold** \\frac{a}{b}\n\n\n\nend"))
    );

    const res = makeRes();
    await handler({ method: "GET", query: { q: "what is stall?" } }, res);

    expect(res._state.body).toBe("bold a / b\n\nend");
  });

  it("uses Moodle-supplied prompt as the system prompt when present", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchMock = vi.fn().mockResolvedValueOnce(OPENAI_OK("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const res = makeRes();
    await handler(
      { method: "POST", body: { q: "what is stall?", prompt: "be very terse" } },
      res
    );

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages[0]).toEqual({ role: "system", content: "be very terse" });
  });
});
