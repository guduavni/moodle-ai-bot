export default async function handler(req, res) {
  try {
    // Allow only POST
    if (req.method !== "POST") {
      return res.status(405).json({
        answer: "שגיאה: יש לשלוח בקשת POST בלבד."
      });
    }

    // Read body safely
    let body = {};

    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
    } else if (req.body && typeof req.body === "object") {
      body = req.body;
    }

    // Extract possible fields sent by Moodle plugin
    const question =
      body.question ||
      body.q ||
      body.message ||
      body.text ||
      body.context ||
      body.questionText ||
      body.question_text ||
      body.quizQuestion ||
      body.quiz_question ||
      body.content ||
      "";

    const systemPrompt =
      body.prompt ||
      body.systemprompt ||
      body.system_prompt ||
      `אתה מדריך תאוריה תעופתית מקצועי.
ענה בעברית ברורה, מדויקת ומקצועית.
אם קיבלת שאלת מבחן, הסבר את ההיגיון ולא רק את התשובה.
כל התשובות צריכות להיות בעברית ובכיוון RTL.`;

    // If no question was received
    if (!question || question.trim().length < 3) {
      return res.status(400).json({
        answer: "לא התקבל טקסט שאלה מה־Moodle. יש לבדוק מה הפלאג־אין שולח ל־API.",
        debug: {
          receivedBody: body
        }
      });
    }

    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        answer: "שגיאת שרת: OPENAI_API_KEY לא מוגדר ב־Vercel."
      });
    }

    // Send request to OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.3
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        answer: "שגיאה בחיבור ל־OpenAI.",
        error: data
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content ||
      "לא התקבלה תשובה תקינה מהמודל.";

    return res.status(200).json({
      answer: answer,
      message: answer,
      response: answer
    });

  } catch (error) {
    return res.status(500).json({
      answer: "שגיאת שרת כללית.",
      error: error.message
    });
  }
}
