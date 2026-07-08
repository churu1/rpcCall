#!/usr/bin/env bash
# Build RpcCall.app and package it into a DMG for distribution.
# Usage: ./scripts/build-dmg.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Read version from wails.json
VERSION=$(grep -o '"productVersion": *"[^"]*"' wails.json | head -1 | sed 's/.*"productVersion": *"\([^"]*\)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "❌ 无法从 wails.json 读取 productVersion"
  exit 1
fi

APP_NAME="RpcCall"
APP_PATH="build/bin/${APP_NAME}.app"
DMG_NAME="${APP_NAME}-${VERSION}-macos.dmg"
DMG_PATH="build/bin/${DMG_NAME}"
STAGING_DIR="build/bin/dmg-staging"

echo "==> 构建 ${APP_NAME} v${VERSION}"

# 1. Wails build
echo "→ wails build"
if ! wails build 2>&1; then
  echo "❌ wails build 失败"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "❌ 构建失败：未找到 $APP_PATH"
  exit 1
fi

# 2. 准备 DMG 暂存目录
echo "→ 准备 DMG 暂存目录"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

# 3. 创建 DMG
echo "→ 生成 DMG: $DMG_NAME"
rm -f "$DMG_PATH"
hdiutil create \
  -volname "$APP_NAME $VERSION" \
  -srcfolder "$STAGING_DIR" \
  -fs HFS+ \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$DMG_PATH"

# 4. 清理暂存
rm -rf "$STAGING_DIR"

DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)
echo ""
echo "✅ 完成"
echo "   DMG: $DMG_PATH ($DMG_SIZE)"
echo "   未签名：用户首次打开需右键 → 打开，或在系统设置中允许"
