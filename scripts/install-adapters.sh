#!/usr/bin/env bash
# Deploy the albato adapters into OpenCLI's local override directory (~/.opencli/clis/albato).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/clis/albato"
DEST="${HOME}/.opencli/clis/albato"

for f in "$SRC"/*.js; do node --check "$f"; done

if [ -L "$DEST" ]; then
  rm "$DEST"
fi
mkdir -p "$DEST"

# Remove any symlinks inside DEST and copy real files
find "$DEST" -type l -delete 2>/dev/null || true
cp -p "$SRC"/* "$DEST/"

echo "[OK] Installed $(ls -1 "$DEST"/*.js | wc -l | tr -d ' ') adapters -> $DEST"
opencli validate albato
