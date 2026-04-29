import { useState, useRef, useEffect, useCallback } from "react";

// ── ANALYTICS — fire and forget ───────────────────────────────────────────
async function trackEvent(eventType, meta = {}) {
  try {
    await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType, meta }),
    });
  } catch {}
}

async function saveFeedback(rating, comment, ctx) {
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment, context: ctx, user_agent: navigator.userAgent }),
    });
  } catch {
    // Fallback: save to localStorage
    const fb = { date: new Date().toISOString(), rating, comment, context: ctx };
    const arr = JSON.parse(localStorage.getItem("mf_feedback")||"[]");
    localStorage.setItem("mf_feedback", JSON.stringify([...arr, fb]));
  }
}

// ── LOCAL STORAGE ──────────────────────────────────────────────────────────
const storage = {
  get:    (key)        => { const v = localStorage.getItem(key); return v ? { value: v } : null; },
  set:    (key, value) => { localStorage.setItem(key, value); return { key, value }; },
  delete: (key)        => { localStorage.removeItem(key); return { deleted: true }; },
  list:   (prefix = '') => ({ keys: Object.keys(localStorage).filter(k => k.startsWith(prefix)) }),
};

// ── API CALL — proxy en producción / directo en local ─────────────────────
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
let _usageInfo = null;
function getUsageInfo() { return _usageInfo; }

async function callClaude(messages, systemPrompt) {
  // Try proxy first (Vercel production)
  try {
    const response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system: systemPrompt }),
    });

    // Check if response is JSON (not HTML from SPA fallback)
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("NO_PROXY"); // got HTML = API function doesn't exist
    }

    const data = await response.json();

    if (response.status === 429) {
      throw new Error("RATE_LIMIT:" + (data.message || "Límite alcanzado"));
    }
    if (!response.ok) {
      throw new Error(data.error || "Error del servidor");
    }
    if (data.usage) _usageInfo = data.usage;
    return (data.content || []).map(b => b.text || "").join("") || "";

  } catch (e) {
    if (e.message && e.message.startsWith("RATE_LIMIT:")) throw e;

    // Proxy not available — fallback to direct API with local key
    const apiKey = localStorage.getItem("mf_apikey");
    if (!apiKey) throw new Error("NEED_API_KEY");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1000, system: systemPrompt, messages }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || ("HTTP " + response.status));
    }
    const data = await response.json();
    return data.content?.map(b => b.text || "").join("") || "";
  }
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --white: #ffffff;
    --off:   #fafaf9;
    --line:  #ececea;
    --line2: #d4d2cf;
    --soft:  #9b9893;
    --ink:   #4a4844;
    --black: #1a1817;
    --mistral: #A3DFF1;
    --zephir:  #FEE4B8;
    --solara:  #FFC065;
    --pulpe:   #FFA43A;
    --mistral-deep: #5fb8d4;
    --pulpe-deep:   #e8930a;
    --listen: #dc2626;
    --end:    #ef4444;
    --font: 'Tw Cen MT','Tw Cen MT Condensed',Futura,'Century Gothic',-apple-system,BlinkMacSystemFont,sans-serif;
    --mono: 'SF Mono','Fira Code',Menlo,monospace;
  }
  body { background:var(--white); color:var(--black); font-family:var(--font); overflow:hidden; }
  .app { height:100vh; display:flex; flex-direction:column; background:var(--white); }

  /* HEADER */
  .header { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid var(--line); background:var(--white); flex-shrink:0; }
  .logo { display:flex; align-items:center; }
  .logo-text { font-size:18px; font-weight:800; letter-spacing:-0.02em; color:var(--black); }
  .hdr-right { display:flex; align-items:center; gap:8px; }
  .badge { font-family:var(--mono); font-size:10px; letter-spacing:0.06em; padding:4px 10px; border-radius:3px; border:1px solid var(--line2); color:var(--soft); text-transform:uppercase; }
  .badge.on  { border-color:var(--listen); color:var(--listen); animation:blink 1.2s infinite; }
  .badge.live { border-color:var(--black); color:var(--black); background:var(--off); }
  @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
  .btn-new { font-family:var(--font); font-size:12px; padding:6px 13px; border-radius:5px; cursor:pointer; transition:all 0.15s; background:var(--white); color:var(--ink); border:1px solid var(--line); display:inline-flex; align-items:center; gap:6px; }
  .btn-new:hover { background:var(--off); border-color:var(--ink); color:var(--black); }
  .usage-chip { font-family:var(--mono); font-size:10px; padding:4px 10px; border-radius:3px; border:1px solid var(--line); color:var(--soft); }
  .usage-chip.low { border-color:var(--pulpe); color:var(--pulpe-deep); background:rgba(255,164,58,0.08); }

  /* SETUP */
  .setup { flex:1; display:flex; align-items:flex-start; justify-content:center; padding:36px 20px; overflow-y:auto; background:var(--off); }
  .setup-card { width:100%; max-width:580px; background:var(--white); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .setup-top { padding:24px 28px 18px; border-bottom:1px solid var(--line); background:linear-gradient(135deg, rgba(163,223,241,0.15) 0%, rgba(254,228,184,0.15) 100%); }
  .setup-title { font-size:19px; font-weight:700; color:var(--black); margin-bottom:4px; letter-spacing:-0.02em; }
  .setup-sub { font-size:12px; color:var(--soft); line-height:1.55; }
  .setup-body { padding:22px 28px 26px; display:flex; flex-direction:column; gap:18px; }
  .setup-divider { height:1px; background:linear-gradient(90deg, var(--mistral) 0%, var(--zephir) 50%, transparent 100%); opacity:0.5; }
  .field label { display:block; font-size:10px; font-weight:600; color:var(--ink); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:7px; font-family:var(--mono); }
  .field textarea, .field input { width:100%; background:var(--white); border:1px solid var(--line); border-radius:6px; color:var(--black); font-family:var(--font); font-size:13px; padding:10px 13px; resize:none; outline:none; transition:border-color 0.15s; }
  .field textarea:focus, .field input:focus { border-color:var(--pulpe); box-shadow:0 0 0 2px rgba(255,164,58,0.1); }
  .field textarea { min-height:74px; }

  .part-list { display:flex; flex-direction:column; gap:7px; margin-bottom:7px; }
  .part-row { display:flex; gap:7px; align-items:center; }
  .part-row input { background:var(--white); border:1px solid var(--line); border-radius:6px; color:var(--black); font-family:var(--font); font-size:12px; padding:8px 11px; outline:none; transition:border-color 0.15s; }
  .part-row input:focus { border-color:var(--black); }
  .part-name { flex:0 0 110px; }
  .part-role { flex:1; }
  .part-del { background:none; border:none; cursor:pointer; color:var(--line2); font-size:17px; padding:0 4px; line-height:1; transition:color 0.15s; }
  .part-del:hover { color:var(--listen); }
  .btn-add-part { width:100%; padding:8px; border-radius:6px; cursor:pointer; transition:all 0.15s; background:transparent; color:var(--soft); border:1px dashed var(--line2); font-family:var(--font); font-size:12px; }
  .btn-add-part:hover { border-color:var(--black); color:var(--black); }

  .pill-group { display:flex; flex-wrap:wrap; gap:6px; }
  .pill { font-family:var(--font); font-size:12px; padding:6px 13px; border-radius:20px; cursor:pointer; transition:all 0.15s; border:1px solid var(--line); background:var(--white); color:var(--ink); display:inline-flex; align-items:center; gap:5px; }
  .pill:hover { border-color:var(--black); color:var(--black); }
  .pill.active { background:var(--black); color:var(--white); border-color:var(--black); }

  .ag-list { display:flex; flex-direction:column; gap:6px; margin-bottom:7px; }
  .ag-item { display:flex; align-items:center; gap:9px; border:1px solid var(--line); border-radius:6px; padding:9px 12px; font-size:13px; color:var(--black); }
  .ag-num { font-family:var(--mono); font-size:10px; color:var(--soft); min-width:18px; }
  .ag-del { margin-left:auto; background:none; border:none; cursor:pointer; color:var(--line2); font-size:14px; transition:color 0.15s; }
  .ag-del:hover { color:var(--listen); }
  .add-row { display:flex; gap:7px; }
  .add-row input { flex:1; background:var(--white); border:1px solid var(--line); border-radius:6px; color:var(--black); font-family:var(--font); font-size:13px; padding:9px 12px; outline:none; transition:border-color 0.15s; }
  .add-row input:focus { border-color:var(--black); }
  .btn-add { background:var(--off); border:1px solid var(--line); color:var(--ink); border-radius:6px; padding:9px 14px; font-family:var(--font); font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s; }
  .btn-add:hover { background:var(--line); color:var(--black); }
  .btn-start { padding:11px 26px; border-radius:24px; background:var(--pulpe); color:var(--white); font-family:var(--font); font-size:14px; font-weight:600; letter-spacing:0.01em; border:none; cursor:pointer; transition:all 0.18s; align-self:flex-start; box-shadow:0 2px 12px rgba(255,164,58,0.25); }
  .btn-start:hover { background:var(--pulpe-deep); box-shadow:0 4px 18px rgba(255,164,58,0.35); }
  .btn-start:disabled { opacity:0.3; cursor:not-allowed; background:var(--black); }

  /* MEETING */
  .meeting { flex:1; display:grid; grid-template-columns:1fr 420px; grid-template-rows:auto 1fr; overflow:hidden; }
  .test-bar { grid-column:1/-1; display:flex; align-items:center; gap:8px; padding:7px 18px; background:var(--off); border-bottom:1px solid var(--line); }
  .test-bar label { font-family:var(--mono); font-size:10px; color:var(--soft); letter-spacing:0.06em; white-space:nowrap; text-transform:uppercase; }
  .test-bar input { flex:1; background:var(--white); border:1px solid var(--line); border-radius:5px; color:var(--black); font-family:var(--font); font-size:12px; padding:6px 11px; outline:none; transition:border-color 0.15s; }
  .test-bar input:focus { border-color:var(--black); }
  .spk-select { background:var(--white); border:1px solid var(--line); border-radius:5px; color:var(--ink); font-family:var(--mono); font-size:11px; padding:6px 8px; outline:none; cursor:pointer; }
  .btn-sim { padding:6px 13px; border-radius:5px; cursor:pointer; background:var(--black); color:var(--white); border:none; font-family:var(--font); font-size:12px; font-weight:600; transition:opacity 0.15s; white-space:nowrap; }
  .btn-sim:hover { opacity:0.8; }
  .btn-sim:disabled { opacity:0.3; cursor:not-allowed; }

  /* CHAT PANEL */
  .chat-panel { display:flex; flex-direction:column; border-right:1px solid var(--line); overflow:hidden; background:var(--white); }
  .chat-topbar { display:flex; align-items:center; padding:12px 18px; border-bottom:1px solid var(--line); flex-shrink:0; gap:8px; background:var(--white); }
  .chat-title { font-size:13px; font-weight:600; color:var(--black); letter-spacing:-0.01em; }
  .chat-actions { margin-left:auto; display:flex; align-items:center; gap:7px; }

  .btn-listen {
    display:inline-flex; align-items:center; gap:7px;
    padding:7px 16px; border-radius:22px;
    background:var(--mistral); color:var(--black);
    border:1.5px solid var(--mistral-deep);
    font-family:var(--font); font-size:12px; font-weight:700;
    cursor:pointer; transition:all 0.15s;
    box-shadow: 0 1px 2px rgba(95,184,212,0.15);
  }
  .btn-listen:hover { background:var(--mistral-deep); color:var(--white); border-color:var(--mistral-deep); }
  .btn-listen.on { background:var(--listen); color:var(--white); border-color:var(--listen); animation:blink 1.2s infinite; box-shadow:0 0 0 4px rgba(220,38,38,0.12); }
  .listen-dot { width:7px; height:7px; border-radius:50%; background:currentColor; flex-shrink:0; }

  .btn-end {
    display:inline-flex; align-items:center; gap:6px;
    padding:7px 14px; border-radius:22px; cursor:pointer; transition:all 0.15s;
    background:var(--white); color:var(--end);
    border:1.5px solid var(--end);
    font-family:var(--font); font-size:12px; font-weight:700;
  }
  .btn-end:hover { background:var(--end); color:var(--white); }

  .btn-stop-listen {
    display:inline-flex; align-items:center; gap:6px;
    padding:7px 14px; border-radius:22px; cursor:pointer; transition:all 0.15s;
    background:rgba(220,38,38,0.08); color:var(--listen);
    border:1.5px solid rgba(220,38,38,0.35);
    font-family:var(--font); font-size:12px; font-weight:700;
    animation:blink 1.2s infinite;
  }
  .btn-stop-listen:hover { background:var(--listen); color:var(--white); border-color:var(--listen); animation:none; }

  .chat-msgs { flex:1; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:14px; background:var(--off); }
  .chat-msgs::-webkit-scrollbar { width:4px; }
  .chat-msgs::-webkit-scrollbar-thumb { background:var(--line2); border-radius:4px; }

  .msg-row { display:flex; flex-direction:column; max-width:75%; animation:fadeUp 0.22s ease; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
  .msg-row.them { align-self:flex-start; align-items:flex-start; }
  .msg-row.me   { align-self:flex-end;   align-items:flex-end; }
  .msg-who { font-size:11px; font-weight:600; color:var(--soft); margin-bottom:4px; padding:0 4px; }
  .msg-row.them .msg-who { color:var(--ink); }

  .bubble { padding:11px 15px; font-size:13.5px; line-height:1.55; box-shadow:0 1px 1px rgba(0,0,0,0.04); }
  .them .bubble {
    background:var(--white);
    border:1px solid var(--line);
    border-radius:18px 18px 18px 5px;
    color:var(--black);
  }
  .me .bubble {
    background:var(--black);
    border-radius:18px 18px 5px 18px;
    color:var(--white);
  }
  .b-en { font-weight:500; }
  .b-es { font-size:11.5px; padding-top:8px; margin-top:8px; font-style:italic; line-height:1.5; }
  .them .b-es { color:var(--soft); border-top:1px solid var(--line); }
  .me   .b-es { color:rgba(255,255,255,0.6); border-top:1px solid rgba(255,255,255,0.18); }
  .msg-time { font-family:var(--mono); font-size:10px; color:var(--soft); margin-top:4px; padding:0 4px; }

  .interim-bub { align-self:flex-start; max-width:75%; background:var(--white); border:1px dashed var(--line2); border-radius:18px 18px 18px 5px; padding:11px 15px; font-size:13.5px; color:var(--soft); font-style:italic; }
  .wave-row { align-self:flex-start; display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:18px 18px 18px 5px; background:rgba(220,38,38,0.06); border:1px solid rgba(220,38,38,0.18); font-size:11px; color:var(--listen); font-family:var(--mono); }
  .wave { display:flex; align-items:center; gap:2px; }
  .wave span { width:2px; border-radius:2px; background:var(--listen); animation:wv 0.8s ease-in-out infinite; }
  .wave span:nth-child(1){height:6px;animation-delay:0s} .wave span:nth-child(2){height:12px;animation-delay:0.1s} .wave span:nth-child(3){height:8px;animation-delay:0.2s} .wave span:nth-child(4){height:14px;animation-delay:0.15s} .wave span:nth-child(5){height:6px;animation-delay:0.05s}
  @keyframes wv { 0%,100%{transform:scaleY(0.4);} 50%{transform:scaleY(1);} }
  .txl { align-self:flex-start; display:flex; align-items:center; gap:7px; font-family:var(--mono); font-size:11px; color:var(--soft); padding:0 6px; }
  .dots span { display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--soft); margin:0 2px; animation:bn 1s ease-in-out infinite; }
  .dots span:nth-child(2){animation-delay:.2s} .dots span:nth-child(3){animation-delay:.4s}
  @keyframes bn { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-4px);} }

  .chat-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--soft); font-size:13px; text-align:center; }
  .chat-empty svg { opacity:0.22; }

  /* RIGHT PANEL */
  .right-panel { display:flex; flex-direction:column; overflow:hidden; background:var(--white); }
  .meeting-meta { padding:9px 14px; border-bottom:1px solid var(--line); display:flex; flex-wrap:wrap; gap:5px; flex-shrink:0; background:var(--off); }
  .meta-chip { font-family:var(--mono); font-size:9px; padding:3px 8px; border-radius:3px; border:1px solid var(--line); color:var(--soft); text-transform:uppercase; letter-spacing:0.05em; }
  .sug-section { display:flex; flex-direction:column; flex:1; min-height:0; border-bottom:1px solid var(--line); overflow:hidden; background:var(--white); }
  .sec-header { padding:10px 14px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; background:var(--white); }
  .sec-title { font-size:12px; font-weight:600; color:var(--black); letter-spacing:-0.01em; }
  .btn-gen { display:flex; align-items:center; gap:5px; padding:6px 13px; border-radius:5px; cursor:pointer; transition:all 0.15s; background:var(--pulpe); color:var(--white); border:none; font-family:var(--font); font-size:11px; font-weight:700; }
  .btn-gen:hover { background:var(--pulpe-deep); }
  .btn-gen:disabled { opacity:0.35; cursor:not-allowed; }
  .btn-auto { padding:6px 11px; border-radius:5px; cursor:pointer; transition:all 0.15s; font-family:var(--mono); font-size:10px; font-weight:600; letter-spacing:0.04em; }
  .btn-auto.auto-off { background:var(--off); color:var(--soft); border:1px solid var(--line); }
  .btn-auto.auto-off:hover { border-color:var(--pulpe); color:var(--pulpe-deep); }
  .btn-auto.auto-on { background:var(--pulpe); color:var(--white); border:1px solid var(--pulpe-deep); box-shadow:0 1px 6px rgba(255,164,58,0.3); }
  .auto-countdown { display:flex; align-items:center; gap:7px; padding:6px 14px; font-family:var(--mono); font-size:10px; color:var(--pulpe-deep); background:var(--zephir); border-bottom:1px solid var(--line); flex-shrink:0; }
  .sug-list { flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:7px; }
  .sug-list::-webkit-scrollbar { width:3px; }
  .sug-card { background:var(--white); border:1px solid var(--line); border-radius:7px; padding:10px 12px; cursor:pointer; transition:all 0.15s; }
  .sug-card:hover { border-color:var(--ink); transform: translateX(2px); }
  .sug-card.agenda    { border-left:3px solid var(--solara); background: rgba(255,192,101,0.04); }
  .sug-card.reactive  { border-left:3px solid var(--mistral); background: rgba(163,223,241,0.05); }
  .sug-card.smalltalk { border-left:3px solid var(--mistral); background: rgba(163,223,241,0.05); }
  .sug-card.opening   { border-left:3px solid var(--zephir); background: rgba(254,228,184,0.12); }
  .sug-lbl { font-family:var(--mono); font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; }
  .sug-lbl.agenda    { color:var(--pulpe-deep); }
  .sug-lbl.reactive  { color:var(--mistral-deep); }
  .sug-lbl.smalltalk { color:var(--mistral-deep); }
  .sug-lbl.opening   { color:#b45309; }
  .sug-use { font-size:9px; color:var(--soft); font-family:var(--mono); letter-spacing:0; text-transform:none; font-weight:400; }
  .sug-en { font-size:12.5px; color:var(--black); line-height:1.55; margin-bottom:6px; }
  .sug-es { font-size:11px; color:var(--soft); font-style:italic; line-height:1.5; padding-top:6px; border-top:1px solid var(--line); }
  .sug-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:20px; color:var(--soft); font-size:12px; text-align:center; }
  .sug-empty svg { opacity:0.22; }

  .kw-section { padding:9px 12px 6px; border-top:1px solid var(--line); flex-shrink:0; background:var(--off); }
  .kw-custom-row { display:flex; gap:6px; margin-bottom:8px; }
  .kw-custom-input { flex:1; background:var(--white); border:1px solid var(--line); border-radius:20px; color:var(--black); font-family:var(--font); font-size:11px; padding:5px 12px; outline:none; transition:border-color 0.15s; }
  .kw-custom-input:focus { border-color:var(--pulpe); }
  .kw-custom-input::placeholder { color:var(--soft); }
  .btn-kw-search { padding:5px 12px; border-radius:20px; background:var(--black); color:var(--white); border:none; font-family:var(--font); font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
  .btn-kw-search:hover { background:var(--pulpe); }
  .btn-kw-search:disabled { opacity:0.35; cursor:not-allowed; }
  .kw-label { font-family:var(--mono); font-size:9px; color:var(--soft); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:7px; }
  .kw-chips { display:flex; flex-wrap:wrap; gap:5px; }
  .kw-chip { font-family:var(--font); font-size:11px; padding:4px 11px; border-radius:20px; cursor:pointer; border:1px solid var(--line); background:var(--white); color:var(--ink); transition:all 0.15s; }
  .kw-chip:hover { background:var(--solara); color:var(--white); border-color:var(--pulpe); transform:translateY(-1px); }
  .kw-loading { display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:10px; color:var(--soft); padding:4px 2px; }

  .ag-section { display:flex; flex-direction:column; flex:0 0 auto; border-bottom:1px solid var(--line); }

  .end-meeting-bar {
    padding:12px 14px; border-top:1px solid var(--line); flex-shrink:0;
    background:var(--white);
  }
  .btn-end {
    width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:10px 16px; border-radius:7px; cursor:pointer; transition:all 0.15s;
    background:var(--white); color:var(--soft);
    border:1.5px solid var(--line);
    font-family:var(--font); font-size:12px; font-weight:600;
  }
  .btn-end:hover { background:rgba(239,68,68,0.06); color:var(--end); border-color:var(--end); }
  .ag-progress { padding:7px 12px 2px; flex-shrink:0; }
  .ag-progress-bar { height:3px; background:var(--line); border-radius:3px; overflow:hidden; margin-bottom:5px; }
  .ag-progress-fill { height:100%; background:var(--solara); border-radius:3px; transition:width 0.4s ease; }
  .ag-progress-label { font-family:var(--mono); font-size:10px; color:var(--soft); }
  .ag-progress-label span { color:var(--pulpe-deep); font-weight:600; }
  .ag-scroll { padding:6px 11px 8px; display:flex; flex-direction:column; gap:4px; }
  .ctx-note { margin:9px 11px 4px; padding:7px 10px; border-radius:5px; background:var(--zephir); border:1px solid rgba(254,228,184,0.6); font-size:10px; color:var(--ink); line-height:1.4; font-style:italic; flex-shrink:0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; cursor:default; }
  .ctx-note:hover { -webkit-line-clamp:unset; overflow:visible; }
  .ag-check { display:flex; align-items:center; gap:7px; padding:6px 10px; border-radius:5px; cursor:pointer; transition:all 0.15s; font-size:12px; color:var(--black); border-left:3px solid transparent; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ag-check:hover { background:var(--off); }
  .ag-check.done { color:var(--soft); text-decoration:line-through; border-left-color: var(--solara); background: rgba(255,192,101,0.05); }
  .ag-check.current { border-left-color: var(--mistral-deep); background: rgba(163,223,241,0.18); font-weight:700; color:var(--black); }
  .ag-box { width:14px; height:14px; border-radius:3px; border:1.5px solid var(--line2); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; margin-top:1px; transition:all 0.15s; }
  .done .ag-box { background:var(--solara); border-color:var(--solara); color:var(--white); }
  .current .ag-box { border-color:var(--mistral-deep); color:var(--mistral-deep); }
  .ag-empty { padding:18px; color:var(--soft); font-size:12px; text-align:center; }

  .continue-banner { background: rgba(255,192,101,0.1); border: 1px solid rgba(255,164,58,0.3); border-radius:6px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .continue-text { font-size:12px; color:var(--pulpe-deep); line-height:1.5; }
  .continue-text strong { font-weight:700; display:block; margin-bottom:2px; }
  .btn-continue-clear { background:none; border:none; cursor:pointer; color:var(--soft); font-size:18px; line-height:1; padding:0 2px; }
  .btn-continue-clear:hover { color:var(--listen); }

  .picker-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index:400; padding:20px; }
  .picker-modal { background:var(--white); border:1px solid var(--line); border-radius:10px; width:100%; max-width:480px; max-height:70vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .picker-header { padding:16px 20px 12px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
  .picker-title { font-size:14px; font-weight:700; color:var(--black); }
  .picker-body { flex:1; overflow-y:auto; }
  .picker-item { padding:12px 20px; border-bottom:1px solid var(--line); cursor:pointer; transition:background 0.12s; }
  .picker-item:hover { background:var(--off); }
  .picker-item:last-child { border-bottom:none; }
  .picker-date { font-family:var(--mono); font-size:10px; color:var(--soft); margin-bottom:3px; }
  .picker-name { font-size:13px; font-weight:600; color:var(--black); margin-bottom:2px; }
  .picker-meta { font-size:11px; color:var(--soft); }

  /* HISTORY */
  .history { flex:1; display:flex; overflow:hidden; }
  .history-list { width:280px; border-right:1px solid var(--line); display:flex; flex-direction:column; overflow:hidden; flex-shrink:0; background:var(--off); }
  .history-list-header { padding:14px 18px; border-bottom:1px solid var(--line); font-size:13px; font-weight:700; color:var(--black); background:var(--white); }
  .history-list-body { flex:1; overflow-y:auto; }
  .history-item { padding:13px 18px; border-bottom:1px solid var(--line); cursor:pointer; transition:background 0.12s; }
  .history-item:hover { background:var(--white); }
  .history-item.selected { background:var(--white); border-left:3px solid var(--black); }
  .hi-date { font-family:var(--mono); font-size:10px; color:var(--soft); margin-bottom:3px; }
  .hi-name { font-size:13px; font-weight:600; color:var(--black); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .hi-meta { font-size:11px; color:var(--soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .history-empty { padding:36px 18px; text-align:center; color:var(--soft); font-size:13px; }
  .history-empty svg { opacity:0.2; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto; }
  .history-detail { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--white); }
  .hd-header { padding:16px 22px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .hd-date { font-family:var(--mono); font-size:10px; color:var(--soft); margin-top:3px; }
  .hd-tabs { display:flex; border-bottom:1px solid var(--line); flex-shrink:0; padding:0 22px; }
  .hd-tab { padding:11px 18px; font-size:12px; font-weight:600; color:var(--soft); cursor:pointer; border-bottom:2px solid transparent; transition:all 0.15s; background:none; border-top:none; border-left:none; border-right:none; font-family:var(--font); margin-bottom:-1px; }
  .hd-tab.active { color:var(--black); border-bottom-color:var(--black); }
  .hd-body { flex:1; overflow-y:auto; padding:18px 22px; display:flex; flex-direction:column; gap:14px; }
  .history-detail-empty { flex:1; display:flex; align-items:center; justify-content:center; color:var(--soft); font-size:13px; }
  .hi-name-edit { background:none; border:none; border-bottom:1px dashed var(--line2); outline:none; font-size:14px; font-weight:700; color:var(--black); font-family:var(--font); padding:1px 4px; cursor:text; }
  .hi-name-edit:focus { border-bottom-color:var(--black); }

  /* SUMMARY */
  .summary-section { background:var(--off); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
  .summary-section.fresh { border-color:var(--mistral-deep); background: rgba(163,223,241,0.06); }
  .modal-section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--soft); font-family:var(--mono); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
  .summary-block { font-size:13px; line-height:1.65; color:var(--black); }
  .summary-block.es { font-size:12.5px; color:var(--ink); margin-top:8px; padding-top:8px; border-top:1px dashed var(--line); font-style:italic; }
  .summary-item { display:flex; gap:11px; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; color:var(--black); line-height:1.5; }
  .summary-item:last-child { border-bottom:none; }
  .summary-item-text { flex:1; }
  .summary-item-text .es { font-size:11.5px; color:var(--soft); margin-top:3px; font-style:italic; }
  .summary-bullet { flex-shrink:0; width:18px; height:18px; border-radius:4px; border:1.5px solid var(--line2); display:flex; align-items:center; justify-content:center; margin-top:1px; }
  .btn-copy-summary { padding:9px 18px; border-radius:5px; cursor:pointer; transition:all 0.15s; background:var(--black); color:var(--white); border:none; font-family:var(--font); font-size:12px; font-weight:700; }
  .btn-copy-summary:hover { background:var(--pulpe); }

  .spk-0{color:#1d4ed8} .spk-1{color:#9333ea} .spk-2{color:#b45309} .spk-3{color:#0f766e}
  .toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); background:var(--black); color:var(--white); padding:9px 20px; border-radius:22px; font-size:12px; font-weight:600; animation:fadeUp 0.2s ease; z-index:999; pointer-events:none; white-space:nowrap; }

  /* END CONFIRM + FEEDBACK MODAL */
  .confirm-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:600; padding:20px; animation:fadeUp 0.2s ease; }
  .confirm-modal { background:var(--white); border-radius:12px; width:100%; max-width:420px; box-shadow:0 8px 40px rgba(0,0,0,0.18); overflow:hidden; }
  .confirm-header { padding:20px 22px 14px; border-bottom:1px solid var(--line); background:linear-gradient(135deg, rgba(254,228,184,0.3) 0%, rgba(255,192,101,0.15) 100%); }
  .confirm-title { font-size:16px; font-weight:700; color:var(--black); margin-bottom:3px; }
  .confirm-sub { font-size:12px; color:var(--soft); line-height:1.5; }
  .confirm-body { padding:18px 22px; display:flex; flex-direction:column; gap:14px; }
  .confirm-actions { display:flex; gap:8px; }
  .btn-confirm-yes { flex:1; padding:10px; border-radius:6px; background:var(--end); color:var(--white); border:none; font-family:var(--font); font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; }
  .btn-confirm-yes:hover { background:#c53030; }
  .btn-confirm-no { flex:1; padding:10px; border-radius:6px; background:var(--off); color:var(--ink); border:1px solid var(--line); font-family:var(--font); font-size:13px; cursor:pointer; transition:all 0.15s; }
  .btn-confirm-no:hover { background:var(--line); }

  .feedback-section { border-top:1px solid var(--line); padding:14px 22px 18px; }
  .feedback-title { font-size:12px; font-weight:700; color:var(--black); margin-bottom:12px; line-height:1.4; }
  .vote-row { display:flex; gap:10px; margin-bottom:12px; }
  .vote-btn {
    flex:1; padding:12px 8px; border-radius:10px; border:1.5px solid var(--line);
    background:var(--white); cursor:pointer; transition:all 0.2s;
    display:flex; flex-direction:column; align-items:center; gap:6px;
    font-family:var(--font); font-size:11px; font-weight:600; color:var(--soft);
  }
  .vote-btn:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
  .vote-btn.up:hover   { border-color:var(--mistral-deep); color:var(--mistral-deep); background:rgba(163,223,241,0.1); }
  .vote-btn.down:hover { border-color:var(--soft); color:var(--ink); background:var(--off); }
  .vote-btn.selected-up   { border-color:var(--mistral-deep); color:var(--mistral-deep); background:rgba(163,223,241,0.12); box-shadow:0 2px 10px rgba(95,184,212,0.2); }
  .vote-btn.selected-down { border-color:var(--ink); color:var(--ink); background:var(--off); }
  .vote-icon { width:32px; height:32px; }
  .feedback-textarea { width:100%; background:var(--white); border:1px solid var(--line); border-radius:6px; color:var(--black); font-family:var(--font); font-size:12px; padding:9px 12px; resize:none; outline:none; min-height:60px; transition:border-color 0.15s; }
  .feedback-textarea:focus { border-color:var(--pulpe); }
  .btn-send-feedback { width:100%; margin-top:10px; padding:10px; border-radius:6px; background:var(--black); color:var(--white); border:none; font-family:var(--font); font-size:13px; font-weight:700; cursor:pointer; transition:all 0.15s; }
  .btn-send-feedback:hover { background:var(--pulpe); }
  .btn-send-feedback:disabled { opacity:0.3; cursor:not-allowed; }
  .feedback-thanks { text-align:center; padding:10px 0 4px; font-size:13px; color:var(--mistral-deep); font-weight:700; }
  .feedback-thanks-sub { text-align:center; font-size:11px; color:var(--soft); margin-top:2px; }

  /* API KEY OVERLAY (modo local) */
  .apikey-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:600; padding:20px; }
  .apikey-modal { background:var(--white); border-radius:12px; width:100%; max-width:480px; padding:24px 26px 22px; box-shadow:0 8px 40px rgba(0,0,0,0.2); }
  .apikey-title { font-size:16px; font-weight:700; color:var(--black); margin-bottom:4px; }
  .apikey-sub { font-size:12px; color:var(--soft); line-height:1.55; margin-bottom:16px; }
  .apikey-steps { font-size:12px; color:var(--ink); line-height:1.9; background:var(--off); border:1px solid var(--line); border-radius:6px; padding:11px 14px; margin-bottom:14px; }
  .apikey-steps a { color:var(--mistral-deep); }
  .apikey-input-row { display:flex; gap:8px; margin-bottom:8px; }
  .apikey-input { flex:1; background:var(--white); border:1px solid var(--line); border-radius:5px; color:var(--black); font-family:var(--mono); font-size:12px; padding:9px 12px; outline:none; }
  .apikey-input:focus { border-color:var(--black); }
  .apikey-save { background:var(--black); color:var(--white); border:none; border-radius:5px; padding:9px 18px; font-family:var(--font); font-size:13px; font-weight:700; cursor:pointer; }
  .apikey-save:hover { background:var(--pulpe); }
  .apikey-save:disabled { opacity:0.3; cursor:not-allowed; background:var(--black); }
  .apikey-error { font-size:12px; color:var(--listen); margin-top:6px; }
  .apikey-note { font-size:11px; color:var(--soft); margin-top:10px; line-height:1.5; }
`;


// ── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  // Usage / API key state
  const [usageInfo, setUsageInfo]   = useState(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [validatingKey, setValidatingKey] = useState(false);

  // App state
  const [phase, setPhase]             = useState("setup");
  const [context, setContext]         = useState("");
  const [agInput, setAgInput]         = useState("");
  const [agenda, setAgenda]           = useState([]);
  const [agDone, setAgDone]           = useState([]);
  const [participants, setParticipants] = useState([{ name: "", role: "" }]);
  const [meetingStyle, setMeetingStyle] = useState("semi-formal");
  const [requestedBy, setRequestedBy]   = useState("me");
  const [myName, setMyName]             = useState("");
  const [chat, setChat]               = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim]         = useState("");
  const [loadingTx, setLoadingTx]     = useState(false);
  const [loadingSug, setLoadingSug]   = useState(false);
  const [testInput, setTestInput]     = useState("");
  const [simSpeaker, setSimSpeaker]   = useState(0);
  const [loadingSim, setLoadingSim]   = useState(false);
  const [toast, setToast]             = useState(false);
  const [autoSug, setAutoSug]         = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary]         = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText]     = useState("");
  const [feedbackSent, setFeedbackSent]     = useState(false);
  const [history, setHistory]         = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailTab, setDetailTab]     = useState("summary");
  const [englishLevel, setEnglishLevel] = useState("intermediate");
  const [continueFrom, setContinueFrom] = useState(null);
  const [showContinuePicker, setShowContinuePicker] = useState(false);
  const [keywords, setKeywords]         = useState([]);
  const [loadingKw, setLoadingKw]       = useState(false);
  const [customKw, setCustomKw]         = useState("");
  const [openingShown, setOpeningShown] = useState(false);

  const recRef          = useRef(null);
  const chatBottom      = useRef(null);
  const debounceRef     = useRef(null);    // auto-suggest debounce
  const genSugRef       = useRef(null);
  const autoSugRef      = useRef(false);   // always-current autoSug value

  // Load history from localStorage on mount
  useEffect(() => {
    const keys = storage.list("meeting:").keys;
    const records = keys.map(k => {
      try { return JSON.parse(storage.get(k)?.value); } catch { return null; }
    }).filter(Boolean).sort((a,b) => b.timestamp - a.timestamp);
    setHistory(records);
  }, []);

  const saveMeeting = (summaryData) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-PE", { year:"numeric", month:"2-digit", day:"2-digit" });
    const timeStr = now.toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit" });
    const id = `meeting:${now.getTime()}`;
    const record = { id, timestamp: now.getTime(), name: `Reunión ${dateStr} ${timeStr}`, date: dateStr, time: timeStr, context, participants: participants.filter(p=>p.name.trim()), meetingStyle, agenda, agDone, chat, summary: summaryData };
    storage.set(id, JSON.stringify(record));
    setHistory(prev => [record, ...prev]);
    return record;
  };

  // API wrapper + track usage
  const claude = useCallback(async (messages, sys) => {
    try {
      const result = await callClaude(messages, sys);
      const u = getUsageInfo();
      if (u) setUsageInfo(u);
      return result;
    } catch(e) {
      if (e.message === "NEED_API_KEY" || e.message === "NO_PROXY") {
        setNeedsApiKey(true);
        throw e;
      }
      if (e.message?.startsWith("RATE_LIMIT:")) {
        alert(e.message.replace("RATE_LIMIT:",""));
        throw e;
      }
      throw e;
    }
  }, []);

  // Validate and save API key (local mode only)
  const validateKey = async () => {
    if (!apiKeyInput.trim().startsWith("sk-ant-")) {
      setApiKeyError("La key debe empezar con 'sk-ant-'");
      return;
    }
    setValidatingKey(true); setApiKeyError("");
    localStorage.setItem("mf_apikey", apiKeyInput.trim());
    try {
      await callClaude([{ role:"user", content:"hi" }], "Reply: ok");
      setNeedsApiKey(false);
      setApiKeyInput("");
    } catch (e) {
      localStorage.removeItem("mf_apikey");
      setApiKeyError("No se pudo conectar. Verifica la key.");
    }
    setValidatingKey(false);
  };

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      // Show interim text live
      if (interim) setInterim(interim);
      // When Chrome confirms a phrase → show it instantly, translate in background
      if (final.trim()) {
        setInterim("");
        const id = Date.now();
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        // Add to chat IMMEDIATELY — no waiting for translation
        setChat(prev => [...prev, {
          id, speaker: "them", speakerName: "Ellos",
          en: final.trim(), es: "(traduciendo...)", time: timeStr
        }]);
        // Translate in background — does NOT block speech capture
        translateAndUpdate(id, final.trim());
      }
    };

    r.onerror = () => {};
    r.onend = () => {
      if (recRef.current?._active) {
        setTimeout(() => {
          try { r.start(); } catch(e) {}
        }, 50);
      }
    };

    recRef.current = r;
  }, []);

  // Auto-generate opening greetings when meeting starts and user called it
  useEffect(() => {
    if (phase === "meeting" && !openingShown && chat.length === 0) {
      setOpeningShown(true);
      generateOpenings();
    }
  }, [phase]);

  const generateOpenings = async () => {
    setLoadingSug(true); setSuggestions([]);
    const validParts = participants.filter(p=>p.name.trim());
    const names = validParts.map(p=>p.name).join(", ") || "the other participants";
    const levelMap = { basic:"Simple vocabulary but complete natural sentences (15-25 words), warm and easy to pronounce", intermediate:"Clear conversational English, full natural sentences (20-30 words)", advanced:"Professional polished sentences (25-35 words)", native:"Native expressions, warm and eloquent" };
    const styleLabels = {formal:"formal","semi-formal":"semi-formal and friendly",informal:"casual and warm",negotiation:"professional",demo:"enthusiastic",followup:"concise"};
    const sys = `Generate 3 opening greeting suggestions to START a business meeting in English.
The user (${myName||"the host"}) is opening this meeting with: ${names}.
Meeting style: ${styleLabels[meetingStyle]||"professional"}
English level: ${levelMap[englishLevel]}
Include: 1 warm greeting + brief intro (how are you, glad we could meet), 1 greeting + casual small talk opener (weekend, weather, something light), 1 greeting + meeting purpose statement. Each suggestion should feel natural and complete — not abrupt.
Respond ONLY in valid JSON: {"suggestions":[{"en":"...","es":"...","label":"...","type":"opening"}]}
IMPORTANT: "label" MUST be in Spanish, max 3 words (e.g. "Saludo inicial", "Bienvenida", "Presenta agenda").`;
    try {
      const raw = await claude([{role:"user",content:"Generate opening greetings for this meeting."}], sys);
      setSuggestions(JSON.parse(raw.replace(/```json|```/g,"").trim()).suggestions||[]);
    } catch {
      setSuggestions([
        {en:`Hi ${validParts[0]?.name||"everyone"}, thanks for joining! How are you?`, es:`¡Hola ${validParts[0]?.name||"a todos"}, gracias por unirse! ¿Cómo están?`, label:"Saludo inicial", type:"opening"},
        {en:"Good to see you! Ready to get started?", es:"¡Qué bueno verlos! ¿Listos para empezar?", label:"Bienvenida casual", type:"opening"},
        {en:`Thanks for your time today. I wanted to discuss ${context||"a few things"} with you.`, es:`Gracias por su tiempo hoy. Quería hablar sobre ${context||"algunas cosas"} con ustedes.`, label:"Abre agenda", type:"opening"},
      ]);
    }
    setLoadingSug(false);
  };

  const generateKeywords = async (lastSuggestion) => {
    setLoadingKw(true); setKeywords([]);
    const recentChat = chat.slice(-4).map(m=>`${m.speakerName||"Ellos"}: ${m.en}`).join("\n");
    const sys = `Based on a business meeting conversation, generate 6-8 short keyword chips the user can tap to get more suggestions on that topic.
Mix: 2-3 agenda-related keywords, 2-3 spontaneous/casual topics (weather, weekend, family, pets, hobbies), 1-2 follow-up topics from the conversation.
Context: ${context||"Business meeting"}
Last thing said by user: "${lastSuggestion}"
Respond ONLY in valid JSON: {"keywords":["keyword1","keyword2",...]}
Keep each keyword under 3 words. Mix English and Spanish is fine.`;
    try {
      const raw = await claude([{role:"user",content:`Recent chat:\n${recentChat||"Just started."}\n\nGenerate keywords.`}], sys);
      setKeywords(JSON.parse(raw.replace(/```json|```/g,"").trim()).keywords||[]);
    } catch {
      setKeywords(["small talk","agenda","follow up","next steps","mascotas","fin de semana","clima","preguntas"]);
    }
    setLoadingKw(false);
  };

  const generateFromKeyword = async (kw) => {
    setLoadingSug(true); setSuggestions([]); setKeywords([]);
    const lines = chat.slice(-4).map(m=>`${m.speakerName||(m.speaker==="me"?(myName||"Tú"):"Ellos")}: "${m.en}"`).join("\n");
    const levelMap = { basic:"Simple everyday vocabulary, but COMPLETE natural sentences (15-25 words). Easy to pronounce, never artificially short.", intermediate:"Clear conversational English, full sentences (20-30 words).", advanced:"Professional polished vocabulary (25-35 words).", native:"Native expressions and idioms, eloquent." };
    const sys = `Generate 3 English meeting suggestions focused on the topic: "${kw}".
User: ${myName||"the user"} | Level: ${levelMap[englishLevel]} | Style: ${meetingStyle}
Context: ${context||"Business meeting"} | Participants: ${participants.filter(p=>p.name).map(p=>p.name).join(",")||"not specified"}
Can be casual small talk OR business related depending on the keyword.
Respond ONLY in valid JSON: {"suggestions":[{"en":"...","es":"...","label":"...","type":"reactive|agenda|smalltalk"}]}
IMPORTANT: "label" MUST be in Spanish, max 3 words.`;
    try {
      const raw = await claude([{role:"user",content:`Topic: "${kw}"\nRecent conversation:\n${lines||"Just started."}\n\nGenerate 3 suggestions.`}], sys);
      setSuggestions(JSON.parse(raw.replace(/```json|```/g,"").trim()).suggestions||[]);
    } catch {
      setSuggestions([{en:`Tell me more about ${kw}`, es:`Cuéntame más sobre ${kw}`, label:kw, type:"reactive"}]);
    }
    setLoadingSug(false);
  };
  // Keep refs always pointing to latest functions/values
  useEffect(() => { genSugRef.current = generateSuggestions; });
  useEffect(() => { autoSugRef.current = autoSug; }, [autoSug]);
  useEffect(() => {
    // Only trigger when new "them" message arrives
    if (chat.length === 0) return;
    const last = chat[chat.length - 1];
    if (last?.speaker !== "them") return;
    if (!autoSugRef.current) return;

    clearTimeout(debounceRef.current);
    setAutoCountdown(true);

    debounceRef.current = setTimeout(() => {
      setAutoCountdown(false);
      if (autoSugRef.current && genSugRef.current) {
        genSugRef.current();
      }
    }, 2500);

    return () => {
      clearTimeout(debounceRef.current);
    };
  }, [chat]);  // only depends on chat — autoSugRef handles current value

  // Translate a message by ID and update in chat (non-blocking)
  const translateAndUpdate = async (msgId, text) => {
    try {
      const es = (await claude(
        [{ role: "user", content: "Translate to Spanish. Return ONLY the translation:\n\"" + text + "\"" }],
        "Precise translator. Return only the Spanish translation."
      )).trim();
      setChat(prev => prev.map(m => m.id === msgId ? { ...m, es } : m));
    } catch {
      setChat(prev => prev.map(m => m.id === msgId ? { ...m, es: "(sin traducción)" } : m));
    }
  };

  const addThemMsg = useCallback(async (text, speakerName) => {
    // Used by simulator — adds and translates in one step
    const id = Date.now();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setChat(prev => [...prev, { id, speaker: "them", speakerName: speakerName || "Ellos", en: text, es: "(traduciendo...)", time: now }]);
    setLoadingTx(true);
    try {
      const es = (await claude(
        [{ role: "user", content: "Translate to Spanish. Return ONLY the translation:\n\"" + text + "\"" }],
        "Precise translator. Return only the Spanish translation."
      )).trim();
      setChat(prev => prev.map(m => m.id === id ? { ...m, es } : m));
    } catch {
      setChat(prev => prev.map(m => m.id === id ? { ...m, es: "(sin traducción)" } : m));
    }
    setLoadingTx(false);
  }, [claude]);

  const useSuggestion = (sug) => {
    const now = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    setChat(prev => [...prev, { id:Date.now(), speaker:"me", en:sug.en, es:sug.es, time:now }]);
    navigator.clipboard.writeText(sug.en).catch(()=>{});
    setToast(true); setTimeout(()=>setToast(false), 1800);
    generateKeywords(sug.en);
    trackEvent("suggestion_used", { type: sug.type });
  };

  const generateSuggestions = async () => {
    setLoadingSug(true); setSuggestions([]);
    const lines = chat.slice(-8).map(m=>`${m.speakerName||(m.speaker==="me"?(myName||"Tú"):"Ellos")}: "${m.en}"`).join("\n");
    const pendingAgenda = agenda.filter((_,i)=>!agDone.includes(i));
    const doneAgenda    = agenda.filter((_,i)=> agDone.includes(i));
    const validParts    = participants.filter(p=>p.name.trim());
    const styleMap = { formal:"very formal", "semi-formal":"semi-formal and professional", informal:"casual", negotiation:"strategic and persuasive", demo:"engaging sales-oriented", followup:"concise action-oriented" };
    const levelMap = {
      basic:        "Use simple everyday vocabulary that is easy to pronounce. Keep grammar simple but write COMPLETE, natural sentences (15-25 words each). Avoid technical jargon, but DO NOT make sentences artificially short — they must flow naturally in conversation.",
      intermediate: "Use clear, natural conversational English with full sentences (20-30 words). Avoid heavy jargon but speak like a real person in a meeting — fluid and confident.",
      advanced:     "Use professional business vocabulary with varied, polished sentence structures (25-35 words). Sound articulate and prepared.",
      native:       "Use natural native-speaker expressions, idioms, and rich business vocabulary. Be eloquent and fluent."
    };
    const prevContext = continueFrom ? `\nPREVIOUS MEETING CONTEXT: This is a continuation of a meeting on ${continueFrom.date}. Previous summary: ${continueFrom.summary?.summary||""}. Pending topics from before: ${continueFrom.summary?.pending_topics?.join(", ")||"none"}.` : "";
    const sys = `You are a meeting assistant helping ${myName||"the user"} respond in an English business meeting.
CONTEXT: ${context||"Business meeting"}
STYLE: ${styleMap[meetingStyle]||"professional"}
ENGLISH LEVEL: ${levelMap[englishLevel]}
PARTICIPANTS: ${validParts.map(p=>p.name+"("+p.role+")").join(", ")||"not specified"}
AGENDA PENDING: ${pendingAgenda.join(" | ")||"all covered"}
COVERED: ${doneAgenda.join(", ")||"none"}${prevContext}

YOUR TASK: Read the conversation carefully and generate 3 DIFFERENT response suggestions the user can say NEXT. Each must be a DIRECT, RELEVANT response to what was just said — NOT generic phrases.

RULES:
1. Each suggestion must DIRECTLY address the last thing said in conversation
2. Make suggestions feel like something a real person would say naturally — warm, conversational, flowing
3. If there are pending agenda items, include 1 suggestion that naturally transitions to the next topic
4. Even at basic English level, write complete sentences (15-30 words) — NEVER short fragments
5. Vary the approach: one could agree/build on what was said, one could ask a follow-up question, one could introduce a new angle
6. Include the Spanish translation so the user understands what they would be saying

Respond ONLY in valid JSON: {"suggestions":[{"en":"...","es":"...","label":"...","type":"reactive|agenda"}]}
IMPORTANT: "label" MUST be in Spanish, max 3 words.`;
    try {
      const raw = await claude([{role:"user",content:`Conversation:\n${lines||"Meeting just started."}\n\nGenerate 3 smart suggestions.`}], sys);
      setSuggestions(JSON.parse(raw.replace(/```json|```/g,"").trim()).suggestions||[]);
    } catch {
      setSuggestions([
        {en:"Could you clarify what you mean?",es:"¿Podrías aclarar lo que quieres decir?",label:"Pide aclaración",type:"reactive"},
        {en:"That makes sense. Let's move forward.",es:"Tiene sentido. Sigamos.",label:"Muestra acuerdo",type:"reactive"},
        pendingAgenda.length>0
          ?{en:`Let's move to: ${pendingAgenda[0]}`,es:`Pasemos a: ${pendingAgenda[0]}`,label:"Avanza agenda",type:"agenda"}
          :{en:"Is there anything else before we wrap up?",es:"¿Algo más antes de terminar?",label:"Cierra reunión",type:"agenda"}
      ]);
    }
    setLoadingSug(false);
  };

  const endMeeting = async () => {
    if (recRef.current) recRef.current._active = false;
    recRef.current?.stop(); setIsListening(false); setInterim("");
    setLoadingSummary(true); setSummary(null);
    setPhase("history");
    trackEvent("meeting_ended", { chat_length: chat.length, agenda_count: agenda.length, meeting_style: meetingStyle, english_level: englishLevel });
    const transcript = chat.map(m=>`${m.speakerName||(m.speaker==="me"?(myName||"Yo"):"Ellos")}: ${m.en}`).join("\n");
    const coveredItems = agenda.filter((_,i)=>agDone.includes(i));
    const pendingItems = agenda.filter((_,i)=>!agDone.includes(i));
    const sys = `Summarize this business meeting in BOTH English and Spanish. Be concise and practical.
Respond ONLY in valid JSON:
{
  "duration_note": "short note (e.g. 'Reunión de 12 minutos · 15 mensajes')",
  "summary_en": "2-3 sentence overview in English",
  "summary_es": "2-3 sentence overview in Spanish",
  "agreements": [{"en":"...","es":"..."}],
  "next_actions": [{"en":"...","es":"..."}],
  "pending_topics": [{"en":"...","es":"..."}]
}`;
    try {
      const raw = await claude([{role:"user",content:`Context:${context||"Business meeting"}\nParticipants:${participants.filter(p=>p.name).map(p=>`${p.name}(${p.role})`).join(",")}\nCovered:${coveredItems.join(",")}\nPending:${pendingItems.join(",")}\nTranscript:\n${transcript||"No messages."}\n\nSummarize.`}], sys);
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setSummary(parsed);
      const rec = saveMeeting(parsed);
      setSelectedRecord({...rec, isFresh: true});
      setDetailTab("summary");
    } catch {
      const fb = {duration_note:"Reunión finalizada",summary_en:"Could not generate summary.",summary_es:"No se pudo generar el resumen.",agreements:[],next_actions:[],pending_topics:pendingItems.map(t=>({en:t,es:t}))};
      setSummary(fb);
      const rec = saveMeeting(fb);
      setSelectedRecord({...rec, isFresh: true});
      setDetailTab("summary");
    }
    setLoadingSummary(false);
  };

  const toggleListen = () => {
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { alert("Usa Chrome o Edge para el micrófono."); return; }
    if (!isListening) {
      recRef.current._active = true;
      try { recRef.current?.start(); } catch(e) {}
      setIsListening(true);
    } else {
      recRef.current._active = false;
      recRef.current?.stop();
      setInterim("");
      setIsListening(false);
    }
  };

  const simulate = async () => {
    if (!testInput.trim()) return;
    setLoadingSim(true);
    const sp = participants[simSpeaker];
    await addThemMsg(testInput.trim(), sp?.name?.trim()||"Ellos");
    setTestInput(""); setLoadingSim(false);
  };

  const addAgenda = () => { if(!agInput.trim()) return; setAgenda(p=>[...p,agInput.trim()]); setAgInput(""); };

  const reset = () => {
    if (recRef.current) recRef.current._active=false;
    recRef.current?.stop();
    setIsListening(false); setInterim("");
    setChat([]); setSuggestions([]); setSummary(null);
    // Clear ALL setup fields completely
    setContext(""); setAgInput("");
    setParticipants([{name:"",role:""}]); setMeetingStyle("semi-formal");
    setRequestedBy("me"); setMyName(""); setAgenda([]); setAgDone([]);
    setEnglishLevel("intermediate"); setContinueFrom(null); setShowContinuePicker(false);
    setKeywords([]); setOpeningShown(false); setCustomKw("");
    setPhase("setup");
  };

  const SummaryBody = ({ s, fresh }) => {
    if (!s) return null;
    // Backward compat: old summaries used .summary as string
    const summaryEn = s.summary_en || s.summary || "";
    const summaryEs = s.summary_es || "";
    const items = (arr) => Array.isArray(arr) ? arr.map(a => typeof a === "string" ? {en:a, es:a} : a) : [];
    return (<>
      {fresh && (
        <div className="summary-section fresh">
          <div className="modal-section-title">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5.5l2.5 2.5L9 3"/></svg>
            Reunión finalizada
          </div>
          <div style={{fontSize:12,color:"var(--mistral-deep)",fontWeight:500}}>{s.duration_note}</div>
        </div>
      )}
      <div className="summary-section">
        <div className="modal-section-title">Resumen general</div>
        <div className="summary-block">{summaryEn}</div>
        {summaryEs && <div className="summary-block es">{summaryEs}</div>}
      </div>
      {items(s.agreements).length>0 && (
        <div className="summary-section">
          <div className="modal-section-title">Acuerdos · Agreements</div>
          {items(s.agreements).map((a,i)=>(
            <div className="summary-item" key={i}>
              <div className="summary-bullet" style={{borderColor:"var(--solara)"}}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--pulpe-deep)" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5l2 2 4-4"/></svg>
              </div>
              <div className="summary-item-text">
                {a.en}
                {a.es && a.es !== a.en && <div className="es">{a.es}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {items(s.next_actions).length>0 && (
        <div className="summary-section">
          <div className="modal-section-title">Próximos pasos · Next steps</div>
          {items(s.next_actions).map((a,i)=>(
            <div className="summary-item" key={i}>
              <div className="summary-bullet" style={{borderColor:"var(--mistral-deep)"}}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--mistral-deep)" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5h6M5 2l3 3-3 3"/></svg>
              </div>
              <div className="summary-item-text">
                {a.en}
                {a.es && a.es !== a.en && <div className="es">{a.es}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {items(s.pending_topics).length>0 && (
        <div className="summary-section">
          <div className="modal-section-title">Pendientes · Pending</div>
          {items(s.pending_topics).map((a,i)=>(
            <div className="summary-item" key={i}>
              <div className="summary-bullet" style={{borderColor:"#d97706"}}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#d97706" strokeWidth="1.6" strokeLinecap="round"><circle cx="5" cy="5" r="3"/><path d="M5 3v2.5"/><circle cx="5" cy="7.5" r="0.5" fill="#d97706"/></svg>
              </div>
              <div className="summary-item-text">
                {a.en}
                {a.es && a.es !== a.en && <div className="es">{a.es}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>);
  };

  // Beta: no API key screen needed — proxy handles it

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <header className="header">
          <div className="logo">
            <span className="logo-text">meetfluent</span>
          </div>
          <div className="hdr-right">
            {phase==="meeting" ? (
              <>
                <span className={`badge ${isListening?"on":"live"}`}>{isListening?"● ESCUCHANDO":"EN REUNIÓN"}</span>
                {usageInfo && <span className={`usage-chip ${usageInfo.remaining<=5?"low":""}`}>{usageInfo.remaining}/{usageInfo.limit} hoy</span>}
                <button className="btn-new" onClick={reset}>↩ Nueva</button>
              </>
            ) : (
              <>
                <button className="btn-new" onClick={()=>{setPhase("history");setSelectedRecord(null);}} style={{display:"flex",alignItems:"center",gap:5}}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="2" width="10" height="8" rx="1"/><path d="M1 5h10M4 2V1M8 2V1"/></svg>
                  Historial
                </button>
                {phase==="history"&&<button className="btn-new" onClick={reset}>+ Nueva reunión</button>}

              </>
            )}
          </div>
        </header>

        {/* SETUP */}
        {phase==="setup"&&(
          <div className="setup">
            <div className="setup-card">
              <div className="setup-top">
                <div className="setup-title">Prepara tu reunión</div>
                <div className="setup-sub">Cuanto más contexto, mejores serán las sugerencias de la IA</div>
              </div>
              <div className="setup-body">
                <div className="field"><label>Tu nombre</label><input placeholder="Ej: Yuliana" value={myName} onChange={e=>setMyName(e.target.value)}/></div>
                <div className="setup-divider"/>
                <div className="field">
                  <label>Participantes — nombre y rol</label>
                  <div className="part-list">
                    {participants.map((p,i)=>(
                      <div className="part-row" key={i}>
                        <input className="part-name" placeholder="Nombre" value={p.name} onChange={e=>setParticipants(ps=>ps.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
                        <input className="part-role" placeholder="Rol (dueño del negocio...)" value={p.role} onChange={e=>setParticipants(ps=>ps.map((x,j)=>j===i?{...x,role:e.target.value}:x))}/>
                        {participants.length>1&&<button className="part-del" onClick={()=>setParticipants(ps=>ps.filter((_,j)=>j!==i))}>×</button>}
                      </div>
                    ))}
                  </div>
                  <button className="btn-add-part" onClick={()=>setParticipants(ps=>[...ps,{name:"",role:""}])}>+ Agregar participante</button>
                </div>
                <div className="setup-divider"/>
                <div className="field">
                  <label>Estilo de reunión</label>
                  <div className="pill-group">
                    {[
                      {key:"formal",label:"Formal",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6.5 2v4M4 2l2.5 4 2.5-4"/><rect x="2" y="6" width="9" height="5" rx="1"/></svg>},
                      {key:"semi-formal",label:"Semi-formal",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="2" y="3" width="9" height="7" rx="1"/><path d="M2 6h9M5 3V2M8 3V2"/></svg>},
                      {key:"informal",label:"Informal",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h9v6H8l-1.5 2L5 9H2z"/></svg>},
                      {key:"negotiation",label:"Negociación",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 8.5c1-1 2.5-1 3.5 0s2.5 1 3.5 0M4 5.5l1.5 1.5L7 5M2 4h9"/></svg>},
                      {key:"demo",label:"Demo / Pitch",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="2" width="11" height="7" rx="1"/><path d="M6.5 9v2M4 11h5M5 5.5l1.5 1.5 2.5-2.5"/></svg>},
                      {key:"followup",label:"Follow-up",icon:<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6.5" cy="7" r="4"/><path d="M6.5 5v2.5l1.5 1M4 2h5M6.5 2v2"/></svg>},
                    ].map(s=>(
                      <button key={s.key} className={`pill ${meetingStyle===s.key?"active":""}`} onClick={()=>setMeetingStyle(s.key)} style={{display:"flex",alignItems:"center",gap:5}}>{s.icon}{s.label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>¿Quién solicitó esta reunión?</label>
                  <div className="pill-group">
                    <button className={`pill ${requestedBy==="me"?"active":""}`} onClick={()=>setRequestedBy("me")} style={{display:"flex",alignItems:"center",gap:5}}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6.5" cy="4" r="2.5"/><path d="M2 11.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/></svg>
                      {myName||"Yo"}
                    </button>
                    {participants.filter(p=>p.name.trim()).map((p,i)=>(
                      <button key={i} className={`pill ${requestedBy===p.name?"active":""}`} onClick={()=>setRequestedBy(p.name)} style={{display:"flex",alignItems:"center",gap:5}}>
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6.5" cy="4" r="2.5"/><path d="M2 11.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/></svg>
                        {p.name}
                      </button>
                    ))}
                    <button className={`pill ${requestedBy==="everyone"?"active":""}`} onClick={()=>setRequestedBy("everyone")} style={{display:"flex",alignItems:"center",gap:5}}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="4.5" cy="4" r="2"/><path d="M1 11c0-2 1.5-3 3.5-3"/><circle cx="9" cy="4" r="2"/><path d="M6 11c0-2 1.5-3 3-3s3 1 3 3"/></svg>
                      Todos
                    </button>
                  </div>
                </div>
                <div className="setup-divider"/>
                <div className="field"><label>Contexto y objetivo</label><textarea placeholder="Ej: Demo con cliente para presentar propuesta. Quiero cerrar el proyecto..." value={context} onChange={e=>setContext(e.target.value)}/></div>

                {/* English level */}
                <div className="field">
                  <label>Tu nivel de inglés</label>
                  <div className="pill-group">
                    {[
                      {key:"basic",       label:"Básico",       desc:"Frases muy cortas y simples"},
                      {key:"intermediate",label:"Intermedio",   desc:"Claro y directo"},
                      {key:"advanced",    label:"Avanzado",     desc:"Vocabulario profesional"},
                      {key:"native",      label:"Fluido",       desc:"Expresiones naturales"},
                    ].map(l=>(
                      <button key={l.key} className={`pill ${englishLevel===l.key?"active":""}`} onClick={()=>setEnglishLevel(l.key)} title={l.desc}>{l.label}</button>
                    ))}
                  </div>
                </div>

                {/* Continue from previous */}
                <div className="field">
                  <label>¿Continuar reunión anterior?</label>
                  {continueFrom ? (
                    <div className="continue-banner">
                      <div className="continue-text">
                        <strong>{continueFrom.name}</strong>
                        {continueFrom.summary?.pending_topics?.length>0 && `Pendientes: ${continueFrom.summary.pending_topics.join(", ")}`}
                      </div>
                      <button className="btn-continue-clear" onClick={()=>setContinueFrom(null)}>×</button>
                    </div>
                  ) : (
                    <button className="btn-add-part" onClick={()=>setShowContinuePicker(true)} disabled={history.length===0} style={{opacity:history.length===0?0.4:1}}>
                      {history.length===0 ? "No hay reuniones guardadas aún" : "Seleccionar reunión anterior →"}
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>Agenda — puntos a tratar</label>
                  {agenda.length>0&&<div className="ag-list">{agenda.map((a,i)=><div className="ag-item" key={i}><span className="ag-num">{String(i+1).padStart(2,"0")}</span>{a}<button className="ag-del" onClick={()=>setAgenda(p=>p.filter((_,j)=>j!==i))}>×</button></div>)}</div>}
                  <div className="add-row">
                    <input placeholder="Agregar punto..." value={agInput} onChange={e=>setAgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addAgenda()}/>
                    <button className="btn-add" onClick={addAgenda}>+ Agregar</button>
                  </div>
                </div>
                <button className="btn-start" onClick={()=>setPhase("meeting")} disabled={!context.trim()&&agenda.length===0}>
                  iniciar reunión
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MEETING */}
        {phase==="meeting"&&(
          <div className="meeting">
            <div className="test-bar">
              <label>⚠ PRUEBA</label>
              <select className="spk-select" value={simSpeaker} onChange={e=>setSimSpeaker(Number(e.target.value))}>
                {participants.filter(p=>p.name.trim()).length>0
                  ?participants.filter(p=>p.name.trim()).map((p,i)=><option key={i} value={participants.indexOf(p)}>{p.name}</option>)
                  :<option value={0}>Participante</option>}
              </select>
              <input placeholder="Escribe lo que diría en inglés..." value={testInput} onChange={e=>setTestInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&simulate()}/>
              <button className="btn-sim" onClick={simulate} disabled={loadingSim||!testInput.trim()}>{loadingSim?"...":"Simular →"}</button>
            </div>

            <div className="chat-panel">
              <div className="chat-topbar">
                <span className="chat-title">Conversación</span>
                <div className="chat-actions">
                  {isListening && (
                    <button className="btn-stop-listen" onClick={toggleListen} title="Cortar escucha ahora">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" stroke="none"><rect x="1" y="1" width="8" height="8" rx="1.5"/></svg>
                      Detener escucha
                    </button>
                  )}
                  <button className={`btn-listen ${isListening?"on":""}`} onClick={toggleListen}>
                    {isListening ? (
                      <>
                        <div className="listen-dot"/>
                        Escuchando...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="1" width="4" height="6" rx="2"/><path d="M2 6c0 2.2 1.8 4 4 4s4-1.8 4-4"/><path d="M6 10v1.5"/></svg>
                        Escuchar
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="chat-msgs">
                {chat.length===0&&!isListening&&!loadingTx&&(
                  <div className="chat-empty">
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h28v18H22l-4 5-4-5H4z"/><path d="M10 15h16M10 20h10"/></svg>
                    <div>La conversación aparecerá aquí</div>
                    <div style={{fontSize:11}}>Usa el simulador o activa el micrófono</div>
                  </div>
                )}
                {chat.map(msg=>{
                  const pIdx=participants.findIndex(p=>p.name===msg.speakerName);
                  const cc=msg.speaker==="them"?`spk-${Math.max(0,pIdx)%4}`:"";
                  return(
                    <div className={`msg-row ${msg.speaker}`} key={msg.id}>
                      <div className={`msg-who ${cc}`}>{msg.speaker==="them"?msg.speakerName||"Ellos":myName||"Tú"}</div>
                      <div className="bubble"><div className="b-en">{msg.en}</div><div className="b-es">{msg.es}</div></div>
                      <div className="msg-time">{msg.time}</div>
                    </div>
                  );
                })}
                {isListening&&interim&&<div className="interim-bub">{interim}</div>}
                {isListening&&!interim&&<div className="wave-row"><div className="wave"><span/><span/><span/><span/><span/></div>escuchando...</div>}
                {loadingTx&&<div className="txl"><span className="dots"><span/><span/><span/></span>traduciendo...</div>}
                <div ref={chatBottom}/>
              </div>
            </div>

            <div className="right-panel">
              <div className="meeting-meta">
                <span className="meta-chip">{{formal:"Formal","semi-formal":"Semi-formal",informal:"Informal",negotiation:"Negociación",demo:"Demo",followup:"Follow-up"}[meetingStyle]}</span>
                <span className="meta-chip">{{basic:"Básico",intermediate:"Intermedio",advanced:"Avanzado",native:"Fluido"}[englishLevel]}</span>
                <span className="meta-chip">{requestedBy==="me"?(myName||"Yo"):requestedBy==="everyone"?"Todos":requestedBy} solicitó</span>
                {continueFrom&&<span className="meta-chip" style={{color:"#1d4ed8",borderColor:"rgba(37,99,235,0.3)"}}>↩ {continueFrom.name}</span>}
                {participants.filter(p=>p.name.trim()).map((p,i)=><span className={`meta-chip spk-${i%4}`} key={i}>{p.name}</span>)}
              </div>

              {/* AGENDA — arriba, siempre visible, sin scroll */}
              <div className="ag-section">
                <div className="sec-header" style={{padding:"8px 13px"}}>
                  <span className="sec-title">Agenda</span>
                  {agenda.length>0&&(
                    <div className="ag-progress-label" style={{fontSize:10}}>
                      <span style={{color:"var(--pulpe-deep)",fontWeight:600}}>{agDone.length}</span>/{agenda.length}
                    </div>
                  )}
                </div>
                {/* Contexto truncado — máx 2 líneas */}
                {context && (
                  <div className="ctx-note" title={context}>{context}</div>
                )}
                {/* Barra de progreso fina */}
                {agenda.length>0&&(
                  <div style={{padding:"0 12px 0",flexShrink:0}}>
                    <div className="ag-progress-bar" style={{margin:0}}>
                      <div className="ag-progress-fill" style={{width:`${agenda.length?(agDone.length/agenda.length)*100:0}%`}}/>
                    </div>
                  </div>
                )}
                {/* Items de agenda — todos visibles sin scroll */}
                <div className="ag-scroll">
                  {agenda.length===0&&<div className="ag-empty">Sin agenda definida</div>}
                  {agenda.map((a,i)=>{
                    const isDone = agDone.includes(i);
                    const isCurrent = !isDone && agDone.length === i;
                    return (
                      <div className={`ag-check ${isDone?"done":""} ${isCurrent?"current":""}`} key={i}
                        onClick={()=>setAgDone(p=>p.includes(i)?p.filter(x=>x!==i):[...p,i])}
                        title={a}
                      >
                        <div className="ag-box" style={{flexShrink:0}}>{isDone?"✓":isCurrent?"→":""}</div>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SUGERENCIAS — toma el espacio restante */}
              <div className="sug-section">
                <div className="sec-header">
                  <span className="sec-title">Sugerencias</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button className={`btn-auto ${autoSug?"auto-on":"auto-off"}`} onClick={()=>{setAutoSug(v=>!v);setAutoCountdown(false);clearTimeout(debounceRef.current);}}>
                      {autoSug?"⚡ Auto ON":"⚡ Auto"}
                    </button>
                    <button className="btn-gen" onClick={generateSuggestions} disabled={loadingSug}>
                      {loadingSug?<span className="dots"><span/><span/><span/></span>:"✦ Generar"}
                    </button>
                  </div>
                </div>
                {autoCountdown&&!loadingSug&&<div className="auto-countdown"><span className="dots"><span/><span/><span/></span>preparando sugerencias...</div>}
                <div className="sug-list">
                  {suggestions.length===0&&!loadingSug&&keywords.length===0&&(
                    <div className="sug-empty">
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="14" cy="14" r="11"/><path d="M10 11c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.5-.8 2.8-2 3.5V17"/><circle cx="14" cy="21" r="1" fill="currentColor"/></svg>
                      <div>Presiona Generar para recibir sugerencias</div>
                    </div>
                  )}
                  {loadingSug&&<div className="sug-empty"><span className="dots"><span/><span/><span/></span><div style={{marginTop:6}}>Analizando...</div></div>}
                  {suggestions.map((s,i)=>(
                    <div className={`sug-card ${s.type||"reactive"}`} key={i} onClick={()=>useSuggestion(s)}>
                      <div className={`sug-lbl ${s.type||"reactive"}`}>
                        <span>{s.type==="opening"?"👋 " : s.type==="smalltalk"?"💬 " : ""}{s.label}</span>
                        <span className="sug-use">↗ usar</span>
                      </div>
                      <div className="sug-en">"{s.en}"</div>
                      <div className="sug-es">{s.es}</div>
                    </div>
                  ))}
                </div>
                {/* Keywords */}
                <div className="kw-section">
                  <div className="kw-custom-row">
                    <input
                      className="kw-custom-input"
                      placeholder="Buscar tema específico..."
                      value={customKw}
                      onChange={e => setCustomKw(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && customKw.trim()) {
                          generateFromKeyword(customKw.trim());
                          setCustomKw("");
                        }
                      }}
                    />
                    <button
                      className="btn-kw-search"
                      disabled={!customKw.trim() || loadingSug}
                      onClick={() => { generateFromKeyword(customKw.trim()); setCustomKw(""); }}
                    >
                      Buscar
                    </button>
                  </div>
                  {loadingKw && <div className="kw-loading"><span className="dots"><span/><span/><span/></span>generando temas...</div>}
                  {!loadingKw && keywords.length > 0 && (
                    <>
                      <div className="kw-label">temas sugeridos →</div>
                      <div className="kw-chips">
                        {keywords.map((kw,i) => (
                          <button key={i} className="kw-chip" onClick={()=>generateFromKeyword(kw)}>{kw}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Terminar reunión */}
              <div className="end-meeting-bar">
                <button className="btn-end" onClick={() => setShowEndConfirm(true)}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="1" y="1" width="11" height="11" rx="2"/>
                    <path d="M4 4l5 5M9 4l-5 5"/>
                  </svg>
                  Terminar reunión
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {phase==="history"&&(
          <div className="history">
            <div className="history-list">
              <div className="history-list-header">Reuniones guardadas</div>
              <div className="history-list-body">
                {history.length===0&&<div className="history-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="4" y="5" width="24" height="22" rx="2"/><path d="M4 12h24M10 5V3M22 5V3M10 18h5M10 23h8"/></svg>No hay reuniones aún</div>}
                {history.map(r=>(
                  <div key={r.id} className={`history-item ${selectedRecord?.id===r.id?"selected":""}`} onClick={()=>{setSelectedRecord({...r,isFresh:false});setDetailTab("summary");}}>
                    <div className="hi-date">{r.date} · {r.time}</div>
                    <div className="hi-name">{r.name}</div>
                    <div className="hi-meta">{r.participants?.map(p=>p.name).join(", ")||"Sin participantes"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="history-detail">
              {!selectedRecord?<div className="history-detail-empty">← Selecciona una reunión</div>:(
                <>
                  <div className="hd-header">
                    <div style={{flex:1}}>
                      <input className="hi-name-edit" value={selectedRecord.name} onChange={e=>{const u={...selectedRecord,name:e.target.value};setSelectedRecord(u);setHistory(p=>p.map(r=>r.id===u.id?u:r));storage.set(u.id,JSON.stringify(u));}}/>
                      <div className="hd-date">{selectedRecord.date} · {selectedRecord.time} · {selectedRecord.meetingStyle}</div>
                    </div>
                    <button className="btn-new" style={{color:"var(--listen)",borderColor:"var(--listen)"}} onClick={()=>{storage.delete(selectedRecord.id);setHistory(p=>p.filter(r=>r.id!==selectedRecord.id));setSelectedRecord(null);}}>Eliminar</button>
                  </div>
                  <div className="hd-tabs">
                    <button className={`hd-tab ${detailTab==="summary"?"active":""}`} onClick={()=>setDetailTab("summary")}>Resumen</button>
                    <button className={`hd-tab ${detailTab==="chat"?"active":""}`} onClick={()=>setDetailTab("chat")}>Conversación</button>
                  </div>
                  <div className="hd-body">
                    {detailTab==="summary" && (
                      loadingSummary && selectedRecord.isFresh
                        ? <div style={{display:"flex",alignItems:"center",gap:10,padding:30,color:"var(--soft)",fontSize:13}}><span className="dots"><span/><span/><span/></span> Generando resumen...</div>
                        : <>
                            <SummaryBody s={selectedRecord.summary} fresh={selectedRecord.isFresh}/>
                            {selectedRecord.summary && !loadingSummary && (
                              <div style={{marginTop:8}}>
                                <button className="btn-copy-summary" onClick={()=>{
                                  const s = selectedRecord.summary;
                                  const fmt = (a) => typeof a==="string" ? a : (a.es && a.es !== a.en ? a.en + " / " + a.es : a.en);
                                  const items = (arr) => Array.isArray(arr) ? arr.map(fmt).join("\n• ") : "";
                                  const parts = [
                                    "RESUMEN — " + selectedRecord.name,
                                    "\n" + (s.summary_en || s.summary || ""),
                                    s.summary_es ? "\n" + s.summary_es : "",
                                    items(s.agreements) ? "\n\nAcuerdos:\n• " + items(s.agreements) : "",
                                    items(s.next_actions) ? "\n\nPróximos pasos:\n• " + items(s.next_actions) : "",
                                    items(s.pending_topics) ? "\n\nPendientes:\n• " + items(s.pending_topics) : "",
                                  ];
                                  navigator.clipboard.writeText(parts.filter(Boolean).join("")); setToast(true); setTimeout(()=>setToast(false),1800);
                                }}>Copiar resumen</button>
                              </div>
                            )}
                          </>
                    )}
                    {detailTab==="chat"&&(
                      !selectedRecord.chat?.length
                        ?<div style={{color:"var(--soft)",fontSize:13}}>Sin mensajes.</div>
                        :selectedRecord.chat.map((msg,i)=>{
                          const pIdx=selectedRecord.participants?.findIndex(p=>p.name===msg.speakerName)??-1;
                          const cc=msg.speaker==="them"?`spk-${Math.max(0,pIdx)%4}`:"";
                          return(<div className={`msg-row ${msg.speaker}`} key={i}><div className={`msg-who ${cc}`}>{msg.speaker==="them"?msg.speakerName||"Ellos":"Yo"}</div><div className="bubble"><div className="b-en">{msg.en}</div><div className="b-es">{msg.es}</div></div><div className="msg-time">{msg.time}</div></div>);
                        })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast&&<div className="toast">✓ Copiado al portapapeles</div>}

        {/* END MEETING CONFIRMATION + FEEDBACK */}
        {showEndConfirm && (
          <div className="confirm-overlay" onClick={e=>e.target===e.currentTarget&&setShowEndConfirm(false)}>
            <div className="confirm-modal">
              <div className="confirm-header">
                <div className="confirm-title">¿Terminar la reunión?</div>
                <div className="confirm-sub">Se generará el resumen automáticamente con los acuerdos y próximos pasos.</div>
              </div>
              <div className="confirm-body">
                <div className="confirm-actions">
                  <button className="btn-confirm-no" onClick={()=>setShowEndConfirm(false)}>
                    Continuar reunión
                  </button>
                  <button className="btn-confirm-yes" onClick={()=>{ setShowEndConfirm(false); endMeeting(); }}>
                    Sí, terminar
                  </button>
                </div>
              </div>

              {/* Feedback section */}
              <div className="feedback-section">
                <div className="feedback-title">¿Te fue útil MeetFluent en esta reunión?</div>
                {feedbackSent ? (
                  <>
                    <div className="feedback-thanks">¡Gracias por tu feedback! 🙏</div>
                    <div className="feedback-thanks-sub">Nos ayuda mucho a mejorar</div>
                  </>
                ) : (
                  <>
                    <div className="vote-row">
                      {/* Thumbs Up — estilo minimalista con trazo */}
                      <button
                        className={`vote-btn up ${feedbackRating==="up"?"selected-up":""}`}
                        onClick={()=>setFeedbackRating("up")}
                      >
                        <svg className="vote-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 14 L14 4 C14 4 17 4 17 8 L17 12 L24 12 C25.1 12 26 12.9 26 14 L24 22 C23.6 23.2 22.5 24 21.3 24 L10 24"/>
                          <rect x="6" y="13" width="4" height="11" rx="1"/>
                        </svg>
                        Fue útil
                      </button>
                      {/* Thumbs Down */}
                      <button
                        className={`vote-btn down ${feedbackRating==="down"?"selected-down":""}`}
                        onClick={()=>setFeedbackRating("down")}
                      >
                        <svg className="vote-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 18 L14 28 C14 28 17 28 17 24 L17 20 L24 20 C25.1 20 26 19.1 26 18 L24 10 C23.6 8.8 22.5 8 21.3 8 L10 8"/>
                          <rect x="6" y="8" width="4" height="11" rx="1"/>
                        </svg>
                        Mejorable
                      </button>
                    </div>
                    {feedbackRating && (
                      <>
                        <textarea
                          className="feedback-textarea"
                          placeholder={feedbackRating==="up" ? "¿Qué fue lo mejor? (opcional)" : "¿Qué mejorarías? (opcional)"}
                          value={feedbackText}
                          onChange={e=>setFeedbackText(e.target.value)}
                        />
                        <button className="btn-send-feedback" onClick={async ()=>{
                          await saveFeedback(feedbackRating, feedbackText, context);
                          setFeedbackSent(true);
                          setFeedbackRating(0); setFeedbackText("");
                          setTimeout(()=>setFeedbackSent(false), 3000);
                        }}>
                          Enviar
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* API KEY OVERLAY (modo local — solo si no hay proxy disponible) */}
        {needsApiKey && (
          <div className="apikey-overlay">
            <div className="apikey-modal">
              <div className="apikey-title">Configura tu API Key</div>
              <div className="apikey-sub">Estás corriendo MeetFluent localmente. Necesitas una API key de Anthropic para que la IA funcione. Solo se pide una vez.</div>
              <div className="apikey-steps">
                1. Ve a <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a><br/>
                2. Crea una API key<br/>
                3. Pégala abajo
              </div>
              <div className="apikey-input-row">
                <input
                  className="apikey-input"
                  type="password"
                  placeholder="sk-ant-api03-..."
                  value={apiKeyInput}
                  onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(""); }}
                  onKeyDown={e => e.key==="Enter" && validateKey()}
                />
                <button className="apikey-save" onClick={validateKey} disabled={!apiKeyInput.trim()||validatingKey}>
                  {validatingKey ? "..." : "Guardar"}
                </button>
              </div>
              {apiKeyError && <div className="apikey-error">{apiKeyError}</div>}
              <div className="apikey-note">La key se guarda solo en tu navegador (localStorage). Nadie más tiene acceso.</div>
            </div>
          </div>
        )}

        {/* CONTINUE PICKER */}
        {showContinuePicker&&(
          <div className="picker-overlay" onClick={e=>e.target===e.currentTarget&&setShowContinuePicker(false)}>
            <div className="picker-modal">
              <div className="picker-header">
                <span className="picker-title">Selecciona la reunión anterior</span>
                <button className="modal-close" onClick={()=>setShowContinuePicker(false)}>×</button>
              </div>
              <div className="picker-body">
                {history.map(r=>(
                  <div key={r.id} className="picker-item" onClick={()=>{
                    setContinueFrom(r);
                    setShowContinuePicker(false);
                    // Auto-fill setup fields from previous meeting
                    if (r.context) setContext(r.context + "\n[Continuación de reunión del " + r.date + "]");
                    if (r.participants?.length) setParticipants(r.participants.length ? r.participants : [{name:"",role:""}]);
                    if (r.meetingStyle) setMeetingStyle(r.meetingStyle);
                    // Carry over pending agenda items from previous
                    const pending = (r.summary?.pending_topics||[]).map(t=>typeof t==="string"?t:(t.es||t.en));
                    if (pending.length) setAgenda(pending);
                    setRequestedBy(r.participants?.[0]?.name || "me");
                  }}>
                    <div className="picker-date">{r.date} · {r.time}</div>
                    <div className="picker-name">{r.name}</div>
                    <div className="picker-meta">
                      {r.participants?.map(p=>p.name).join(", ")||"Sin participantes"}
                      {r.summary?.pending_topics?.length>0&&` · ${r.summary.pending_topics.length} pendiente(s)`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
