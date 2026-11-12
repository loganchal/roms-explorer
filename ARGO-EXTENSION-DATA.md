# Argo extension display data

`data/argo-extension.json` contains individual observed profiles from 1 January
2021 through 30 June 2025, and daily model profiles at their dates and nearest
wet grid cells. It is loaded only when entering the Argo stage.

## Inputs and selection

- Public Argovis v3 `argo_core`, domain 161–185°E, 52–31°S, all 54 months.
- Only levels with pressure, temperature and salinity QC flags at most 2.
- At least 10 complete levels per profile; measured pressure below 3000 dbar.
- Retain at most 32 measured levels including shallowest/deepest valid levels.
- Per WMO, retain observations at least 20 days apart for a compact display.
- Initial value selection: 2,957 profiles from 215 WMOs. Position/time QC
  subsequently removes 25 profiles, leaving 2,932 profiles from 214 WMOs. Actual observation dates run
  from 1 January 2021 to 30 June 2025. No observations are assigned invented dates.

Model input is the daily-mean `nz5km_avg_YYYYMM.nc` output in
`/weka/users/chalo071/Research_Releases/hindcast_199401_202605_v1/outputs`.
The grid is `nz5km_grd_horizontal.nc` in the production extension inputs.
Horizontal matching chooses the nearest wet rho cell, accounting for longitude
convergence. Native Vtransform=2 depths include each profile day's sea level.
Temperature and salinity are interpolated to the measured pressures, treating
dbar as metres at display precision, consistent with the original explorer.
UNESCO one-atmosphere sigma-t is computed identically for model and observation.
As in the original display, interpolation outside native rho-level centres holds
the endpoint value. The match distance is retained for each profile.

This is an illustrative collection of individual model/observation comparisons;
it does not export unpublished composite or mechanistic budget findings.
Animation positions use every available QC-approved GPS fix for these WMOs
(`data/argo-trajectories.json`: 8,234 fixes), without the 20-day value thinning.
Only short gaps are interpolated; missing coverage does not fabricate movement.
All positions use the same geographic projection as the model grid. Native measured
depth ranges and observations remain intact in the payload.

## Reproduction

Run `tools/export_argo_extension.py fetch --cache CACHE --out observations.json`
locally to retrieve and QC monthly public observations. Raw responses stay out
of Git. Deploy committed source to a verified Weka checkout. Run the `match`
subcommand on Slurm, partitioned with `--month YYYYMM`, supplying observation,
output-directory, grid and output paths. Collect the 54 `part-YYYYMM.json` files,
then run `combine --parts PARTS --out data/argo-extension.json` locally.

Matchup exporter revision: `6816e6c`; Slurm array: `6428766`, 54 tasks.
Validate the assembled payload with
`python tools/check_argo_extension.py data/argo-extension.json`.

To reproduce position QC and the unthinned trajectory payload, run
`tools/export_argo_trajectories.py --cache CACHE --profiles INITIAL_PAYLOAD
--out data/argo-trajectories.json --filtered-profiles-out data/argo-extension.json`
after combining the model matchups. The command accepts only position/time QC
flags 1 or 2, verifies cycle numbers against source IDs, preserves ascent/descent
record suffixes, and deduplicates exact source records. The full trajectory set
contains no synthetic points. Long gaps (up to 794 days in this regional query)
are gaps, not evidence of a straight route through the country.
