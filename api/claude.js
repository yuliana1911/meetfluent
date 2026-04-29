// ── MeetFluent API Proxy ─────────────────────────────────────────────────────
const CLAUDE_MODEL    = "claude-haiku-4-5-20251001";
const MAX_TOKENS      = 1000;
const DAILY_LIMIT     = 15;
const MAX_INPUT_CHARS = 6000;

const usageStore = new Map();
function getTodayKey(ip) { return `${ip}_${new Date().toISOString().slice(0,10)}`; }
function getUsage(ip)       { return usageStore.get(getTodayKey(ip)) || 0; }
function incrementUsage(ip) { const k=getTodayKey(ip); usageStore.set(k,(usageStore.get(k)||0)+1); }
function getClientIP(req)   { return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.headers["x-real-ip"] || "unknown"; }

async function hashIP(ip) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip+"mf2025"));
  return Array.from(new Uint8Array(buf)).slice(0,8).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function supabaseInsert(table, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { "Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`,"Prefer":"return=minimal" },
      body: JSON.stringify(body),
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");

  const ip     = getClientIP(req);
  const usage  = getUsage(ip);
  const ipHash = await hashIP(ip);

  if (usage >= DAILY_LIMIT) {
    return res.status(429).json({
      error: "límite_diario",
      message: `Has alcanzado el límite de ${DAILY_LIMIT} consultas gratuitas de hoy. ¡Gracias por probar MeetFluent! Vuelve mañana 🙂`,
      usage, limit: DAILY_LIMIT,
    });
  }

  const { messages, system, event_type, meta } = req.body || {};

  // Analytics-only call (feedback, meeting_ended, etc.)
  if (event_type && !messages) {
    supabaseInsert("usage_events", { event_type, ip_hash: ipHash, ...(meta||{}) });
    return res.status(200).json({ ok: true });
  }

  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages requerido" });
  if (JSON.stringify(messages).length + (system?.length||0) > MAX_INPUT_CHARS)
    return res.status(400).json({ error: "Input demasiado largo" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01" },
      body: JSON.stringify({ model:CLAUDE_MODEL, max_tokens:MAX_TOKENS, system:system||"", messages }),
    });
    if (!r.ok) { const e=await r.json().catch(()=>({})); return res.status(r.status).json({ error:e?.error?.message||"Error" }); }
    const data = await r.json();
    incrementUsage(ip);
    if (event_type) supabaseInsert("usage_events", { event_type, ip_hash:ipHash, ...(meta||{}) });
    return res.status(200).json({ content:data.content, usage:{used:usage+1,limit:DAILY_LIMIT,remaining:DAILY_LIMIT-(usage+1)} });
  } catch { return res.status(500).json({ error:"Error interno" }); }
}
