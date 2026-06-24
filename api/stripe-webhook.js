import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req, res) {
  console.log('webhook tick');
  const sig = req.headers['stripe-signature'];
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET missing');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let event;
  const raw = req.body;
  try {
    event = stripe.webhooks.constructEventAsync(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('webhook sig verify failed', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const tier = session.metadata?.tier;
        if (!userId || !tier) {
          console.log('missing metadata in session', session.id);
          break;
        }
        const { error } = await supabase
          .from('user_profiles')
          .update({ tier, stripe_subscription_id: session.subscription })
          .eq('id', userId);
        if (error) console.error('upgrade profile failed', error);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, tier')
          .eq('stripe_subscription_id', sub.id);
        const profile = profiles?.[0];
        if (profile && sub.status !== 'active' && sub.status !== 'trialing') {
          await supabase.from('user_profiles').update({ tier: 'free' }).eq('id', profile.id);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('stripe_subscription_id', sub.id);
        if (profiles?.[0]?.id) {
          await supabase.from('user_profiles').update({ tier: 'free', stripe_subscription_id: null }).eq('id', profiles[0].id);
        }
        break;
      }
      case 'invoice.payment_failed': {
        console.log('payment failed', event.data.object.id);
        break;
      }
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('webhook handler failed', err);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
}
