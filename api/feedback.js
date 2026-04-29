import crypto from "crypto";

const SUPABASE_URL = "https://ibvkfwlzwewlltniddzu.supabase.co";

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip + "mf2025").digest("hex").slice(0, 16);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var body = req.body || {};
  var rating = body.rating;
  var comment = body.comment;
  var context = body.context;
  var user_agent = body.user_agent;

  if (!rating || (rating !== "up" && rating !== "down")) {
    return res.status(400).json({ error: "rating requerido" });
  }

  var ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  var ipHash = hashIP(ip);

  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return res.status(200).json({ ok: true });

  try {
    await fetch(SUPABASE_URL + "/rest/v1/feedback", {
      method: "POST",
      headers: { "Content-Type":"application/json", "apikey":key, "Authorization":"Bearer " + key, "Prefer":"return=minimal" },
      body: JSON.stringify({ rating: rating, comment: comment || null, context: context || null, ip_hash: ipHash, user_agent: user_agent || null }),
    });
    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: "Error guardando feedback" });
  }
}
