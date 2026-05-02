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
    .replace(/[*#`]/g, "")
    .replace(/-{3,}/g, "")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\$\$/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 / $2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\cdot/g, " x ")
    .replace(/\\times/g, " x ")
    .replace(/\\rho/g, "rho")
    .replace(/\\Delta/g, "Delta")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function handler(req, res) {
  try {
    let body = {};

    if (req.method === "GET") {
      body = req.query || {};
    } else if (req.method === "POST") {
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

    const question = decodeHtml(
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
      ""
    );

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

    const promptFromMoodle = decodeHtml(
      body.prompt ||
      body.systemprompt ||
      body.system_prompt ||
      body["amp;prompt"] ||
      ""
    );

    const systemPrompt =
      promptFromMoodle ||
      `You are a professional aviation theory instructor.
Answer clearly and professionally in Hebrew.
If this is a quiz question, explain the reasoning and not only the answer.
If you are not certain about the answer, state it explicitly.
Do not guess aviation-related data.
Prefer principles based on established aviation literature such as Oxford or FAA.
Do not use Markdown.
Do not use asterisks, hash symbols, code blocks, or LaTeX.
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

    console.log("QUESTION_LOG_INPUT", {
      time: new Date().toISOString(),
      username,
      course,
      question
    });

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

    console.log("SUPABASE_ENV", {
      hasUrl: Boolean(process.env.SUPABASE_URL),
      hasKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      url: process.env.SUPABASE_URL || "missing"
    });

    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const logResponse = await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/question_logs`,
          {
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
          }
        );

        console.log("SUPABASE_STATUS", logResponse.status);

        if (!logResponse.ok) {
          const logError = await logResponse.text();
          console.log("SUPABASE_LOG_ERROR", logError);
        } else {
          console.log("SUPABASE_LOG_SAVED");
        }
      } catch (logError) {
        console.log("SUPABASE_LOG_EXCEPTION", logError.message);
      }
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(answer);

  } catch (error) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("שגיאת שרת: " + error.message);
  }
}
