# ROMS extension domain explorer

Interactive 3D view of a NZ 5 km ROMS ocean-model domain.

**Live:** https://loganchalmers.net/roms-explorer/

Static export from a private thesis codebase — no build step. Serve the
directory over HTTP to run locally (see below).

## Entrance

The guided view paints a lightweight paper entrance before downloading the scene
payload. It reveals the model only after `mountAssembly()` has initialized the
controls and completed its first render, then fades the entrance over 1.2 seconds.
Fine currents drift beside the horizon while ink and rust traces travel along it;
their repeating motion is atmospheric rather than a download-progress indicator.
Reduced-motion visitors get an immediate reveal. Download, module, or rendering
failures retain the entrance with retry, home, and technical-detail controls.

## Explorer interface

The guided and manual explorers share a warm paper workspace, quiet source
metadata, serif titles and restrained teal controls. The boundary, river,
weather and tide pages use the same navigation and panel treatment. Scientific
field ramps, input data, geometry and calculations remain unchanged; charts
retain dark plotting fields to preserve the original series colours.

On phones, the model sits above its controls rather than behind them. Numbered
assembly steps are native buttons with keyboard focus and a current-step label.
The manual view places its drape and overlay controls side by side. Stage size
changes update the renderer, and camera framing adapts to the available aspect
ratio while retaining orbital zoom. The loading entrance holds the complete
interface inert until the first successful model render.

For local preview, serve this directory over HTTP (for example,
`python3 -m http.server 8000`) and visit `http://localhost:8000/`.

Interface validation on 6 November 2026: Chrome desktop (1440 × 1000) and phone
(390 × 844) screenshots of all six pages, with no horizontal overflow or browser
errors. Interaction checks covered keyboard access to all ten assembly steps,
source disclosures, field and constituent changes, playback/date selection,
Argo and river profiles, manual overlays and vertical exaggeration, and the
`#parts` deep link. Reduced-motion loading, download-failure recovery, and
320-pixel/landscape manual layouts were also checked.
