#!/bin/bash
set -e
echo "⚙️  Set required secrets into Vercel."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
which vercel >/dev/null 2>&1 || { echo "vercel CLI missing"; exit 1; }
cd "$DIR"
echo "Fetching Supabase anon key..."
SUPABASE_ANON="$(grep -Eo 'ey[A-Za-z0-9_.-]+' "$DIR/supabase/schema.sql" 2>/dev/null | head -1 || true)"

echo "Setting SUPABASE_URL..."
vercel env add SUPABASE_URL production <<< "https://dqyqlgnaawqnlxvxwcys.supabase.co" >/dev/null 2>&1 || true
echo "Setting APP_URL..."
vercel env add APP_URL production <<< "https://national-sparky-app.vercel.app" >/dev/null 2>&1 || true

echo '---'
echo 'Enter the following secrets when prompted (leave blank to skip):'
read -rp "GEMINI_API_KEY (new rotated key): " GEMINI
if [ -n "$GEMINI" ]; then vercel env add GEMINI_API_KEY production <<< "$GEMINI" >/dev/null 2>&1 || true; fi
read -rp "SUPABASE_ANON_KEY: " ANON
if [ -n "$ANON" ]; then vercel env add SUPABASE_ANON_KEY production <<< "$ANON" >/dev/null 2>&1 || true; fi
read -rp "SUPABASE_SERVICE_ROLE_KEY: " ROLE
if [ -n "$ROLE" ]; then vercel env add SUPABASE_SERVICE_ROLE_KEY production <<< "$ROLE" >/dev/null 2>&1 || true; fi
read -rp "STRIPE_SECRET_KEY: " STRIPE
if [ -n "$STRIPE" ]; then vercel env add STRIPE_SECRET_KEY production <<< "$STRIPE" >/dev/null 2>&1 || true; fi
read -rp "STRIPE_WEBHOOK_SECRET: " WHSECRET
if [ -n "$WHSECRET" ]; then vercel env add STRIPE_WEBHOOK_SECRET production <<< "$WHSECRET" >/dev/null 2>&1 || true; fi
read -rp "STRIPE_STARTER_PRICE_ID: " PID_STARTER
if [ -n "$PID_STARTER" ]; then vercel env add STRIPE_STARTER_PRICE_ID production <<< "$PID_STARTER" >/dev/null 2>&1 || true; fi
read -rp "STRIPE_PRO_PRICE_ID: " PID_PRO
if [ -n "$PID_PRO" ]; then vercel env add STRIPE_PRO_PRICE_ID production <<< "$PID_PRO" >/dev/null 2>&1 || true; fi
read -rp "STRIPE_BUSINESS_PRICE_ID: " PID_BUS
if [ -n "$PID_BUS" ]; then vercel env add STRIPE_BUSINESS_PRICE_ID production <<< "$PID_BUS" >/dev/null 2>&1 || true; fi
echo "✅ Done."
echo "Note: also paste SUPABASE_ANON_KEY into index.html → script#supabase-config"
