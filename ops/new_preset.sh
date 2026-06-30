#!/usr/bin/env bash
set -euo pipefail
NAME="${1:-new_preset}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ID="$(date +%Y%m%d)_${NAME}"
DIR="$ROOT/workbooks/$ID"
mkdir -p "$DIR"
cat > "$DIR/manifest.json" <<'EOF'
{
  "schema": "workbook.v1",
  "id": "$ID",
  "title": "$NAME",
  "sections": ["spec", "instructional_sequence", "rubric", "working_room", "artifacts"]
}
EOF
echo "Created $DIR/manifest.json"
