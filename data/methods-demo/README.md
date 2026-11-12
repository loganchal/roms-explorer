# Seasonal methods demonstration

One preselected wet column nearest 170 E, 40 S, deeper than 200 m;
1 September 2008 through 28 February 2009 (181 daily records).
The coordinate and season were selected before examining their budget.
This is not a climate-phase composite or a release of thesis interpretations.

Generated on Aoraki with `tools/export_budget_demo.py`, source revision
73de1c7, Slurm job 6423585. The JSON records the immutable hindcast release
filenames and byte sizes, actual selected coordinate, all online process terms,
daily start/end PEA, and daily-mean T/S profiles. Profiles are for context;
there are no invented or offline-reconstructed 3D process tendencies.

PEA integration interval: surface to 200 m. Rate units: W m^-3.
The UI converts daily-mean rates to J m^-3 day^-1 and integrates with 86400 s.
`mix` is total interior vertical mixing; its component diagnostics are not
added again. Horizontal and vertical advection are combined only for display.
Free-surface dilution, geometry, tracer-ledger residuals and nonlinear EOS
terms are shown together as closure corrections.

Maximum process-sum discrepancy: 1.3325059462543408e-9 W m^-3.
Maximum daily tendency/state-change discrepancy: 2.3560598492622375e-5 J m^-3.
Consecutive end/start PEA values match exactly. Integrated final reconstruction
error: 0.00025344193062437625 J m^-3, consistent with archived field precision.

Seasonal change is measured from the first day's initial PEA. It is explicitly
not labelled a climatological anomaly. No climate classifications, phase-budget
curves, composite findings or thesis interpretations are included.

The preview remains separate from the live model's navigation while its design
is reviewed. The previously rejected result-based drafts remain outside this
repository and outside the local preview server.

The first view also calculates surface-referenced potential density from the
shown daily-mean T/S using ROMS's Jackett–McDougall den1 polynomial, displaying
sigma-theta = rho-theta - 1000 kg m^-3. It is distinct from both in-situ density
and PEA. The browser calculation was checked against the existing Atlas
ROMS EOS port for all displayed states plus reference/clamping cases (6519
states; maximum numerical discrepancy 0 kg m^-3).
