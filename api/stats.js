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
      `${SUPABASE_URL}/rest/v1/question_logs?select=*`,
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

    const byCourse = {};
    const byUser = {};
    const byQuestion = {};

    rows.forEach(row => {
      const course = row.course || "unknown";
      const user = row.username || "unknown";
      const question = row.question_text || "";

      byCourse[course] = (byCourse[course] || 0) + 1;
      byUser[user] = (byUser[user] || 0) + 1;
      byQuestion[question] = (byQuestion[question] || 0) + 1;
    });

    const topQuestions = Object.entries(byQuestion)
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topUsers = Object.entries(byUser)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const courses = Object.entries(byCourse)
      .map(([course, count]) => ({ course, count }))
      .sort((a, b) => b.count - a.count);

    const latest = rows
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);

    return res.status(200).json({
      totalQuestions,
      topQuestions,
      topUsers,
      courses,
      latest
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
