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
checksums and quantization error.

Run-forward temperature, salinity and currents use synchronized surface and
50-level side fields from the frozen `hindcast_199401_202605_v1` release.
Both update on the same frame selection; depth palettes are cached once per
field, and arrays load only when their field is selected. The surface texture
retains native outer endpoints so it meets the side faces at identical cells.
Sea level is refreshed from the same release without depth faces. Anomaly playback also uses synchronized surface and side data.
The manifest records source files, quantization errors and checksums; export
job 6421525 ran committed source d820421 on Aoraki.

## Anomaly reference

Temperature and salinity anomalies retain all 50 native sigma levels. Their
reference is the 1994-2020 monthly model climatology, linearly interpolated
between month centres on the model grid; no detrending is applied. The same
reference is used for native daily-mean upper-200 m `strat200_pea` anomalies.
PEA is a column metric: its side colour denotes the upper-200 m (or shallower
seabed) column value, rather than a depth-resolved PEA profile.

`tools/export_ocean_anomalies.py` builds twelve monthly reference arrays, then
exports the three anomalies at the explorer's existing dates. The reference
arrays stay on Weka; the website manifest retains their checksums, input
receipts, reference definition and source revision. Temperature, salinity and
PEA use fixed, zero-centred display scales shared by their surfaces and sides.

The anomaly reference used array 6421897; export job 6423006 ran source
7e09841. Outer PEA diagnostic ghost cells are padded from the nearest valid
interior display sample, consistently on the surface and side edges.
