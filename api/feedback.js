// ── MeetFluent Feedback Endpoint ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { rating, comment, context, user_agent } = req.body || {};
  if (!rating || !["up","down"].includes(rating)) return res.status(400).json({ error: "rating requerido (up|down)" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip+"mf2025"));
  const ipHash = Array.from(new Uint8Array(buf)).slice(0,8).map(b=>b.toString(16).padStart(2,"0")).join("");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ ok: true }); // silently ok if no supabase

  try {
    await fetch(`${url}/rest/v1/feedback`, {
      method: "POST",
      headers: { "Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`,"Prefer":"return=minimal" },
      body: JSON.stringify({ rating, comment: comment||null, context: context||null, ip_hash: ipHash, user_agent: user_agent||null }),
    });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Error guardando feedback" });
  }
}
