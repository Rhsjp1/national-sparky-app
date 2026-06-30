#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-.}"
OUT_DIR="${TARGET}/out"
mkdir -p "$OUT_DIR"
echo "PDF ingest not implemented here. Connect LayoutLMv3 extractor and MCP cube."
echo "Output dir: $OUT_DIR"
