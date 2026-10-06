#!/usr/bin/env bash
# Renders every concept screen to PNG with headless Chrome.
# Usage: bash render.sh [d1-pitwall ...]   (default: all)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="/c/Program Files/Google/Chrome/Application/chrome.exe"
src_win="$(cygpath -m "$here/src")"
out="$here/out"
mkdir -p "$out"
pages=("$@")
[ ${#pages[@]} -eq 0 ] && pages=(d1-pitwall d2-nightshift d3-drawing d4-softtablet)
for p in "${pages[@]}"; do
  [ -f "$here/src/$p.html" ] || continue
  for s in home entry manage; do
    h=900; [ "$s" = entry ] && h=940
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
      --window-size=1440,$h --virtual-time-budget=6000 \
      --screenshot="$(cygpath -w "$out/$p-$s.png")" "file:///$src_win/$p.html#$s" >/dev/null 2>&1
    echo "$out/$p-$s.png"
  done
done
