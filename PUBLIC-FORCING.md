# Public forcing presentation

River discharge and signed transport are omitted from the active JSON and source exporter. River marks are uniform-sized, including the full and detail explorers. Native positions and the normalized vertical profile remain visible. The unused legacy river snapshot is removed from scene_data.js.

All supplied tide amplitude/phase arrays and old tide-validation arrays are removed from scene_data.js. public-tide.js loads data/public-tide-example.json, retrieved from NOAA CO-OPS station 9414290 (San Francisco), with source URL, date and SHA-256. The ten selected positive-amplitude constituents are a teaching example, repeated uniformly along the display boundary. They are not the New Zealand forcing. The 72-hour harmonic sum has an arbitrary time origin and omits equilibrium arguments, nodal corrections and mean sea level; it is not a tide prediction. The UI and detail page identify this distinction.

Original local source NetCDF files are untouched. Older Git revisions and copies already downloaded by others may retain previously published values; this change does not rewrite repository history.
