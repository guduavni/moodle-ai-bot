export default async function handler(req, res) {
  try {
    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.SUPBASE_URL ||
      "";

    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPBASE_SERVICE_ROLE_KEY ||
      "";

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: "Supabase is not configured" });
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/question_logs?select=created_at,username,course,question_text&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const rows = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: rows });
    }

    const totalQuestions = rows.length;

    const formattedRows = rows.map(row => ({
      username: row.username || "לא ידוע",
      date: row.created_at
        ? new Date(row.created_at).toLocaleDateString("he-IL")
        : "",
      course: row.course || "לא ידוע",
      question: row.question_text || ""
    }));

    return res.status(200).json({
      totalQuestions,
      rows: formattedRows
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
