import crypto from "crypto";

const CLAUDE_MODEL    = "claude-haiku-4-5-20251001";
const MAX_TOKENS      = 1000;
const DAILY_LIMIT     = 15;
const MAX_INPUT_CHARS = 6000;

const usageStore = new Map();
function getTodayKey(ip) { return ip + "_" + new Date().toISOString().slice(0,10); }
function getUsage(ip)       { return usageStore.get(getTodayKey(ip)) || 0; }
function incrementUsage(ip) { const k=getTodayKey(ip); usageStore.set(k,(usageStore.get(k)||0)+1); }
function getClientIP(req)   { return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || "unknown"; }

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip + "mf2025").digest("hex").slice(0, 16);
}

const SUPABASE_URL = "https://ibvkfwlzwewlltniddzu.supabase.co";

async function supabaseInsert(table, body) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/" + table, {
      method: "POST",
      headers: { "Content-Type":"application/json", "apikey":key, "Authorization":"Bearer " + key, "Prefer":"return=minimal" },
      body: JSON.stringify(body),
    });
  } catch(e) {}
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", service: "meetfluent" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip     = getClientIP(req);
  const usage  = getUsage(ip);
  const ipHash = hashIP(ip);

  if (usage >= DAILY_LIMIT) {
    return res.status(429).json({
      error: "limite_diario",
      message: "Has alcanzado el limite de " + DAILY_LIMIT + " consultas gratuitas de hoy. Gracias por probar MeetFluent! Vuelve manana.",
      usage: usage,
      limit: DAILY_LIMIT,
    });
  }

  var body = req.body || {};
  var messages = body.messages;
  var system = body.system;
  var event_type = body.event_type;
  var meta = body.meta;

  // Analytics-only call
  if (event_type && !messages) {
    supabaseInsert("usage_events", Object.assign({ event_type: event_type, ip_hash: ipHash }, meta || {}));
    return res.status(200).json({ ok: true });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages requerido" });
  }

  var inputSize = JSON.stringify(messages).length + (system ? system.length : 0);
  if (inputSize > MAX_INPUT_CHARS) {
    return res.status(400).json({ error: "Input demasiado largo" });
  }

  try {
    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API key no configurada en el servidor" });
    }

    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: system || "",
        messages: messages,
      }),
    });

    if (!response.ok) {
      var errData = {};
      try { errData = await response.json(); } catch(e) {}
      return res.status(response.status).json({ error: (errData.error && errData.error.message) || ("HTTP " + response.status) });
    }

    var data = await response.json();
    incrementUsage(ip);

    if (event_type) {
      supabaseInsert("usage_events", Object.assign({ event_type: event_type, ip_hash: ipHash }, meta || {}));
    }

    return res.status(200).json({
      content: data.content,
      usage: { used: usage + 1, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - (usage + 1) },
    });
  } catch(err) {
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
