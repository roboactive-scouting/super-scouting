# Outdoor theme check — every closed page (task 1.38's re-check, design side) — 2026-10-09

All 60 final images of pages 01–16 were rendered with `data-theme="outdoor"` on `<html>`, using the outdoor values the app already has (`apps/client/src/styles/theme.css`, mirrored in `docs/design/theme.css`). The images are **not committed** (19 MB); this folder's PNGs are git-ignored. To regenerate them:

```bash
cd docs/design/pages && for f in */final/*.html; do d=$(dirname "$f"); b=$(basename "$f" .html); p=$(dirname "$d"); sed 's|</head>|<script>document.documentElement.dataset.theme="outdoor"</script></head>|' "$f" > "$d/$b-oc.html"; bash render.sh "$p" final "$b-oc"; mv "$d/$b-oc.png" "16-settings/outdoor-check/${p}__$b.png"; done
```

Then delete the temporary copies: `docs/design/pages/*/final/*-oc.html`.

## Result

**Nothing breaks.** In Outdoor, every page reads as black on white with a black rail:
- the accent, warning and alliance colours are darker
- every alliance tag, station tile (including the picked `--alliance-*-strong` fill), status tag, chip, switch and map field stays readable
- no layout changes

## Findings for the code (the mockups had hard-coded colours that tokens must replace)

1. **The sticky match timer** (`14-entry-parts`) draws its amber last-10-seconds countdown (`#f2c36b`) and its bar segments (`#3a414c`, `#6f7a88`) as literal colours. **[RAISED BY ME]** The code needs tokens for them, with outdoor values, because THEME.md's rule is "components never hard-code a colour".
2. **The Home coverage grid's "missing a robot" square** is the literal `#9CCBB8` in the mockup. The code already uses the `--coverage-gap` token (outdoor `#5fa88a`), so nothing to do; noted so nobody copies the literal.
3. **Shadows and scrims** (`rgba(20,24,32,…)`) are literal in every mockup. They are fine on both themes. If a future dark theme arrives, they would need tokens (THEME.md already notes the missing on-dark token).
