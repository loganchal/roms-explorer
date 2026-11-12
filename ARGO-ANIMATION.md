# Argo display animation

The runtime data contain 136 observed profiles from 46 floats in January 2025.
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

The model sequence is Run forward -> Argo check -> Stratification budget ->
Data explorer. The budget is embedded in that sequence, preserving the main
model scene and its state. Its values are explicitly absolute PEA/full process
tendencies, with accumulated contributions relative to 1 July (not climatological
anomalies). Obsolete fitted-harmonic tide comparisons have been removed from
the tide detail UI; the MetOcean forcing-constituent display remains.
