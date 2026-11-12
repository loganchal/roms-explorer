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
Animation positions use native recorded fixes for these WMOs
(`data/argo-trajectories.json`: 8,206 fixes), without the 20-day value thinning.
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
record suffixes, and deduplicates exact source records. The trajectory set contains no synthetic points. Known coarse Iridium
position estimates for WMO 5906259 are excluded from motion anchors as detailed below. Long gaps (up to 794 days in this regional query)
are gaps, not evidence of a straight route through the country.

## Repeated Iridium positions: WMO 5906259

The original GDAC profile [108](https://data-argo.ifremer.fr/dac/aoml/5906259/profiles/D5906259_108.nc)
(26 June 2023) identifies its position as GPS, while profile
[110](https://data-argo.ifremer.fr/dac/aoml/5906259/profiles/D5906259_110.nc)
(16 July 2023) identifies its repeated position as IRIDIUM. Both carry position
QC 1. The [Argovis metadata reference 5906259_m1](https://argovis-api.colorado.edu/argo/meta?id=5906259_m1)
explicitly identifies an APEX float using IRIDIUM positioning. These repeated
coarse estimates do not establish that the float stopped moving. The
[Argo format manual](https://oneargo.github.io/argo-format-user-manual/04-format-trajectoire.html)
distinguishes Iridium/estimated positions used when acceptable GPS fixes are
unavailable.

Only the 28 known Iridium motion anchors are omitted. All 2,932 comparison
profiles, including the 11 associated with this metadata group, retain their
original values, model matchups and source positions. The remaining trajectory
contains 8,206 recorded fixes across the same 214 WMO identities. Interpolation
uses gaps of at most 30 days; longer gaps are absent, without artificial drifting
or a claim of true stationarity. Other floats are described as recorded
positions because their positioning systems have not all been individually
verified. Re-running the position exporter applies this documented, explicit
metadata-ID exclusion after the scientific-profile QC selection.
