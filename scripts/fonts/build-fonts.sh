#!/usr/bin/env bash
# 重建中文 UI 子集（需要 pyftsubset：pip install fonttools brotli）。
#
# 用法（仓库根目录）：
#   bash scripts/fonts/build-fonts.sh
#
# 说明：
# - 拉丁字体用 Google Fonts 的 latin 子集可变 woff2（39KB，100–700）；
#   若需要重建，见 scripts/fonts/README.md 的 Google Fonts 步骤。
# - 中文用 @ibm/plex-sans-sc 1.1.0 的完整 woff2，按 ui-chars.txt 取子集。
# - 产物写入 public/fonts/，并保留 OFL 许可证。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="${CACHE:-$ROOT/.cache/fonts}"
PYFTSUBSET="${PYFTSUBSET:-pyftsubset}"

mkdir -p "$CACHE" "$ROOT/public/fonts"

SC_TGZ="$CACHE/plex-sans-sc-1.1.0.tgz"
if [ ! -f "$SC_TGZ" ]; then
  echo "downloading @ibm/plex-sans-sc@1.1.0 ..."
  curl -fL "https://registry.npmjs.org/@ibm/plex-sans-sc/-/plex-sans-sc-1.1.0.tgz" -o "$SC_TGZ"
fi
if [ ! -d "$CACHE/package/fonts" ]; then
  tar xzf "$SC_TGZ" -C "$CACHE"
fi

subset() {
  local input="$1"
  local output="$2"
  # 只保留 UI 文案用到的字形；不保留 hinting / OpenType 特性，进一步压缩体积
  "$PYFTSUBSET" "$input" \
    --text-file="$ROOT/scripts/fonts/ui-chars.txt" \
    --flavor=woff2 \
    --output-file="$ROOT/public/fonts/$output" \
    --layout-features='' \
    --no-hinting
}

subset "$CACHE/package/fonts/complete/woff2/hinted/IBMPlexSansSC-Regular.woff2" "IBMPlexSansSC-Regular.woff2"
subset "$CACHE/package/fonts/complete/woff2/hinted/IBMPlexSansSC-SemiBold.woff2" "IBMPlexSansSC-SemiBold.woff2"

cp "$CACHE/package/LICENSE.txt" "$ROOT/LICENSES/IBM-Plex-OFL.txt"
echo "fonts rebuilt in public/fonts/"
