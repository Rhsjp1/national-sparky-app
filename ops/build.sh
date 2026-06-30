#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist"
cp -R "$ROOT/api" "$ROOT/dist/"
cp -R "$ROOT/assets" "$ROOT/dist/"
cp "$ROOT/index.html" "$ROOT/dist/"
cp "$ROOT/landing.html" "$ROOT/dist/"
cp "$ROOT/vercel.json" "$ROOT/dist/"
cp "$ROOT/package.json" "$ROOT/dist/"
echo "Build complete at $ROOT/dist"
