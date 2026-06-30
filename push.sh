#!/bin/bash
echo "=== Packaging Electrical OS Build ==="
git add index.html api/analyze.js vercel.json push.sh
git commit -m "Configure Production Engine Stack"
git push origin main
echo "=== Dispatched! Deploying to Vercel in ~90 seconds ==="
