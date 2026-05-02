function decodeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanAnswer(text) {
  if (!text) return "";

  return String(text)
    // Remove Markdown symbols
    .replace(/[*#`]/g, "")
    .replace(/-{3,}/g, "")

    // Clean common LaTeX wrappers
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\$\$/g, "")

    // Convert common LaTeX commands to readable text
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 / $2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\cdot/g, " x ")
    .replace(/\\times/g, " x ")
    .replace(/\\rho/g, "rho")
    .replace(/\\Delta/g, "Delta")
    .replace(/\\theta/g, "theta")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\gamma/g, "gamma")

    // Normalize spacing
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function handler(req, res) {
  try {
    let body = {};

    // Moodle plugin may send GET query parameters
    if (req.method === "GET") {
      body = req.query || {};
    }

    // Also support POST, if used later
    else if (req.method === "POST") {
      if (typeof req.body === "string") {
        try {
          body = JSON.parse(req.body);
        } catch {
          body = {};
        }
      } else if (req.body && typeof req.body === "object") {
        body = req.body;
      }
    }

    // Extract question from several possible Moodle/plugin field names
    const rawQuestion =
      body.question ||
      body.q ||
      body["amp;q"] ||
      body.message ||
      body.text ||
      body.context ||
      body.questionText ||
      body.question_text ||
      body.quizQuestion ||
      body.quiz_question ||
      body.content ||
      "";

    const question = decodeHtml(rawQuestion);

    // Extract username/course for logging
    const username = decodeHtml(
      body.username ||
      body.user ||
      body.userid ||
      body["amp;username"] ||
      "unknown"
    );

    const course = decodeHtml(
      body.course ||
      body.course_name ||
      body.coursename ||
      body["amp;course"] ||
      "unknown"
    );

    // Extract prompt
    const rawPrompt =
      body.prompt ||
      body.systemprompt ||
      body.system_prompt ||
      body["amp;prompt"] ||
      "";

    const systemPrompt =
      decodeHtml(rawPrompt) ||
      `You are a professional aviation theory instructor.
Answer clearly, accurately, and professionally in Hebrew.
If this is a quiz question, explain the reasoning and not only the answer.
If you are not certain about the answer, state it explicitly.
Do not guess aviation-related data.
Prefer principles based on established aviation literature, such as Oxford or FAA.
Do not use Markdown formatting.
Do not use asterisks, hash symbols, or code blocks.
Do not use LaTeX formatting.
Write formulas in simple readable plain text only.
Return only the final answer to the student.`;

    if (!question || question.trim().length < 3) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(400).send("לא התקבלה שאלה מהמערכת.");
    }

    if (!process.env.OPENAI_API_KEY) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(500).send("שגיאת שרת: OPENAI_API_KEY לא מוגדר ב־Vercel.");
    }

    // Ask OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        temperature: 0.3,
        max_tokens: 700
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(openaiResponse.status).send(
        "שגיאה בחיבור ל־OpenAI: " + JSON.stringify(data)
      );
    }

    let answer =
      data?.choices?.[0]?.message?.content ||
      "לא התקבלה תשובה מהמודל.";

    answer = cleanAnswer(answer);

    // Save log to Supabase, but do not fail the student response if logging fails
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const logResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/question_logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            username: username || "unknown",
            course: course || "unknown",
            question_text: question,
            answer: answer
          })
        });

        if (!logResponse.ok) {
          const logError = await logResponse.text();
          console.log("SUPABASE_LOG_ERROR:", logError);
        }
      } catch (logError) {
        console.log("SUPABASE_LOG_EXCEPTION:", logError.message);
      }
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(answer);

  } catch (error) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("שגיאת שרת: " + error.message);
  }
}
