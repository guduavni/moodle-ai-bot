export default async function handler(req, res) {
  try {
    const { question, prompt } = req.body;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: prompt || "You are an aviation instructor" },
          { role: "user", content: question }
        ]
      })
    });

    const data = await response.json();

    return res.status(200).json({
      answer: data.choices[0].message.content
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
