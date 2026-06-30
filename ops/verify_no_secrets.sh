#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
grep -RInE "(AIza|sk-|github_pat_|GOCSPX-|Bearer [A-Za-z0-9._\-]{20,})" "$ROOT" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.hermes --exclude-dir=.vercel --exclude='*.env.*' || true
echo "Secret scan complete. If output contains matches, remove before committing."
