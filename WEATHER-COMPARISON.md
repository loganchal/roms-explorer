# Native CFSR weather comparison

`data/weather-comparison.json` supplies all eight weather selectors with paired
native CFSR and bilinearly regridded model-grid fields. The shared snapshot is
**4 January 2021, 01:00 UTC**, selected by maximum downward shortwave at the
model domain-mid nearest wet cell, matching the previous T2M comparison rule.
Every native source record has an exact zero-second offset from that hour.

The native crops retain their original resolution: 127 × 112 points for wind,
temperature, specific humidity, radiation and rain; 53 × 47 for pressure. Each
regridded field has 397 × 467 points. Row orientation is explicit per field.
No native image is synthesized from the regridded/model field.

Display conversions follow the existing forcing recipe: air temperature is °C,
pressure hPa (equivalent to millibar), radiation W m⁻² and rain kg m⁻² s⁻¹.
Humidity is relative humidity in %, derived using the production Teten/Buck
formula from specific humidity, temperature and pressure. On the native humidity
grid, the coarser pressure field is bilinearly interpolated before RH is derived;
on the model grid RH is derived from the regridded source fields. Values are
clipped to the existing 0–110% recipe range. Rain and downward shortwave retain
the existing nonnegative clipping. The paired wind fields are earth-relative
eastward/northward 10 m components, without a grid-angle rotation on either side.

The fields are taken from January CFSR crops in
`/weka/users/chalo071/Fb/cfsr_met/` and their existing regridded counterpart
`/weka/users/chalo071/Fb/cfsr_met_roms/cfsr_met_roms_202101.nc`.
Raw monthly sources remain outside Git. The compact single-hour payload and
exporter are versioned.

Exporter: `tools/export_weather_comparison.py`, committed before deployment at
revision `029a1f8`. Slurm job `6428841` completed successfully with exit `0:0`.
`data/weather-comparison.provenance.json` records the payload hash and receipt.
