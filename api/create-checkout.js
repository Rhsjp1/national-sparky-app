'use strict';

const Stripe                = require('stripe');
const { createClient }      = require('@supabase/supabase-js');

// ─── Tier → Stripe price mapping ─────────────────────────────────────────────
const TIERS = {
  starter:  { priceEnv: 'STRIPE_STARTER_PRICE_ID',  label: 'Starter' },
  pro:      { priceEnv: 'STRIPE_PRO_PRICE_ID',       label: 'Pro'     },
  business: { priceEnv: 'STRIPE_BUSINESS_PRICE_ID',  label: 'Business' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  (c) => chunks.push(c));
    req.on('end',   () => {
      try   { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve(null); }
    });
    req.on('error', reject);
  });

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

  const token    = authHeader.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user)
    return res.status(401).json({ error: 'Invalid or expired session' });

  // ── 2. Parse and validate body ────────────────────────────────────────────
  const body = await readBody(req);
  if (!body)
    return res.status(400).json({ error: 'Invalid JSON body' });

  const { tier } = body;
  const tierConfig = TIERS[tier];
  if (!tierConfig)
    return res.status(400).json({
      error: `Invalid tier. Must be one of: ${Object.keys(TIERS).join(', ')}`
    });

  const priceId = process.env[tierConfig.priceEnv];
  if (!priceId)
    return res.status(500).json({
      error: `Stripe price not configured for tier "${tier}"`
    });

  // ── 3. Get or create Stripe customer ──────────────────────────────────────
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20'
  });

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id, tier')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr)
    console.error('[checkout] profile fetch error:', profileErr.message);

  // Prevent re-purchasing the same tier
  if (profile?.tier === tier)
    return res.status(400).json({
      error: `You are already on the ${tierConfig.label} plan`
    });

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        name:  user.user_metadata?.full_name || user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;

      // Persist customer id
      await supabase
        .from('user_profiles')
        .upsert(
          { id: user.id, stripe_customer_id: customerId },
          { onConflict: 'id' }
        );
    } catch (stripeErr) {
      console.error('[checkout] customer create error:', stripeErr.message);
      return res.status(502).json({ error: 'Could not create billing account' });
    }
  }

  // ── 4. Create Checkout session ─────────────────────────────────────────────
  const appUrl = process.env.APP_URL || 'https://national-sparky-app.vercel.app';

  try {
    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${appUrl}?checkout=success&tier=${tier}`,
      cancel_url:  `${appUrl}?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        tier
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier
        }
      }
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (stripeErr) {
    console.error('[checkout] session create error:', stripeErr.message);
    return res.status(502).json({ error: 'Could not create checkout session' });
  }
};
