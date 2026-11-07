# FUJI EARTH DIVE KING — Asset Pack v1.0

Original, editable 2D vector game assets. Contains SVG source and transparent PNG exports. Backgrounds are opaque 768×1024; most sprites are transparent 256×256.

## Contents
- `svg/` editable vector originals
- `png/` ready-to-use PNG images
- `data/assets_list.csv` asset inventory
- `data/assets_manifest.json` paths and metadata for loading
- `demo.html` simple visual gallery (open in browser)

## Usage
Load PNG with JavaScript Image(), or inline SVG. Scale character sprites to 48–80 game pixels. Backgrounds can be scaled to cover the viewport; layer additional parallax elements in code. Transparent PNG sprites have generous padding, so use custom collision boxes rather than the whole image rectangle.

## Design notes
This is an initial coherent prototype art kit, not a full production animation atlas. State-specific character sprites are static poses, not frame-by-frame animation. UI buttons are visual assets; add HTML/Canvas hit regions separately. Audio is not included.

## Rights
Original procedurally drawn artwork prepared for FUJI EARTH DIVE KING. No third-party images or fonts bundled.
