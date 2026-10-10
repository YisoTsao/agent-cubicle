#!/bin/sh
# Renders the duck in photo-matched mode and diffs its silhouette against mojojojo-y.webp.
# usage: tools/preview/compare-duck.sh <workdir>   (needs `pnpm build`)
set -e
W=${1:?workdir}; mkdir -p "$W"
cd "$(dirname "$0")/../.."
pnpm exec tsx tools/preview/capture.ts "$W" 600x663 duck,photo=1,bg=ff00ff,posture=rest
convert "$W/duck_photo_1_bg_ff00ff_posture_rest.png" -crop 600x663+20+0 +repage "$W/mine.png"
BG=$(convert "$W/mine.png" -format '%[pixel:p{5,5}]' info:)
convert "$W/mine.png" -fuzz 14% -fill white -opaque "$BG" -colorspace Gray -threshold 93% -compress none "$W/mine.pgm"
convert mojojojo-y.webp -background white -alpha remove -colorspace Gray -threshold 93% -compress none "$W/ref.pgm"
pnpm exec tsx tools/preview/diff.ts "$W/ref.pgm" "$W/mine.pgm" "${2:-12}"
convert "$W/ref.pgm" -negate -edge 1 -fill red -opaque white -transparent black "$W/edge.png" 2>/dev/null || true
