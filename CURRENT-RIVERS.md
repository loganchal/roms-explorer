# Current MetOcean river source display

The active frontend river asset is `data/river-sources-current.json`. It
contains the **42 sources** in the selected original MetOcean forcing file,
`Extension_Run/inputs/metocean_original/nz5km_N50_rivers.nc`. This replaces the
older 47-source showcase only at display load; the older source material is
preserved separately in Git.

The snapshot is the native **1 January 2021, 00:00 UTC** record. Its source time
axis has 32 daily records beginning 1 December 2020; the selected Jan1 record is
present exactly, without interpolation or relabelling. The asset contains actual
signed and absolute transport, surface river temperature and salinity, and all
50 native `river_Vshape` values for every source. Every Vshape sums to one.

Positions use the corresponding full production grid,
`Extension_Run/inputs/nz5km_grd_horizontal.nc`, with 467 eta by 397 xi rho
points. Original source rho coordinates remain in each record. Display face
coordinates are read directly from the native `lon_u/lat_u` arrays at `[j,i-1]`
for direction 0, or `lon_v/lat_v` at `[j-1,i]` for direction 1: the west/south
staggered face adjoining the indexed source rho cell. No arbitrary offsets,
nearest-coast snaps, or source-grid compression are applied.

The native mask confirms all 42 source rho cells are wet. **19 faces adjoin a
dry cell and 23 are wet/wet** on this exact grid. This is a property of the
selected forcing file, rather than a reason to move the other sources to a
coastline. Each face records the actual source/neighbor wet flags and indices.
One-based whole-grid index shifts do not resolve this distinction and would
misplace the selected coordinates.

Reproduction: `tools/export_current_river_sources.py --source SOURCE.nc
--grid GRID.nc --snapshot 2021-01-01T00:00:00 --out OUTPUT.json`. Source was
committed and pushed as `3e4ed09` before deployment to the verified Weka
checkout. Slurm job `6428909` completed with exit `0:0`. Raw native files stay
outside Git; only the compact display asset and provenance are versioned.
