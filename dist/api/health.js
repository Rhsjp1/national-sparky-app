export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  let openRouter = { set: !!apiKey, valid: false };

  if (apiKey) {
    try {
      const probe = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'https://national-sparky-app.vercel.app',
          'X-Title': 'SparkySolve Health'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 1
        })
      });

      openRouter.status = probe.status;
      if (probe.ok) openRouter.valid = true;
    } catch (e) {
      openRouter.error = e.message;
    }
  }

  res.status(200).json({
    ok: true,
    app: 'national-sparky-app',
    routes: ['/api/analyze', '/api/diagnose', '/api/create-checkout', '/api/stripe-webhook'],
    env: {
      hasOpenRouter: !!apiKey,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasStripe: !!process.env.STRIPE_SECRET_KEY,
      hasStripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET
    },
    openRouter
  });
}
