#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SparkySolve — National Sparky App  |  One-shot deploy script
# Run this on your Chromebook (Linux/Crostini) after downloading the zip
# ─────────────────────────────────────────────────────────────────────────────
set -e

REPO_URL="https://github.com/Rhsjp1/national-sparky-app.git"
WORK_DIR="$HOME/national-sparky-app"

echo "── Step 1: Clone or pull repo ──────────────────────────────────────────"
if [ -d "$WORK_DIR/.git" ]; then
  cd "$WORK_DIR" && git pull origin main
else
  git clone "$REPO_URL" "$WORK_DIR" && cd "$WORK_DIR"
fi

echo "── Step 2: Create directory structure ──────────────────────────────────"
mkdir -p api supabase

echo "── Step 3: Copy generated files (edit paths if needed) ─────────────────"
# Use the repo directory itself as the source
SRC="$WORK_DIR"
cp "$SRC/index.html"              ./index.html
cp "$SRC/vercel.json"             ./vercel.json
cp "$SRC/package.json"            ./package.json
cp "$SRC/api/diagnose.js"         ./api/diagnose.js
cp "$SRC/api/create-checkout.js"  ./api/create-checkout.js
cp "$SRC/api/stripe-webhook.js"   ./api/stripe-webhook.js
cp "$SRC/supabase/schema.sql"     ./supabase/schema.sql
echo "── Step 4: Commit and push ──────────────────────────────────────────────"
git add .
git commit -m "feat: add auth layer, edge functions, Stripe tiers, Supabase persistence

- Remove hardcoded Gemini API key
- Add Supabase Auth (GitHub OAuth + magic link)
- Add /api/diagnose: JWT-gated Gemini proxy with free-tier limit
- Add /api/create-checkout: Stripe Checkout session
- Add /api/stripe-webhook: tier activation on payment
- Add vercel.json security headers + CSP
- Wire all tabs to Supabase (clients, diagnostic_logs, usage_events)
- Add upgrade modal with 3-tier pricing"
git push origin main

echo ""
echo "✓ Done. Vercel will auto-deploy in ~60 seconds."
echo "  Live at: https://national-sparky-app.vercel.app"
