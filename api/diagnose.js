import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const DEFAULT_FREE_LIMIT = 5;
const DEFAULT_MODEL = 'gemini-1.5-flash';

const SYSTEM_PROMPT = `You are NC Sparky, an expert North Carolina electrical code assistant.
Focus: NEC 2020/2023, NC state amendments, residential/commercial troubleshooting.
Format: cite articles, give compliant solutions, flag exceptions for AHJ review.`;

export default async function handler(req, res) {
  console.log('diagnose request', { method: req.method });
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  const token = authHeader.replace('Bearer ', '').trim();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.log('auth failed', authError);
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('tier, id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.log('profile missing', profileError);
    return res.status(403).json({ error: 'User profile not found' });
  }

  const { row_count: usageCount } = await supabase.rpc('count_user_usage_30d', { uid: user.id });
  const usage = usageCount || 0;

  if (profile.tier === 'free' || !profile.tier) {
    if (usage >= DEFAULT_FREE_LIMIT) {
      return res.status(402).json({
        error: 'Free diagnostic limit reached. Upgrade to continue.',
        usage,
        limit: DEFAULT_FREE_LIMIT,
        upgrade_url: `/api/create-checkout`,
      });
    }
  }

  const body = req.body || {};
  const prompt = typeof body === 'string' ? body : body.prompt || '';
  const imagePart = req.query?.image === '1' && body.photo_base64
    ? [{ inline_data: { mime_type: 'image/jpeg', data: body.photo_base64 } }]
    : null;

  if (!prompt.trim() && !imagePart) {
    return res.status(400).json({ error: 'Provide a question or photo.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL, systemInstruction: SYSTEM_PROMPT });
    const parts = [prompt];
    if (imagePart) parts.unshift(...imagePart);
    const response = await model.generateContent(parts);
    const answer = response.response.text().trim();

    await supabase.from('usage_events').insert({ user_id: user.id, action: 'diagnose' });
    await supabase.from('diagnostic_logs').insert({
      user_id: user.id,
      prompt_preview: prompt.slice(0, 300),
      answer_preview: answer.slice(0, 500),
      image_provided: !!imagePart,
    });

    const refreshed = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    return res.status(200).json({
      answer,
      usage: refreshed.count || 0,
      limit: profile.tier === 'free' || !profile.tier ? DEFAULT_FREE_LIMIT : Infinity,
      tier: profile.tier,
    });
  } catch (err) {
    console.error('gemini failed', err);
    return res.status(502).json({ error: 'Analysis engine error.' });
  }
}
