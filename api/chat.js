export default async function handler(req, res) {
  try {
    let body = {};

    // Support GET (Moodle sends parameters in URL)
    if (req.method === "GET") {
      body = req.query || {};
    }

    // Support POST
    if (req.method === "POST") {
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

    // Extract question
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
אם זו שאלת מבחן – הסבר את ההיגיון ולא רק את התשובה.`;

    // If no question
    if (!question || question.trim().length < 3) {
      return res.status(400).json({
        answer: "לא התקבלה שאלה מהמערכת",
        debug: body
      });
    }

    // Call OpenAI
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

    const answer =
      data?.choices?.[0]?.message?.content ||
      "לא התקבלה תשובה מהמודל";

    return res.status(200).json({
      answer,
      message: answer,
      response: answer
    });

  } catch (error) {
    return res.status(500).json({
      answer: "שגיאת שרת",
      error: error.message
    });
  }
}
