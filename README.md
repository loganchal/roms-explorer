# ROMS extension domain explorer

Interactive 3D view of a NZ 5 km ROMS ocean-model domain (January 2021). A
pull-apart animation separates every forcing layer — open boundaries,
nudging, tides, rivers, meteo, Argo floats — into its own visual stratum.
Click a layer for a compact provenance card: a colour-coded badge (original /
rebuilt / reconstructed) marking which pieces are real external data
reprocessed onto this grid, which are literal originals, and which had to be
reconstructed because the original was never published.

**Live:** https://loganchal.github.io/roms-explorer/

`full.html` is a secondary manual-control view (layer toggles + vertical
exaggeration slider), linked from the hint line at the bottom of the main
view.

## Running locally

```bash
open index.html
```

No build step, no server — just a browser. three.js loads from CDN.

## About this repo

This is a static export of a tool from a private thesis codebase (a
MATLAB/ROMS ocean-model pipeline). It's the viewer plus the packaged
`scene_data.js` it needs to run standalone; the generation scripts live in
the private repo, not here.
