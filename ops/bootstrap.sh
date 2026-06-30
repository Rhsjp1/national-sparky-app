#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/out" "$ROOT/hubs" "$ROOT/workbooks" "$ROOT/moa"
echo "Bootstrap complete at $ROOT"
