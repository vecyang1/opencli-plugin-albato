#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${HOME}/.opencli/clis/albato"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../clis/albato" && pwd)"

mkdir -p "${TARGET_DIR}"
cp -r "${SOURCE_DIR}/"* "${TARGET_DIR}/"
echo "[OK] Installed opencli-plugin-albato adapters to ${TARGET_DIR}"
