# Depth-resolved PEA contribution anomaly

The surface remains the separately validated native upper-200 m column PEA
anomaly. The side field is q(z) = g [rho_bar - rho(z)] z, where rho_bar is the
mean potential density between 0 and min(h, 200 m). This is the local integrand
contribution in J m^-3; its depth mean is PEA. It is not cumulative PEA and is
not a column scalar extended down a wall. Face geometry stops at this interval.
Surface and side fields have separate zero-centred colour ranges.

For every daily state in 1994–2020, ROMS's surface-pressure EOS is applied to
T/S, density is interpolated linearly in physical depth, its layer mean is
integrated exactly over those linear segments, and q is evaluated at 5 m
physical-depth intervals. Monthly means are taken after this calculation,
not before the nonlinear EOS or PEA operation. Monthly climatologies contain
9862 daily states across 324 source files. Month-centre means are interpolated
through the calendar, then subtracted from each animation-date local profile.
The 5 m display sampling interpolates the native model's vertical resolution;
it does not add observational resolution.

Reproduce with tools/export_pea_depth.py, source efedbd4. Aoraki Slurm array
6424065 (all 12 tasks completed) and export 6424076. The manifest contains file
hashes, source receipts, dimensions, dates, quantization error and reference.
Tests cover uniform density, analytic local contributions, depth reduction to
analytic PEA, shallow-bottom clipping and a ROMS EOS reference value.

The corrected frame array has shape [216, 41, 436]. The old one-level column
array is retained in Git for history but is no longer used for side geometry.
