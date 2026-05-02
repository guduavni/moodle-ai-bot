function decodeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

    const rawPrompt =
      body.prompt ||
      body.systemprompt ||
      body.system_prompt ||
      body["amp;prompt"] ||
      "";

    const systemPrompt =
      decodeHtml(rawPrompt) ||
      `אתה מדריך תאוריה תעופתית מקצועי.
ענה בעברית ברורה, מדויקת ומקצועית.
אם זו שאלת מבחן – הסבר את ההיגיון ולא רק את התשובה.
אל תציג JSON.
אל תציג את השאלה כפי שקיבלת אותה.
תן תשובה ישירה וברורה לחניך.`;

    if (!question || question.trim().length < 3) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(400).send("לא התקבלה שאלה מהמערכת.");
    }

    if (!process.env.OPENAI_API_KEY) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(500).send("שגיאת שרת: OPENAI_API_KEY לא מוגדר ב־Vercel.");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (!response.ok) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(response.status).send("שגיאה בחיבור ל־OpenAI.");
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "לא התקבלה תשובה מהמודל.";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(answer);

  } catch (error) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("שגיאת שרת: " + error.message);
  }
}
