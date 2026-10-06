#!/usr/bin/env bash
# Renders page-round mockups to PNG with headless Chrome (2000x900 canvas at 2x).
# Usage: bash render.sh 01-entry [a b c d]   — default: every .html in <page>/src
#        bash render.sh 01-entry final        — renders <page>/final/*.html
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="/c/Program Files/Google/Chrome/Application/chrome.exe"
page="$1"; shift || true
dir="src"; [ "${1:-}" = final ] && { dir="final"; shift; }
src="$here/$page/$dir"
out="$here/$page/$([ "$dir" = final ] && echo final || echo out)"
mkdir -p "$out"
names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in "$src"/*.html; do names+=("$(basename "$f" .html)"); done
fi
for n in "${names[@]}"; do
  w=2000; h=900
  case "$n" in *desktop*) w=1440; h=900;; *phone*) w=2000; h=940;; esac
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=$w,$h --virtual-time-budget=6000 \
    --screenshot="$(cygpath -w "$out/$n.png")" "file:///$(cygpath -m "$src/$n.html")" >/dev/null 2>&1
  echo "$out/$n.png"
done
