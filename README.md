# ROMS extension domain explorer

Static export for web hosting. This is a snapshot of the `roms_explorer/`
tool from a private thesis codebase (MATLAB/ROMS ocean-model pipeline) — the
generation scripts referenced below live there, not in this repo. This repo
is just the viewer plus the packaged `scene_data.js` it needs to run
standalone.

Interactive 3D view of the NZ 5 km ROMS extension domain (January 2021, the
extension run's jump-off month — the first month past the archived
hindcast). `index.html` is the main entry: bathymetry first, then a
pull-apart animation separates every forcing layer (boundary/climatology,
nudging, tides, rivers, meteo, Argo floats) into its own visual stratum.
Click any layer or object for a compact provenance card — a colour-coded
badge (original / rebuilt / reconstructed) plus a
one-line note and source file, not an essay. The badge taxonomy is the point:
it's a visual audit of which pieces of the forcing are real external data
reprocessed onto this grid, which are literal originals, and which
had to be reconstructed and validated because the original was never
published.

`full.html` is a secondary, manual-control view (radio/checkbox layer toggles
+ vertical exaggeration slider) for power-user exploration — linked from the
hint line at the bottom of the main view, not the primary experience.

## How to view

```bash
open index.html
```

No build step, no server, no dependencies beyond a browser — matches the
`explanations/` demo convention. three.js loads from CDN. Shared scene-building
code lives in `scene_core.js` (used by `full.html`) and `assembly_scene.js`
(used by `index.html`); `explorer.css` and `error_banner.js` are shared
across every page.

## Regenerating the data

`scene_data.js` is generated, not hand-edited:

```bash
# 1. Argo floats for the target month (independent of analysis/argo_buoyancy/)
.venv/bin/python ../data_tools/hindcast_extension/fetch_argo_floats.py 2021-01 \
    --out data/argo_floats_202101.json

# 2. Repackage the already-extracted forcing_showcase.npz (see
#    data_tools/hindcast_extension/extract_forcing_showcase.py) + the model
#    output showcase (data_tools/hindcast_extension/extract_model_showcase.py)
#    + the Argo file into scene_data.js
.venv/bin/python ../data_tools/hindcast_extension/build_roms_explorer_scene_data.py \
    --npz <path to forcing_showcase.npz> \
    --model model_showcase_202101.npz \
    --argo data/argo_floats_202101.json \
    --out scene_data.js
```

## Scope

This covers Phase 1+2 of `docs/hindcast_extension_plan.md`'s explorer plan
(the static domain + forcing layers) plus the first slice of Phase 3: the
guided assembly's last three steps (initial state, run forward, Argo check)
show real model input/output — an initial-condition drape with two full-depth
slices, a 31-day daily-mean surface animation, and clickable Argo profile
comparisons. A full sigma-level/time slider over the smoke-test/production
runs, and the vendored nullschool (`cambecc/earth`, MIT) particle animation
approach for that, remain a follow-up — see the plan doc.
