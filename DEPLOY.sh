#!/bin/bash
set -e
echo "🚀 National Sparky — Deployment script"
if [ ! -d .git ]; then
  echo "Initializing git..."
  git init
  git remote remove origin 2>/dev/null || true
  git remote add origin https://github.com/Rhsjp1/national-sparky-app.git
else
  echo "Git repo exists."
  git remote set-url origin https://github.com/Rhsjp1/national-sparky-app.git || true
fi
echo "Installing deps..."
npm install
echo "Configuring Vercel project..."
vercel link -y -p national-sparky-app --yes 2>/dev/null || true
echo "Setting Vercel env vars..."
bash ./SET_ENV_VARS.sh || true
echo "Committing and pushing..."
git add -A
git commit -m "feat(sparky): add supabase auth + stripe tier gating + gemini diagnose + schema

- Supabase Auth via GitHub OAuth (setup required in dashboard)
- JWT-gated /api/diagnose with 5-free-tier, 30d usage count
- Stripe Checkout + webhook subscription flow
- SQL schema + RLS + signup trigger
- Rebuilt UI: auth gate, usage pill, dispatch/diagnose/logs/settings tabs
- Removed hardcoded keys"

git push origin main --force-with-lease || git push -u origin main
echo "✅ Push complete. Vercel will auto-deploy within ~60s."
echo "Next: set remaining secrets in Vercel dashboard → national-sparky-app → Settings → Environment Variables"
echo "Then: set Supabase > Auth > Providers > GitHub Client ID/Secret"
echo "Then: set Stripe webhook endpoint → https://national-sparky-app.vercel.app/api/stripe-webhook"
