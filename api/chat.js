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
  return String(text || "")
    .replace(/[*#`]/g, "")
    .replace(/-{3,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function handler(req, res) {
  try {
    // =============================
    // 1. קבלת נתונים
    // =============================
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
      } else {
        body = req.body || {};
      }
    }

    const username =
      body.username ||
      body.user ||
      "unknown";

    const course =
      body.course ||
      body["amp;course"] ||
      "unknown";

    const rawQuestion =
      body.question ||
      body.q ||
      body["amp;q"] ||
      body.message ||
      body.text ||
      body.content ||
      "";

    const question = decodeHtml(rawQuestion);

    const systemPrompt = `
אתה מדריך תאוריה תעופתית מקצועי.
ענה בעברית ברורה, מדויקת ומקצועית.
אם אינך בטוח בתשובה – ציין זאת במפורש.
אל תנחש נתונים תעופתיים.
העדף מקורות כמו FAA / Oxford.

אל תשתמש ב:
*
#
\`\`\`

אל תחזיר JSON.
אל תחזור על השאלה.
תן תשובה ישירה בלבד.
`;

    if (!question || question.trim().length < 3) {
      return res.status(400).send("לא התקבלה שאלה.");
    }

    // =============================
    // 2. בדיקת משתנים
    // =============================
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.SUPBASE_URL; // fallback לשם השגוי
    
    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPBASE_SERVICE_ROLE_KEY; // fallback

    console.log("ENV CHECK:", {
      openai: !!OPENAI_KEY,
      supabase_url: !!SUPABASE_URL,
      supabase_key: !!SUPABASE_KEY
    });

    if (!OPENAI_KEY) {
      return res.status(500).send("OPENAI_API_KEY חסר");
    }

    // =============================
    // 3. קריאה ל-OpenAI
    // =============================
    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question }
          ],
          temperature: 0.3
        })
      }
    );

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.log("OPENAI ERROR:", data);
      return res.status(500).send("שגיאה ב-OpenAI");
    }

    let answer =
      data?.choices?.[0]?.message?.content ||
      "לא התקבלה תשובה.";

    answer = cleanAnswer(answer);

    // =============================
    // 4. שמירה ל-Supabase
    // =============================
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const save = await fetch(
          `${SUPABASE_URL}/rest/v1/question_logs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({
              username,
              course,
              question_text: question,
              answer
            })
          }
        );

        console.log("SUPABASE STATUS:", save.status);
      } catch (e) {
        console.log("SUPABASE ERROR:", e.message);
      }
    } else {
      console.log("SUPABASE NOT CONFIGURED");
    }

    // =============================
    // 5. החזרת תשובה
    // =============================
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(answer);

  } catch (error) {
    console.log("SERVER ERROR:", error);
    return res.status(500).send("שגיאת שרת");
  }
}
