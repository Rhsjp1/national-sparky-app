'use strict';

const Stripe           = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Disable Vercel's automatic body parsing — Stripe needs the raw bytes
// to verify the webhook signature
module.exports.config = { api: { bodyParser: false } };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  (c) => chunks.push(c));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

/** Map Stripe subscription status → tier action */
const isActive = (status) =>
  ['active', 'trialing'].includes(status);

/**
 * Resolve the tier name from a Stripe subscription's price metadata
 * or fall back to the checkout session metadata.
 */
const resolveTier = (obj) =>
  obj?.metadata?.tier || null;

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function setUserTier(supabase, userId, tier, subscriptionId = null) {
  const update = { id: userId, tier };
  if (subscriptionId !== undefined) update.stripe_subscription_id = subscriptionId;

  const { error } = await supabase
    .from('user_profiles')
    .upsert(update, { onConflict: 'id' });

  if (error) console.error('[webhook] setUserTier error:', error.message);
}

async function findUserBySubscriptionId(supabase, subscriptionId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (error) console.error('[webhook] findUser error:', error.message);
  return data?.id || null;
}

async function findUserByCustomerId(supabase, customerId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) console.error('[webhook] findUserByCustomer error:', error.message);
  return data?.id || null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Read raw body ───────────────────────────────────────────────────────
  const rawBody = await readRawBody(req);
  const sig     = req.headers['stripe-signature'];

  if (!sig)
    return res.status(400).json({ error: 'Missing stripe-signature header' });

  // ── 2. Verify signature ────────────────────────────────────────────────────
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20'
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── 3. Initialise Supabase (service role — bypasses RLS) ──────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // ── 4. Route events ────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Successful checkout → activate tier ────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId  = session.metadata?.supabase_user_id;
        const tier    = resolveTier(session);

        if (!userId || !tier) {
          console.warn('[webhook] checkout.session.completed missing metadata', session.id);
          break;
        }

        await setUserTier(supabase, userId, tier, session.subscription);
        console.log(`[webhook] ✓ activated ${tier} for user ${userId}`);
        break;
      }

      // ── Subscription renewed / updated ─────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const userId = await findUserBySubscriptionId(supabase, sub.id)
                    || await findUserByCustomerId(supabase, sub.customer);

        if (!userId) {
          console.warn('[webhook] subscription.updated — no matching user for sub', sub.id);
          break;
        }

        if (isActive(sub.status)) {
          const tier = resolveTier(sub);
          if (tier) {
            await setUserTier(supabase, userId, tier, sub.id);
            console.log(`[webhook] ✓ updated subscription → ${tier} for user ${userId}`);
          }
        } else {
          // Pause / unpaid / past_due — downgrade to free
          await setUserTier(supabase, userId, 'free', null);
          console.log(`[webhook] ↓ downgraded to free (status: ${sub.status}) for user ${userId}`);
        }
        break;
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = await findUserBySubscriptionId(supabase, sub.id)
                    || await findUserByCustomerId(supabase, sub.customer);

        if (!userId) {
          console.warn('[webhook] subscription.deleted — no matching user for sub', sub.id);
          break;
        }

        await setUserTier(supabase, userId, 'free', null);
        console.log(`[webhook] ↓ downgraded to free (cancelled) for user ${userId}`);
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice  = event.data.object;
        const subId    = invoice.subscription;
        if (!subId) break;

        const userId = await findUserBySubscriptionId(supabase, subId)
                    || await findUserByCustomerId(supabase, invoice.customer);

        if (userId) {
          // Log but don't immediately downgrade — Stripe will retry.
          // Downgrade happens via subscription.updated when status → past_due/cancelled.
          console.warn(`[webhook] ⚠ payment_failed for user ${userId}, sub ${subId}`);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (handlerErr) {
    console.error('[webhook] event handler threw:', handlerErr.message, handlerErr.stack);
    // Return 200 so Stripe doesn't retry — we log internally
  }

  return res.status(200).json({ received: true, type: event.type });
};
