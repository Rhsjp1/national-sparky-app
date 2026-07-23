'use strict';

const { createClient } = require('@supabase/supabase-js');

const FREE_TIER_LIMIT = 5;
const MAX_PROMPT_CHARS = 4000;
const MAX_IMAGE_B64_BYTES = 4 * 1024 * 1024;

const SPARKY_SYSTEM = `You are SparkySolve, an expert AI assistant for licensed electricians working in North Carolina.

Core competencies:
• North Carolina Electrical Code (NEC 2023 as adopted by NC Building Code Council)
• Circuit analysis, fault diagnosis, and root-cause identification
• NEC article citations — always reference the specific article and section
• Code compliance, inspection readiness, and permit documentation
• Load calculations, service sizing, panel scheduling
• GFCI/AFCI placement requirements per NEC 210.8 and 210.12
• Job-site safety protocols (OSHA 29 CFR 1910.333, NFPA 70E)

Be concise, cite code, and flag any safety-critical findings prominently.`;

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const parseJSON = (buf) => {
  try { return JSON.parse(buf.toString('utf8')); }
  catch { return null; }
};

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: 'OPENROUTER_API_KEY missing.' });

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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tier')
    .eq('id', user.id)
    .maybeSingle();

  const tier = profile?.tier || 'free';

  let currentUsage = 0;
  if (tier === 'free') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { count, error: countErr } = await supabase
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'diagnostic')
      .gte('created_at', cutoff.toISOString());

    if (countErr) {
      console.error('[diagnose] usage count error:', countErr.message);
      return res.status(500).json({ error: 'Could not verify usage. Try again.' });
    }

    currentUsage = count || 0;

    if (currentUsage >= FREE_TIER_LIMIT) {
      return res.status(402).json({
        error: 'free_tier_limit',
        message: `You have used all ${FREE_TIER_LIMIT} free diagnostics this month.`,
        used: currentUsage,
        limit: FREE_TIER_LIMIT,
        tier: 'free'
      });
    }
  }

  const raw = await readRawBody(req);
  const body = parseJSON(raw);

  if (!body)
    return res.status(400).json({ error: 'Invalid JSON body' });

  const { prompt, imageData, mimeType } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0)
    return res.status(400).json({ error: 'prompt is required' });

  if (prompt.length > MAX_PROMPT_CHARS)
    return res.status(400).json({ error: `Prompt exceeds ${MAX_PROMPT_CHARS} character limit` });

  if (imageData && imageData.length > MAX_IMAGE_B64_BYTES)
    return res.status(400).json({ error: 'Image too large — 4 MB max' });

  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY missing.' });

  const callOpenRouter = async (model) => {
    const messages = [{ role: 'system', content: SPARKY_SYSTEM }];

    if (imageData) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageData}` } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://national-sparky-app.vercel.app',
        'X-Title': 'SparkySolve'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 500
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || response.statusText;
      if (response.status === 402 || (data?.error?.code && String(data.error.code).includes('insufficient_credits'))) {
        return { ok: false, reason: 'credits_exhausted', data };
      }
      return { ok: false, reason: 'upstream_error', data};
    }

    const reply = data?.choices?.[0]?.message?.content || '';
    return { ok: true, reply };
  };

  try {
    const primaryModel = 'openai/gpt-4o-mini';
    const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-2.0-flash-exp:free';
    let result = await callOpenRouter(primaryModel);

    if (!result.ok && result.reason === 'credits_exhausted' && fallbackModel && fallbackModel !== primaryModel) {
      result = await callOpenRouter(fallbackModel);
    }

    if (!result.ok) {
      const errMsg = result.data?.error?.message || 'AI request failed';
      return res.status(502).json({ error: 'AI service unavailable: ' + errMsg });
    }

    const textOut = result.reply;
    const logPromises = [
      supabase.from('usage_events').insert({
        user_id: user.id,
        event_type: 'diagnostic',
        metadata: {
          has_image: !!imageData,
          prompt_chars: prompt.length
        }
      }),
      supabase.from('diagnostic_logs').insert({
        user_id: user.id,
        request_text: prompt.substring(0, 2000),
        response_text: textOut,
        has_image: !!imageData,
        tier_at_time: tier
      })
    ];

    Promise.all(logPromises).catch((e) => console.error('[diagnose] log error:', e.message));

    let usage = { tier };
    if (tier === 'free') {
      const newUsed = currentUsage + 1;
      usage = {
        tier: 'free',
        used: newUsed,
        limit: FREE_TIER_LIMIT,
        remaining: Math.max(0, FREE_TIER_LIMIT - newUsed)
      };
    }

    return res.status(200).json({ result: textOut, usage });
  } catch (err) {
    console.error('[diagnose] fetch failed:', err.message);
    return res.status(502).json({ error: 'Could not reach AI service' });
  }
};
