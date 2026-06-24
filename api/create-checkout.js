import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL;

const TIERS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
}
if (!stripe || !APP_URL) {
  console.error('Missing STRIPE_SECRET_KEY or APP_URL');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req, res) {
  console.log('create-checkout', { method: req.method });
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const body = await new Promise((resolve) => resolve(req.body));
  const priceId = body.priceId;
  const tier = body.tier;

  if (!priceId || !tier || !TIERS[tier] || TIERS[tier] !== priceId) {
    return res.status(400).json({ error: 'Invalid tier.' });
  }

  let customerId;
  const { data: profile } = await supabase.from('user_profiles').select('stripe_customer_id').eq('id', user.id).single();
  if (profile?.stripe_customer_id) {
    customerId = profile.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('user_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/?upgrade=success`,
    cancel_url: `${APP_URL}/?upgrade=cancel`,
    metadata: { supabase_user_id: user.id, tier },
  });

  return res.status(200).json({ url: session.url, sessionId: session.id });
}
