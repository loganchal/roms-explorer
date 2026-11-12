# Tidal forcing presentation

The tide stage isolates tidal forcing from the previously displayed GLORYS and
nudging layers, leaving bathymetry as context. Its elevation still uses each
constituent's supplied boundary amplitude and phase. Wet-segment masks prevent
ribbons bridging land. Height retains the existing per-constituent display
normalization; M2's demonstration cycle is 12 s, with other periods scaled and
bounded to 6–28 s. These are display scales, stated under Information.

The animated fill uses a sea-glass/cream/coral palette with a transparent wash
from the zero baseline toward a fine ivory crest. A quiet baseline remains
visible; additive glow and the previous saturated orange treatment are removed.
The constituent selector uses an open serif treatment. Model colours and
brightness are unchanged.

River markers are suppressed only during Run forward. Argo remains its own
step: 45-second traversal of the model extension, small ivory heads with sea-glass rings, and
short, curved gradient trails. Profile depths remain tied to each observed
profile's pressure range. The common fade helper now also hides layers already
at zero opacity when they are suppressed in the same visibility pass.
