#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP="$ROOT_DIR/build/bin/RpcCall.app"
BIN="$APP/Contents/MacOS/RpcCall"

if [ ! -x "$BIN" ]; then
  echo "Production executable is missing; rebuilding..."
  wails build
fi

open "$APP"
