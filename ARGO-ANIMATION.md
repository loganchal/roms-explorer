# Argo display animation

The Argo stage lazily loads `data/argo-extension.json`: parallel `floats` and
`models` arrays containing 2,932 observed profiles from 214 floats and their
daily model matchups, covering all 54 months of the extension. The
timeline follows the model extension, 1 January 2021–30 June 2025 (UTC). The
embedded 136 profiles from 46 floats in January 2025 remain a fallback if the
extension file cannot load; that fallback retains its actual January dates.
The display shows floats active in the displayed period, with one moving marker
and one depth comparison curtain per float. All active curtains descend simultaneously on entering
the Argo stage. Their depths follow each source profile's measured pressure
range, morphing between observations. Each curtain is clipped at the shallower
of its measured endpoint and the rendered local seabed, without stretching
shallower values down to the bottom.

`data/argo-trajectories.json` supplies the QC-approved recorded position history for the
same WMOs. Positions use exactly the land/grid longitude/latitude transform:
no scaling, amplification, clamping or invented drift. Shape-preserving cubic
Hermite interpolation joins consecutive recorded fixes, using shared time-based
tangents for smooth turns and exact positions at recorded times. Each coordinate
remains bounded by its adjacent fixes. Dense terrain checks damp shared tangents
near coasts; zero-tangent straight legs provide a smooth stop/turn when needed.
Gaps over 30 days and legs crossing rendered land
are broken and hidden. Multi-fix floats appear only within actual coverage;
single-fix floats have a five-day display window either side. Positions outside
the rendered wet model footprint are hidden. Trails reset across gaps.

Depth evaluations are resampled to 100 relative
profile levels within each observation’s own measured pressure range and interpolated between observations. Measured profile panels
retain actual observed records and dates; an open panel advances to the next
observed record for its selected float. Surface markers and full depth curtains
move together using the recorded position history, independently of the more sparsely
sampled evaluation records. The timeline starts with active floats visible, with no staggered
appearance. Reduced motion uses the settled view and manual playback.

The seabed cap uses barycentric interpolation of the actual rendered terrain
triangles. Exact segment/triangle intersections find the shallowest seabed
along both complete crossing ribbon edges, including ridges between their
endpoints. Ribbons narrow near the coast until their whole footprint is wet.
Clipped segments retain the original depth coordinates above the cap, with
values interpolated only at the cut. Original observation/model arrays and
selected-record charts remain unchanged.

Playback spans 45 seconds and remains in the dedicated Argo stage. Marker
heads are small ivory beads with a fine sea-glass ring. Trails use 64 smoothly
interpolated points over the preceding 12% of the trajectory (at most 45 days), with a quiet
teal-to-pale-green colour fade rather than full-length angular tracks. The
date label and play label change only when their values change, avoiding
per-frame DOM churn in language mode.

Only one marker, depth curtain, and trail are allocated per WMO, regardless of
the observation count. Trajectory lookup uses binary search. On lazy dataset
installation the scene's fade-material registry is refreshed, and panels show
each selected record's actual date rather than assuming a single source month.
The extension preloads when the mounted model becomes idle. Direct Argo entry
waits for that request to finish before revealing and dropping all profiles
together; the January fallback is revealed only if the extension request fails.

River sources retain their original 47 positions and discharge-scaled marks.
Small ivory centres and fine sea-glass outlines replace saturated blue beads;
separate invisible hit spheres preserve touch/click targets. River marks remain
hidden during Run forward. Their injection-profile chart uses the same quiet
teal palette.

The model sequence is Run forward -> Argo check -> Stratification budget ->
Data explorer. The budget is embedded in that sequence, preserving the main
model scene and its state. Its values are explicitly absolute PEA/full process
tendencies, with accumulated contributions relative to 1 July (not climatological
anomalies). Obsolete fitted-harmonic tide comparisons have been removed from
the tide detail UI; the MetOcean forcing-constituent display remains.

## River coastal attachment audit (13 November)

The original scene exporter used `lon_rho[j,i]` for staggered river sources,
omitting their direction, and the viewer lifted their centres two world units
above sea level. All 47 markers therefore occupied rho centres rather than
their native wet/dry source faces. The archived `Extension_Run/logs/forcing_showcase.npz`
contains the exact matching 47 X/E indices and directions. All 47 exported
coordinates matched the corresponding rho centres exactly, and every native
u/v face separates one wet and one dry rho cell. Current 42-source input files
are a different snapshot and were not substituted.

`data/river-faces.json` records the native i/j/direction and face midpoints.
Original `RIVERS` lon/lat, transport and profiles remain unchanged. For a
u source the midpoint spans (i-1,j)/(i,j), for v it spans (i,j-1)/(i,j). These
are exactly the wet/dry crossings used by `ocean-surface.js`; there is no
nearest-shore snapping. Flat discs/rings sit at y=0.015 solely to avoid
z-fighting. Source hit spheres remain invisible and overlapping hit candidates
are ranked by distance to their projected centres.

Revalidate and reproduce the compact metadata with:

```sh
python3 tools/export_river_faces.py --metadata data/river-faces.json --scene-data scene_data.js --out /tmp/river-faces-verified.json
```

### Current live river input

The current viewer and river detail now use the selected 42-source MetOcean
input through `river-sources.js` / `data/river-sources-current.json`, at the
actual 1 January 2021 native record. The native grid is 467×397; face positions
come directly from lon_u/lat_u or lon_v/lat_v. All source rho cells are wet;
19 source faces are wet/dry and 23 are wet/wet in the actual native input.
Those 23 are retained at their real injection faces, without relocation to
a nearby shore. The original 47-source scene payload and face metadata stay
archived, but are not used by the live main, river detail, or legacy full view.
The injection profile, temperature and signed/absolute transport are read from
the same native snapshot. Source-file checksum and extraction method accompany
the compact JSON; `tools/export_current_river_sources.py` reproduces it.
