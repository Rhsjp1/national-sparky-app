'use strict';

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const SPARKY_CHAT_SYSTEM = `You are SparkySolve, an expert AI assistant for licensed electricians working in North Carolina.

The user already received an initial diagnosis. Now they are asking follow-up questions about it.

Core competencies:
- North Carolina Electrical Code (NEC 2023 as adopted by NC Building Code Council)
- Circuit analysis, fault diagnosis, and root-cause identification
- NEC article citations — always reference the specific article and section
- Code compliance, inspection readiness, and permit documentation
- Load calculations, service sizing, panel scheduling
- GFCI/AFCI placement requirements per NEC 210.8 and 210.12
- Job-site safety protocols (OSHA 29 CFR 1910.333, NFPA 70E)

Rules:
- Reference the original diagnosis context when answering.
- Be concise but thorough — cite code articles by number.
- Flag safety-critical items prominently.
- If the user asks something unrelated to electrical work, politely redirect.`;

const MAX_CONTENT_CHARS = 4000;

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY missing.' });

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

  const raw = await readRawBody(req);
  const body = parseJSON(raw);

  if (!body)
    return res.status(400).json({ error: 'Invalid JSON body' });

  const { sessionId, message } = body;

  if (!sessionId || typeof sessionId !== 'string')
    return res.status(400).json({ error: 'sessionId is required' });

  if (!message || typeof message !== 'string' || message.trim().length === 0)
    return res.status(400).json({ error: 'message is required' });

  if (message.length > MAX_CONTENT_CHARS)
    return res.status(400).json({ error: `Message exceeds ${MAX_CONTENT_CHARS} character limit` });

  // Verify the session belongs to this user
  const { data: session, error: sessErr } = await supabase
    .from('chat_sessions')
    .select('id, user_id, diagnostic_log_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessErr || !session)
    return res.status(404).json({ error: 'Chat session not found' });

  if (session.user_id !== user.id)
    return res.status(403).json({ error: 'Access denied' });

  // Fetch all existing messages for this session (in order)
  const { data: history, error: histErr } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (histErr) {
    console.error('[sparky-chat] history fetch error:', histErr.message);
    return res.status(500).json({ error: 'Could not load chat history' });
  }

  // Insert user message
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: message.trim()
  });

  // Build messages array for AI
  const aiMessages = [
    { role: 'system', content: SPARKY_CHAT_SYSTEM }
  ];

  // Add conversation history (capped at last 20 messages for context window)
  const recentHistory = (history || []).slice(-20);
  for (const msg of recentHistory) {
    aiMessages.push({ role: msg.role, content: msg.content });
  }

  // Add current user message
  aiMessages.push({ role: 'user', content: message.trim() });

  // Call OpenRouter
  try {
    const primaryModel = process.env.OPENROUTER_MODEL || 'poolside/laguna-s-2.1:free';
    const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || null;

    const callOpenRouter = async (model) => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'https://national-sparky-app.vercel.app',
          'X-Title': 'SparkySolve Chat'
        },
        body: JSON.stringify({
          model,
          messages: aiMessages,
          temperature: 0.4,
          max_tokens: 180
        })
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg = data?.error?.message || response.statusText;
        if (response.status === 402 || (data?.error?.code && String(data.error.code).includes('insufficient_credits'))) {
          return { ok: false, reason: 'credits_exhausted', data };
        }
        return { ok: false, reason: 'upstream_error', data };
      }

      const reply = data?.choices?.[0]?.message?.content || '';
      return { ok: true, reply };
    };

    let result = await callOpenRouter(primaryModel);

    if (!result.ok && result.reason === 'credits_exhausted' && fallbackModel && fallbackModel !== primaryModel) {
      result = await callOpenRouter(fallbackModel);
    }

    let reply;
    if (!result.ok) {
      if (result.reason === 'credits_exhausted') {
        reply = 'Demo mode: OpenRouter credits exhausted. Refill to enable live AI follow-up responses.';
      } else {
        const errMsg = result.data?.error?.message || 'AI service error';
        return res.status(502).json({ error: 'AI service error: ' + errMsg });
      }
    } else {
      reply = result.reply;
    }

    // Save assistant reply
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: reply
    });

    return res.status(200).json({
      reply,
      sessionId,
      messageCount: (history || []).length + 2 // existing + user + assistant
    });
  } catch (err) {
    console.error('[sparky-chat] fetch failed:', err.message);
    return res.status(502).json({ error: 'Could not reach AI service' });
  }
};
