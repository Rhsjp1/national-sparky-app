'use strict';

const { createClient } = require('@supabase/supabase-js');

// ─── Constants ────────────────────────────────────────────────────────────────
const FREE_TIER_LIMIT    = 5;
const MAX_PROMPT_CHARS   = 4000;
const MAX_IMAGE_B64_BYTES = 4 * 1024 * 1024; // 4 MB in base64
const GEMINI_MODEL       = 'gemini-1.5-flash-latest';
const USAGE_WINDOW_DAYS  = 30;

const SPARKY_SYSTEM = `You are SparkySolve, an expert AI assistant for licensed electricians \
working in North Carolina. Your core competencies:
• North Carolina Electrical Code (NEC 2023 as adopted by NC Building Code Council)
• Circuit analysis, fault diagnosis, and root-cause identification
• NEC article citations — always reference the specific article and section
• Code compliance, inspection readiness, and permit documentation
• Load calculations, service sizing, panel scheduling
• GFCI/AFCI placement requirements per NEC 210.8 and 210.12
• Job-site safety protocols (OSHA 29 CFR 1910.333, NFPA 70E)
Be concise, cite code, and flag any safety-critical findings prominently.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const parseJSON = (buf) => {
  try { return JSON.parse(buf.toString('utf8')); }
  catch { return null; }
};

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Validate JWT ────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user)
    return res.status(401).json({ error: 'Invalid or expired session' });

  // ── 2. Resolve tier ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = profile?.tier || 'free';

  // ── 3. Free-tier gate ──────────────────────────────────────────────────────
  let currentUsage = 0;
  if (tier === 'free') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - USAGE_WINDOW_DAYS);

    const { count, error: countErr } = await supabase
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id',    user.id)
      .eq('event_type', 'diagnostic')
      .gte('created_at', cutoff.toISOString());

    if (countErr) {
      console.error('[diagnose] usage count error:', countErr.message);
      return res.status(500).json({ error: 'Could not verify usage. Try again.' });
    }

    currentUsage = count || 0;

    if (currentUsage >= FREE_TIER_LIMIT) {
      return res.status(402).json({
        error:   'free_tier_limit',
        message: `You have used all ${FREE_TIER_LIMIT} free diagnostics this month.`,
        used:    currentUsage,
        limit:   FREE_TIER_LIMIT,
        tier:    'free'
      });
    }
  }

  // ── 4. Parse body ──────────────────────────────────────────────────────────
  const raw  = await readRawBody(req);
  const body = parseJSON(raw);

  if (!body)
    return res.status(400).json({ error: 'Invalid JSON body' });

  const { prompt, imageData, mimeType } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0)
    return res.status(400).json({ error: 'prompt is required' });

  if (prompt.length > MAX_PROMPT_CHARS)
    return res.status(400).json({
      error: `Prompt exceeds ${MAX_PROMPT_CHARS} character limit`
    });

  if (imageData && imageData.length > MAX_IMAGE_B64_BYTES)
    return res.status(400).json({ error: 'Image too large — 3 MB max' });

  // ── 5. Build Gemini request ────────────────────────────────────────────────
  const parts = [];
  if (imageData) {
    parts.push({
      inline_data: {
        mime_type: mimeType || 'image/jpeg',
        data:      imageData
      }
    });
  }
  parts.push({ text: `${SPARKY_SYSTEM}\n\n${prompt.trim()}` });

  // ── 6. Call Gemini ─────────────────────────────────────────────────────────
  let geminiResult;
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature:     0.65,
            maxOutputTokens: 2048,
            topP:            0.9
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      console.error('[diagnose] Gemini error:', geminiRes.status, errBody);
      return res.status(502).json({ error: 'AI service unavailable — try again shortly' });
    }

    const geminiData = await geminiRes.json();
    geminiResult = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!geminiResult) {
      console.error('[diagnose] Empty Gemini response:', JSON.stringify(geminiData));
      return res.status(502).json({ error: 'AI returned an empty response' });
    }
  } catch (fetchErr) {
    console.error('[diagnose] Gemini fetch failed:', fetchErr.message);
    return res.status(502).json({ error: 'Could not reach AI service' });
  }

  // ── 7. Log usage event (non-blocking) ─────────────────────────────────────
  const logPromises = [
    supabase.from('usage_events').insert({
      user_id:    user.id,
      event_type: 'diagnostic',
      metadata: {
        has_image:    !!imageData,
        prompt_chars: prompt.length
      }
    }),
    supabase.from('diagnostic_logs').insert({
      user_id:       user.id,
      request_text:  prompt.substring(0, 2000),
      response_text: geminiResult,
      has_image:     !!imageData,
      tier_at_time:  tier
    })
  ];

  // Fire-and-forget — don't block the response
  Promise.all(logPromises).catch((e) =>
    console.error('[diagnose] log error:', e.message)
  );

  // ── 8. Compute refreshed usage for free tier ───────────────────────────────
  let usage = { tier };
  if (tier === 'free') {
    const newUsed = currentUsage + 1;
    usage = {
      tier:      'free',
      used:      newUsed,
      limit:     FREE_TIER_LIMIT,
      remaining: Math.max(0, FREE_TIER_LIMIT - newUsed)
    };
  }

  return res.status(200).json({ result: geminiResult, usage });
};
