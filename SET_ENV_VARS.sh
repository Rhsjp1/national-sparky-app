#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Set all Vercel environment variables for national-sparky-app
# Install Vercel CLI first:  npm i -g vercel
# Run:  cd ~/national-sparky-app && vercel link  (select the existing project)
# Then: bash SET_ENV_VARS.sh
# ─────────────────────────────────────────────────────────────────────────────

echo "Setting non-secret env vars (safe to script)..."
echo "https://dqyqlgnaawqnlxvxwcys.supabase.co"  | vercel env add SUPABASE_URL production
echo "https://national-sparky-app.vercel.app"    | vercel env add APP_URL production

echo ""
echo "You must enter the following manually (vercel env add will prompt you):"
echo ""
echo "  vercel env add GEMINI_API_KEY           production"
echo "    → New Google AI Studio key (rotated from Cloud Console)"
echo ""
echo "  vercel env add SUPABASE_ANON_KEY        production"
echo "    → Supabase Dashboard → Project Settings → API → anon/public key"
echo "    → Also paste this into index.html line: const SUPABASE_ANON_KEY = '...'"
echo ""
echo "  vercel env add SUPABASE_SERVICE_ROLE_KEY production"
echo "    → Supabase Dashboard → Project Settings → API → service_role key (secret)"
echo ""
echo "  vercel env add STRIPE_SECRET_KEY        production"
echo "    → Stripe Dashboard → Developers → API keys → Secret key"
echo ""
echo "  vercel env add STRIPE_WEBHOOK_SECRET    production"
echo "    → Stripe Dashboard → Webhooks → your endpoint → Signing secret"
echo "    → (Create the webhook first: https://national-sparky-app.vercel.app/api/stripe-webhook)"
echo "    → Events: checkout.session.completed, customer.subscription.updated,"
echo "               customer.subscription.deleted, invoice.payment_failed"
echo ""
echo "  vercel env add STRIPE_STARTER_PRICE_ID  production"
echo "  vercel env add STRIPE_PRO_PRICE_ID      production"
echo "  vercel env add STRIPE_BUSINESS_PRICE_ID production"
echo "    → Stripe Dashboard → Products → create 3 products → copy Price IDs (price_xxx)"
