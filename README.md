# ROMS extension domain explorer

Interactive 3D view of a NZ 5 km ROMS ocean-model domain.

**Live:** https://loganchalmers.net/roms-explorer/

Static export from a private thesis codebase — no build step, open
`index.html` to run locally.

## Entrance

The guided view paints a lightweight paper entrance before downloading the scene
payload. It reveals the model only after `mountAssembly()` has initialized the
controls and completed its first render, holds it for at least 3.5 seconds, then fades it over 1.2 seconds.
Fine currents drift beside the horizon while ink and rust traces travel along it;
their repeating motion is atmospheric rather than a download-progress indicator.
Reduced-motion visitors retain the same minimum hold without animated traces. Download, module, or rendering
failures retain the entrance with retry, home, and technical-detail controls.

## Model surfaces and side panels

The guided model clips its native shoreline at wet/dry mask crossings. Playback
retains the original sampled data and interpolates its display texture instead
of drawing the coast from that coarser sampling. Scrubbing pauses playback.

Initial-state outer faces use all 50 sigma levels, physical bathymetry and the
ROMS Vtransform=2 coordinate. Compact fields load on demand, with shared surface
and wall colour ranges. `data/ocean-faces/manifest.json` records source revision,
checksums, quantization error and the initial-surface validation. Aoraki export
job 6421028 used committed source 12ce3db.

Run-forward temperature, salinity and currents use synchronized surface and
50-level side fields from the frozen `hindcast_199401_202605_v1` release.
Both update on the same frame selection; depth palettes are cached once per
field, and arrays load only when their field is selected. The surface texture
retains native outer endpoints so it meets the side faces at identical cells.
Sea level is refreshed from the same release without depth faces. Historical
surface anomaly views are retained without depth faces.
The manifest records source files, quantization errors and checksums; export
job 6421525 ran committed source d820421 on Aoraki.
