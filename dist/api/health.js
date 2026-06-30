export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.status(200).json({
    ok: true,
    app: 'national-sparky-app',
    routes: ['/api/analyze', '/api/diagnose', '/api/create-checkout', '/api/stripe-webhook'],
    env: {
      hasOpenRouter: !!process.env.OPENROUTER_API_KEY,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasStripe: !!process.env.STRIPE_SECRET_KEY,
      hasStripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET
    }
  });
}
