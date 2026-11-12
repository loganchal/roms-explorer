# Argo display animation

The Argo stage lazily loads `data/argo-extension.json`: parallel `floats` and
`models` arrays containing original observed records and model matchups. The
timeline follows the model extension, 1 January 2021–30 June 2025 (UTC). The
embedded 136 profiles from 46 floats in January 2025 remain a fallback if the
extension file cannot load; that fallback retains its actual January dates.
The display shows every float together, with one moving marker and one depth
comparison curtain per float. All curtains descend simultaneously on entering
the Argo stage. Their depths follow each source profile's measured pressure
range, morphing between observations; they are not extended to the seafloor.

Motion is illustrative, as requested: Catmull–Rom interpolation smooths paths,
and displacement from each float's first position is amplified up to threefold, bounded within the illustrated model for
visibility at domain scale. Depth evaluations are resampled to 100 relative
profile levels within each observation’s own measured pressure range and interpolated between observations. Measured profile panels
retain actual observed records and dates; an open panel advances to the next
observed record for its selected float. Surface markers and full depth curtains
move together. The timeline starts with all floats visible, with no staggered
appearance. Reduced motion uses the settled view and manual playback.

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

The model sequence is Run forward -> Argo check -> Stratification budget ->
Data explorer. The budget is embedded in that sequence, preserving the main
model scene and its state. Its values are explicitly absolute PEA/full process
tendencies, with accumulated contributions relative to 1 July (not climatological
anomalies). Obsolete fitted-harmonic tide comparisons have been removed from
the tide detail UI; the MetOcean forcing-constituent display remains.
