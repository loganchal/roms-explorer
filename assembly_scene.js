import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// Guided assembly: start from an empty cube, step through building the
// model up one piece at a time. Each step is simple by default (a kid
// should follow it) but has an expandable detail panel with real evidence
// and an honest note on what's simplified in THIS VISUALIZATION specifically
// (separate from the provenance badge, which is about the underlying data).
// No new data is pulled for this pass -- steps reuse what's already in
// scene_data.js and are explicit where that's a simplification.

const NY = GRID_NY, NX = GRID_NX;
const CUBE_SIZE = 300; // world units -- horizontal (lon/lat) extent
const CUBE_HEIGHT = CUBE_SIZE / 2; // vertical (depth) extent -- half the horizontal size

function b64f32(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Float32Array(buf.buffer);
}
function b64u8(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
}
function lerpColor(c1, c2, t) { return new THREE.Color(c1).lerp(new THREE.Color(c2), t); }
function colormap(t, stops) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1, seg = t * n, i = Math.min(n - 1, Math.floor(seg));
    return lerpColor(stops[i], stops[i + 1], seg - i);
}
function minMax(arr) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; }
    return [lo, hi];
}
function fieldRange(arr, maskArr) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < arr.length; k++) {
        if (maskArr[k] < 0.5) continue;
        if (arr[k] < lo) lo = arr[k];
        if (arr[k] > hi) hi = arr[k];
    }
    return [lo, hi];
}

const BATHY_STOPS = ["#d8f2ea", "#5cd6c4", "#2e8fc9", "#1a4a8e", "#0a1230"];
const LAND_COLOR = new THREE.Color("#6b6a63");
const WARM_STOPS = ["#2b5faa", "#6fb1c9", "#f2e394", "#e0782f", "#a8281f"];
const SALT_STOPS = ["#2a186c", "#1b3aa0", "#16638d", "#318288", "#46a483", "#69c46f", "#b8db60", "#fdef9a"]; // cmocean 'haline'
const NUDG_STOPS = ["#140b1f", "#5b2a86", "#c8632e", "#f2c53d"];
const SW_STOPS = ["#05070f", "#132244", "#2f5c8c", "#e0a83c", "#fff4cf"];
const PAIR_STOPS = ["#3d2a6b", "#4f7cae", "#dbe4de", "#d9843c", "#a8281f"];
const TAIR_STOPS = ["#1a3a6b", "#4f8ab0", "#dbe4a0", "#e0782f", "#a8281f"];
const QAIR_STOPS = ["#3a2a12", "#8a6a3c", "#c8d8dc", "#4f9ab0", "#1a5a8e"];
const RAIN_STOPS = ["#0a0e14", "#0a0e14", "#2f6690", "#5cb3ff", "#dbe9ee"];
const LWRAD_STOPS = ["#140b1f", "#5b2a86", "#c05c3e", "#e0a83c", "#fff4cf"];
const TIDE_WAVE_STOPS = ["#0b2545", "#2f6690", "#dbe9ee", "#f2a154", "#c1440e"];
const WIND_SPEED_STOPS = ["#3d4a5c", "#7c8ea3", "#d9e4ee", "#ffffff", "#ffffff"];
const ZETA_STOPS = ["#123a6b", "#5c9bc9", "#eef1e8", "#e6934a", "#a8281f"]; // diverging blue-white-red for sea-surface height (below MSL / above MSL)
// fast numeric colormap for hot per-frame loops (tide, wind particles) --
// avoids allocating a THREE.Color per call the way colormap()/lerpColor() do.
function toRGB(stops) { return stops.map(hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }); }
function fastColormap(t, stopsRGB, out) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const n = stopsRGB.length - 1, seg = t * n, i = Math.min(n - 1, Math.floor(seg)), f = seg - i;
    const a = stopsRGB[i], b = stopsRGB[i + 1];
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
}

// Three data classes (Logan's taxonomy): ORIGINAL = the hindcast's own
// artefacts, used as-is (grid, nudging coefficients, initial state, the model
// and its settings, the run's own output). REBUILT = forcing remade from the
// same upstream sources the original run used (GLORYS ocean state, CFSR
// weather). RECONSTRUCTED = forcing that had to be re-derived because the
// original was never published (tides refit from output, rivers re-placed).
// The last two are where the scrutiny belongs. Argo is none of these --
// independent observations, kept as a quiet fourth badge.
const PROV = {
    original: { label: "Original", color: "#5dcaa5" },
    rebuilt: { label: "Rebuilt", color: "#4fa8ff" },
    reconstructed: { label: "Reconstructed", color: "#f2a63c" },
    obs: { label: "Observations", color: "#b9a6ff" },
};

const lonRho = b64f32(LON_RHO_B64), latRho = b64f32(LAT_RHO_B64);
const H = b64f32(H_B64), MASK = b64f32(MASK_RHO_B64);
const CLIM_TEMP = b64f32(CLIM_TEMP_SURF_B64);
const CLIM_SALT = b64f32(CLIM_SALT_SURF_B64);
const CLIM_SPEED = b64f32(CLIM_SPEED_SURF_B64);
// generic tracer coefficient -- verified identical to temp_NudgeCoef,
// salt_NudgeCoef, M2_NudgeCoef and M3_NudgeCoef in the raw file (one array,
// five variable names), so this single field stands in for all of them.
const NUDG = b64f32(NUDG_TRACER_SURF_B64);
const [lonLo, lonHi] = minMax(lonRho), [latLo, latHi] = minMax(latRho);
const lonMid = (lonLo + lonHi) / 2, latMid = (latLo + latHi) / 2;
const hRange = fieldRange(H, MASK);
const climTempRange = fieldRange(CLIM_TEMP, MASK);
const climSaltRange = fieldRange(CLIM_SALT, MASK);
const nudgTracerLog = Float32Array.from(NUDG, v => Math.log10(Math.max(v, 1e-5)));
const nudgTracerRange = fieldRange(nudgTracerLog, MASK);
// which cells are still inside the nudging ramp (not yet decayed to the
// 0.001/day floor) -- used both to build the nudging border's own geometry
// and to cut a matching hole in the climatology fill so the border (which
// sits lower, following real depth) isn't hidden under a flat sheet above it.
const NUDG_FLOOR = 0.001;
const nudgInRamp = new Uint8Array(NY * NX);
for (let k = 0; k < NY * NX; k++) nudgInRamp[k] = (MASK[k] >= 0.5 && NUDG[k] > NUDG_FLOOR * 1.1) ? 1 : 0;
// each side's "inner edge" as a cell-index margin -- NUDG_MARGIN_SOUTH etc
// come straight from scene_data.js (computed server-side by ramp_margins()
// in extract_forcing_showcase.py, same >50%-of-water-cells scan, done there
// so the depth-resolved climatology pulled for the inner wall lands on
// exactly the same row/column this margin picks).

// depth-resolved climatology (what the model relaxes toward) at the same 8
// wall lines the border geometry uses -- lets the nudging step toggle
// between "how hard it pulls" (the coefficient, above) and "what it pulls
// toward" (this). Level-major per netCDF slice order: arr[level*n + idx].
function combinedMinMax(arrays) {
    let lo = Infinity, hi = -Infinity;
    for (const arr of arrays) for (let i = 0; i < arr.length; i++) {
        if (arr[i] < lo) lo = arr[i];
        if (arr[i] > hi) hi = arr[i];
    }
    return [lo, hi];
}
const NUDG_CLIM_WALLS = {
    southOuter: { temp: b64f32(CLIM_TEMP_SOUTH_OUTER_B64), salt: b64f32(CLIM_SALT_SOUTH_OUTER_B64), speed: b64f32(CLIM_SPEED_SOUTH_OUTER_B64) },
    northOuter: { temp: b64f32(CLIM_TEMP_NORTH_OUTER_B64), salt: b64f32(CLIM_SALT_NORTH_OUTER_B64), speed: b64f32(CLIM_SPEED_NORTH_OUTER_B64) },
    westOuter: { temp: b64f32(CLIM_TEMP_WEST_OUTER_B64), salt: b64f32(CLIM_SALT_WEST_OUTER_B64), speed: b64f32(CLIM_SPEED_WEST_OUTER_B64) },
    eastOuter: { temp: b64f32(CLIM_TEMP_EAST_OUTER_B64), salt: b64f32(CLIM_SALT_EAST_OUTER_B64), speed: b64f32(CLIM_SPEED_EAST_OUTER_B64) },
    southInner: { temp: b64f32(CLIM_TEMP_SOUTH_INNER_B64), salt: b64f32(CLIM_SALT_SOUTH_INNER_B64), speed: b64f32(CLIM_SPEED_SOUTH_INNER_B64) },
    northInner: { temp: b64f32(CLIM_TEMP_NORTH_INNER_B64), salt: b64f32(CLIM_SALT_NORTH_INNER_B64), speed: b64f32(CLIM_SPEED_NORTH_INNER_B64) },
    westInner: { temp: b64f32(CLIM_TEMP_WEST_INNER_B64), salt: b64f32(CLIM_SALT_WEST_INNER_B64), speed: b64f32(CLIM_SPEED_WEST_INNER_B64) },
    eastInner: { temp: b64f32(CLIM_TEMP_EAST_INNER_B64), salt: b64f32(CLIM_SALT_EAST_INNER_B64), speed: b64f32(CLIM_SPEED_EAST_INNER_B64) },
};
// one shared colour scale across all 8 walls (not per-wall local min/max) so
// a cold southern wall and a warm northern wall are visually comparable, and
// the depth gradient on each wall reads as real magnitude, not a stretched
// per-wall scale.
const NUDG_CLIM_TEMP_RANGE = combinedMinMax(Object.values(NUDG_CLIM_WALLS).map(w => w.temp));
const NUDG_CLIM_SALT_RANGE = combinedMinMax(Object.values(NUDG_CLIM_WALLS).map(w => w.salt));
const NUDG_CLIM_SPEED_RANGE = combinedMinMax(Object.values(NUDG_CLIM_WALLS).map(w => w.speed));

// the volume step's one switcher -- same two options as the boundary step,
// since it's the same underlying climatology pipeline.
const CLIM_FIELDS = {
    temp: { label: "Temperature", field: CLIM_TEMP, range: climTempRange, stops: WARM_STOPS },
    salt: { label: "Salinity", field: CLIM_SALT, range: climSaltRange, stops: SALT_STOPS },
};
const latNorth = latRho[(NY - 1) * NX];
const lonEast = lonRho[NX - 1], lonWest = lonRho[0];
// four walls: north/south vary along longitude (fixed latitude), east/west
// vary along latitude (fixed longitude) -- each { along, fixed, h, temp, axis }
const WALLS = {
    north: { along: b64f32(BND_LON_NORTH_B64), fixed: latNorth, h: b64f32(BND_H_NORTH_B64), temp: b64f32(BND_TEMP_NORTH_B64), salt: b64f32(BND_SALT_NORTH_B64), speed: b64f32(BND_SPEED_NORTH_B64), axis: "ns" },
    south: { along: b64f32(BND_LON_SOUTH_B64), fixed: latRho[0], h: b64f32(BND_H_SOUTH_B64), temp: b64f32(BND_TEMP_SOUTH_B64), salt: b64f32(BND_SALT_SOUTH_B64), speed: b64f32(BND_SPEED_SOUTH_B64), axis: "ns" },
    east: { along: b64f32(BND_LAT_EAST_B64), fixed: lonEast, h: b64f32(BND_H_EAST_B64), temp: b64f32(BND_TEMP_EAST_B64), salt: b64f32(BND_SALT_EAST_B64), speed: b64f32(BND_SPEED_EAST_B64), axis: "ew" },
    west: { along: b64f32(BND_LAT_WEST_B64), fixed: lonWest, h: b64f32(BND_H_WEST_B64), temp: b64f32(BND_TEMP_WEST_B64), salt: b64f32(BND_SALT_WEST_B64), speed: b64f32(BND_SPEED_WEST_B64), axis: "ew" },
};
// GLORYS native z-level slice at the north wall's latitude -- the "before"
// of the regridding that built the boundary file above. Raw source-grid
// data only (its own lon/depth axes, NOT the wall's N50 sigma layout); the
// quad geometry that turns this into a mesh is built in mountAssembly,
// since that's where NaN cells (below the seabed) get omitted rather than
// painted -- same convention as every other mesh-builder in this file.
const GLORYS_LON = b64f32(GLORYS_LON_B64);
const GLORYS_DEPTH = b64f32(GLORYS_DEPTH_B64);
const GLORYS_TEMP_NORTH = b64f32(GLORYS_TEMP_NORTH_B64);
const GLORYS_SALT_NORTH = b64f32(GLORYS_SALT_NORTH_B64);

const uwind = b64f32(MET_UWIND_SNAP_B64), vwind = b64f32(MET_VWIND_SNAP_B64);
const swrad = b64f32(MET_SWRAD_SNAP_B64);
const swradRange = fieldRange(swrad, MASK);
const pair = b64f32(MET_PAIR_SNAP_B64);
const pairRange = fieldRange(pair, MASK);
const tair = b64f32(MET_TAIR_SNAP_B64);
const tairRange = fieldRange(tair, MASK);
const qair = b64f32(MET_QAIR_SNAP_B64);
const qairRange = fieldRange(qair, MASK);
const rain = b64f32(MET_RAIN_SNAP_B64);
const rainRange = fieldRange(rain, MASK);
const lwradDown = b64f32(MET_LWRAD_DOWN_SNAP_B64);
const lwradDownRange = fieldRange(lwradDown, MASK);
// fields switchable under the wind layer, nullschool-overlay-row style --
// all 6 of the file's 8 fields that vary spatially (wind stays the constant
// animated layer above; the other 2, Uwind/Vwind, drive that animation).
const METEO_FIELDS = {
    swrad: { label: "Shortwave", field: swrad, range: swradRange, stops: SW_STOPS },
    pair: { label: "Pressure", field: pair, range: pairRange, stops: PAIR_STOPS },
    tair: { label: "Air temp", field: tair, range: tairRange, stops: TAIR_STOPS },
    qair: { label: "Humidity", field: qair, range: qairRange, stops: QAIR_STOPS },
    rain: { label: "Rain", field: rain, range: rainRange, stops: RAIN_STOPS },
    lwradDown: { label: "Longwave", field: lwradDown, range: lwradDownRange, stops: LWRAD_STOPS },
};
// -- initial state (t=0 ocean handed to ROMS) + run-forward animation + Argo
// check: the last three steps, using model input/output rather than forcing.
// Same decode-at-module-scope convention as everything above.
const INI_TEMP_SURF = b64f32(INI_TEMP_SURF_B64);
const INI_SALT_SURF = b64f32(INI_SALT_SURF_B64);
const INI_ZETA = b64f32(INI_ZETA_B64);
const INI_SPEED_SURF = b64f32(INI_SPEED_SURF_B64);
function symmetricRange(arr, maskArr) {
    const [lo, hi] = fieldRange(arr, maskArr);
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m, m];
}
const iniTempRange = fieldRange(INI_TEMP_SURF, MASK);
const iniSaltRange = fieldRange(INI_SALT_SURF, MASK);
const iniSpeedRange = fieldRange(INI_SPEED_SURF, MASK);
const iniZetaRange = symmetricRange(INI_ZETA, MASK); // symmetric about 0 so ZETA_STOPS' middle (white) stop lands exactly on mean sea level
const INI_FIELDS = {
    temp: { label: "Temperature", field: INI_TEMP_SURF, range: iniTempRange, stops: WARM_STOPS },
    salt: { label: "Salinity", field: INI_SALT_SURF, range: iniSaltRange, stops: SALT_STOPS },
    speed: { label: "Current speed", field: INI_SPEED_SURF, range: iniSpeedRange, stops: WIND_SPEED_STOPS },
    ssh: { label: "SSH", field: INI_ZETA, range: iniZetaRange, stops: ZETA_STOPS },
};
// two full-depth curtains through the domain middle -- raw decode grouped
// here (same pattern as NUDG_CLIM_WALLS above), painted where the meshes
// are built below since that's where the stops/range choice actually lives.
const INI_SLICES = {
    eta: { temp: b64f32(INI_TEMP_SLICE_ETA_B64), salt: b64f32(INI_SALT_SLICE_ETA_B64) }, // fixed row (INI_SLICE_JROW), varies xi -- same axis as north/south walls
    xi: { temp: b64f32(INI_TEMP_SLICE_XI_B64), salt: b64f32(INI_SALT_SLICE_XI_B64) },     // fixed column (INI_SLICE_ICOL), varies eta -- same axis as east/west walls
};

// run-forward animation: 31 daily-mean surface frames, uint8-quantized
// (see quantize_frames() in build_roms_explorer_scene_data.py) at half
// resolution (FRAMES_SUB=2). Decoded once here; the per-frame RGB colour
// buffers themselves are built lazily inside mountAssembly (see
// framesColorCache) since that's the actual perf-sensitive part.
const FRAMES_MASK_ARR = b64u8(FRAMES_MASK_B64);
const FRAMES_RAW = {
    temp: b64u8(FRAMES_TEMP_B64), salt: b64u8(FRAMES_SALT_B64),
    speed: b64u8(FRAMES_SPEED_B64), ssh: b64u8(FRAMES_ZETA_B64),
};
const FRAMES_FIELDS = {
    temp: { label: "Temperature", range: FRAMES_TEMP_RANGE, stops: WARM_STOPS },
    salt: { label: "Salinity", range: FRAMES_SALT_RANGE, stops: SALT_STOPS },
    speed: { label: "Current speed", range: FRAMES_SPEED_RANGE, stops: WIND_SPEED_STOPS },
    ssh: { label: "SSH", range: FRAMES_ZETA_RANGE, stops: ZETA_STOPS },
};

// all 11 tidal constituents' amp+phase -- bare identifiers since scene_data.js
// declares one const per constituent (TIDE_AMP_M2_B64 etc); TIDE_NAMES gives
// the name->index order, checked against known periods when first pulled.
const TIDE_RAW = {
    M4: { amp: TIDE_AMP_M4_B64, phase: TIDE_PHASE_M4_B64 },
    K2: { amp: TIDE_AMP_K2_B64, phase: TIDE_PHASE_K2_B64 },
    S2: { amp: TIDE_AMP_S2_B64, phase: TIDE_PHASE_S2_B64 },
    M2: { amp: TIDE_AMP_M2_B64, phase: TIDE_PHASE_M2_B64 },
    N2: { amp: TIDE_AMP_N2_B64, phase: TIDE_PHASE_N2_B64 },
    K1: { amp: TIDE_AMP_K1_B64, phase: TIDE_PHASE_K1_B64 },
    P1: { amp: TIDE_AMP_P1_B64, phase: TIDE_PHASE_P1_B64 },
    O1: { amp: TIDE_AMP_O1_B64, phase: TIDE_PHASE_O1_B64 },
    Q1: { amp: TIDE_AMP_Q1_B64, phase: TIDE_PHASE_Q1_B64 },
    MF: { amp: TIDE_AMP_MF_B64, phase: TIDE_PHASE_MF_B64 },
    MM: { amp: TIDE_AMP_MM_B64, phase: TIDE_PHASE_MM_B64 },
};
function formatTidePeriod(hours) {
    if (hours >= 48) return (hours / 24).toFixed(1) + "d";
    const h = Math.floor(hours), m = Math.round((hours - h) * 60);
    return `${h}h${String(m).padStart(2, "0")}m`;
}
// precompute amp range + phase cos/sin for every constituent once at load --
// cheap (11 x NY*NX), and means switching constituents is instant (no
// per-vertex trig on the hot path, same trick as the single-constituent
// version this replaces: cos(wt - phi) = cos(wt)cos(phi) + sin(wt)sin(phi)).
const TIDE_CONSTITUENTS = {};
TIDE_NAMES.forEach((name, i) => {
    const amp = b64f32(TIDE_RAW[name].amp), phase = b64f32(TIDE_RAW[name].phase);
    const cosPhi = new Float32Array(NY * NX), sinPhi = new Float32Array(NY * NX);
    for (let k = 0; k < NY * NX; k++) {
        const rad = (phase[k] * Math.PI) / 180;
        cosPhi[k] = Math.cos(rad);
        sinPhi[k] = Math.sin(rad);
    }
    TIDE_CONSTITUENTS[name] = {
        label: `${name} — ${formatTidePeriod(TIDE_PERIOD_HOURS[i])}`,
        amp, cosPhi, sinPhi, range: fieldRange(amp, MASK),
    };
});

// Equal-length cube: lon and lat spans are different in degrees (and depth is
// a completely different unit), so each axis gets its own scale factor to
// independently fill exactly [-CUBE_SIZE/2, CUBE_SIZE/2] / [0, -CUBE_SIZE].
// This deliberately does not preserve real-world aspect ratio.
const SCALE_X = CUBE_SIZE / (lonHi - lonLo);
const SCALE_Z = CUBE_SIZE / (latHi - latLo);
const MAX_DEPTH_M = hRange[1];
function lonLatToXZ(lon, lat, lonMid_, latMid_) {
    return [(lon - lonMid_) * SCALE_X, -(lat - latMid_) * SCALE_Z];
}
function depthToY(h_m) { return -(h_m / MAX_DEPTH_M) * CUBE_HEIGHT; }

// World XZ of every grid point, precomputed once -- every flat layer's
// geometry reuses this instead of recomputing the same projection per mesh.
const gridX = new Float32Array(NY * NX), gridZ = new Float32Array(NY * NX);
for (let k = 0; k < NY * NX; k++) {
    const [x, z] = lonLatToXZ(lonRho[k], latRho[k], lonMid, latMid);
    gridX[k] = x; gridZ[k] = z;
}

// -- step definitions -------------------------------------------------------
const STEPS = [
    {
        id: "grid", title: "The grid", kid: "395 x 465 points, 5 km, 50 sigma levels.",
        prov: "original", source: "nz5km_grd_horizontal.nc",
        detail: "The hindcast's native grid file.",
        limitation: null,
    },
    {
        id: "boundary", title: "Open boundaries", kid: "GLORYS state at the walls.",
        prov: "rebuilt", source: "nz5km_N50_bnd_202101.nc",
        detail: "GLORYS reanalysis rebuilt into a ROMS boundary file.",
        limitation: null,
    },
    {
        id: "volume", title: "Interior nudging", kid: "A relaxation ramp from the original configuration.",
        sources: [
            { prov: "original", source: "nz5km_nudg_N50.nc" },
            { prov: "rebuilt", source: "nz5km_N50_clim_202101.nc" },
        ],
        detail: "1/day at the wall to 0.001/day 39 cells (~195 km) in.",
        limitation: null,
    },
    {
        id: "tides", title: "Tides", kid: "11 constituents on the open boundary.",
        prov: "rebuilt", source: "nz5km-tide.nc",
        detail: "Regridded from TPXO8-atlas.",
        limitation: "Amplitude and cycle speed normalized per constituent. TPXO8 regrid build is in progress -- numbers on the dig-down page are still the prior harvest-and-refit values.",
    },
    {
        id: "rivers", title: "Rivers", kid: "47 point sources.",
        prov: "reconstructed", source: "nz5km_N50_rivers.nc",
        detail: "Re-placed on the real coastline.",
        limitation: null,
    },
    {
        id: "meteo", title: "Weather above", kid: "CFSR raw atmospheric state.",
        prov: "rebuilt", source: "nz5km_N50_meteo_202101.nc",
        detail: "Regridded onto the model grid.",
        limitation: null,
    },
    {
        id: "ini", title: "Initial state", kid: "The last state of the Moana Hindcast.",
        prov: "original", source: "nz5km_ini_20210101_audited.nc",
        detail: "1 January 2021.",
        limitation: null,
    },
    {
        id: "frames", title: "Run forward", kid: "The model's own output, month by month.",
        prov: "original", source: "nz5km_avg_*.nc",
        detail: "A few daily-mean snapshots per month, across the whole run so far.",
        limitation: null,
    },
    {
        id: "argo", title: "Argo check", kid: "134 independent float profiles.",
        prov: "obs", source: "argo_floats_202101.json",
        detail: "Model minus observed at each depth: red model-high, blue model-low.",
        limitation: null,
    },
    {
        id: "parts", title: "Data explorer", kid: "Explore forcing data",
        detail: "Rebuilt and reconstructed pieces open their own page.",
        limitation: null,
    },
];

export function mountAssembly() {
    const viewport = document.getElementById("viewport");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    Object.assign(labelRenderer.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    viewport.appendChild(labelRenderer.domElement);

    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.0007);

    scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x0a0e14, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.65);
    sun.position.set(220, 420, 160);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x5cb3ff, 0.25);
    rim.position.set(-200, 120, -260);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 80;
    controls.maxDistance = 900;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    camera.position.set(0, 260, 340);
    controls.target.set(0, -CUBE_HEIGHT / 2, 0); // orbit around the cube's vertical middle, not the sea surface
    controls.update();

    let idleTimer = null;
    function wakeFromIdle() {
        controls.autoRotate = false;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { controls.autoRotate = true; }, 12000);
    }
    renderer.domElement.addEventListener("pointerdown", wakeFromIdle);
    renderer.domElement.addEventListener("wheel", wakeFromIdle, { passive: true });

    function resize() {
        const w = viewport.clientWidth, h = viewport.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        labelRenderer.setSize(w, h);
    }
    window.addEventListener("resize", resize);

    // -- empty-cube wireframe -- bright + unfogged so it stays visible
    // against the black background even at default camera distance -----
    const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_HEIGHT, CUBE_SIZE);
    const cubeEdges = new THREE.EdgesGeometry(cubeGeo);
    const cubeWire = new THREE.LineSegments(cubeEdges, new THREE.LineBasicMaterial({ color: 0x8fb0d8, transparent: true, opacity: 0.9, fog: false }));
    cubeWire.position.set(0, -CUBE_HEIGHT / 2, 0);
    scene.add(cubeWire);

    // -- shared grid geometry builder -----------------------------------
    function buildGridGeometry() {
        const positions = new Float32Array(NY * NX * 3);
        const index = [];
        for (let k = 0; k < NY * NX; k++) {
            positions[k * 3] = gridX[k]; positions[k * 3 + 1] = 0; positions[k * 3 + 2] = gridZ[k];
        }
        for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
            const a = j * NX + i, b = j * NX + i + 1, c = (j + 1) * NX + i, d = (j + 1) * NX + i + 1;
            index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setIndex(index);
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(NY * NX * 3), 3));
        return geo;
    }
    function paintField(geo, field, range, stops) {
        const col = geo.attributes.color, [lo, hi] = range;
        for (let k = 0; k < NY * NX; k++) {
            if (MASK[k] < 0.5) { col.setXYZ(k, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b); continue; }
            const c = colormap((field[k] - lo) / (hi - lo || 1), stops);
            col.setXYZ(k, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }

    // -- grid step --------------------------------------------------------
    const terrainGeo = buildGridGeometry();
    const posAttr = terrainGeo.attributes.position;
    for (let k = 0; k < NY * NX; k++) posAttr.setY(k, MASK[k] < 0.5 ? 0 : depthToY(H[k]));
    terrainGeo.computeVertexNormals();
    paintField(terrainGeo, H, hRange, BATHY_STOPS);
    const terrainMesh = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
    terrainMesh.visible = false;
    scene.add(terrainMesh);

    // -- boundary step: all four walls, each a full-depth curtain, switchable
    // between temp and salt (both colour sets precomputed once at build time
    // so switching is just swapping which typed array feeds the attribute) --
    const BOUNDARY_FIELDS = { temp: { label: "Temperature", stops: WARM_STOPS }, salt: { label: "Salinity", stops: SALT_STOPS }, speed: { label: "Current speed", stops: WIND_SPEED_STOPS } };
    // shared by the wall curtains and the source slice below, so the source
    // slice's colour uses exactly the same value range as the boundary wall
    // it's being crossfaded against -- only the structure differs.
    function wallFieldRange(field) { return fieldRange(field, new Float32Array(field.length).fill(1)); }
    function wallColors(spec, key) {
        const n = spec.along.length, field = spec[key];
        const [lo, hi] = wallFieldRange(field);
        const colors = new Float32Array(BND_N_SRHO * n * 3);
        for (let k = 0; k < BND_N_SRHO * n; k++) {
            const c = colormap((field[k] - lo) / (hi - lo || 1), BOUNDARY_FIELDS[key].stops);
            colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
        }
        return colors;
    }
    function buildWall(spec) {
        const n = spec.along.length;
        const positions = new Float32Array(BND_N_SRHO * n * 3);
        const index = [];
        for (let s = 0; s < BND_N_SRHO; s++) {
            const frac = s / (BND_N_SRHO - 1);
            for (let i = 0; i < n; i++) {
                const k = s * n + i;
                const [x, z] = spec.axis === "ns"
                    ? lonLatToXZ(spec.along[i], spec.fixed, lonMid, latMid)
                    : lonLatToXZ(spec.fixed, spec.along[i], lonMid, latMid);
                const y = THREE.MathUtils.lerp(depthToY(spec.h[i]), 0, frac);
                positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;
            }
        }
        for (let s = 0; s < BND_N_SRHO - 1; s++) for (let i = 0; i < n - 1; i++) {
            const a = s * n + i, b = s * n + i + 1, c = (s + 1) * n + i, d = (s + 1) * n + i + 1;
            index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(wallColors(spec, "temp"), 3));
        geo.setIndex(index);
        // polygonOffset so this reliably wins the depth test against the
        // terrain mesh it's coincident with along the domain edge (the wall's
        // bottom row follows the same H values as the terrain there) --
        // without it the two flicker/moire against each other. Weaker than
        // the nudging outer wall's -8 (which in turn wins against this one
        // when both are visible from "volume" onward), stronger than
        // terrain's un-offset 0. Magnitude matters, not just sign: at grazing
        // view angles (looking almost along the wall) a small offset isn't
        // enough separation and the two surfaces alias against each other
        // anyway -- this whole offset stack (terrain 0, boundary -4, nudging
        // -8, tide -16) was widened 4x for exactly that case.
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        }));
        mesh.userData = { spec };
        return mesh;
    }
    const boundaryGroup = new THREE.Group();
    // captured separately from boundaryGroup.children (which also gets the
    // source-slice mesh below) so field-colour updates below only ever walk
    // the four wall curtains, not the slice -- that has its own paint path.
    const boundaryWallMeshes = Object.values(WALLS).map((spec) => {
        const mesh = buildWall(spec);
        boundaryGroup.add(mesh);
        return mesh;
    });
    boundaryGroup.visible = false;
    let boundaryFieldKey = "temp";

    // -- source slice: the native GLORYS z-level grid at the north wall's
    // latitude, one flat quad per source cell -- cell edges sit at the
    // midpoint between neighbouring lon/depth samples, and NaN cells (below
    // the real seabed there) are simply omitted, not painted, so the gaps
    // under the seafloor are visible. temp/salt share the same land/below-
    // seabed mask (verified against the source data), so the geometry+index
    // is built once and only the colour attribute is repainted on switch.
    function cellEdges(centers) {
        const n = centers.length;
        const edges = new Float32Array(n + 1);
        edges[0] = centers[0] - (centers[1] - centers[0]) / 2;
        for (let i = 1; i < n; i++) edges[i] = (centers[i - 1] + centers[i]) / 2;
        edges[n] = centers[n - 1] + (centers[n - 1] - centers[n - 2]) / 2;
        return edges;
    }
    const glorysLonEdges = cellEdges(GLORYS_LON);
    const glorysDepthEdges = cellEdges(GLORYS_DEPTH);
    // x uses the SAME lon->world mapping the north wall uses; z is pinned to
    // the north wall's own fixed latitude (not GLORYS_LAT_NORTH, which is
    // the same latitude but a slightly different float) so the slice sits
    // exactly coplanar with the curtain it crossfades against.
    const glorysX = new Float32Array(GLORYS_NLON + 1);
    for (let i = 0; i <= GLORYS_NLON; i++) glorysX[i] = lonLatToXZ(glorysLonEdges[i], latNorth, lonMid, latMid)[0];
    const glorysZ = lonLatToXZ(GLORYS_LON[0], latNorth, lonMid, latMid)[1];
    const glorysY = new Float32Array(GLORYS_NZ + 1);
    for (let s = 0; s <= GLORYS_NZ; s++) glorysY[s] = depthToY(glorysDepthEdges[s]);
    const sourceCells = [];
    for (let s = 0; s < GLORYS_NZ; s++) for (let i = 0; i < GLORYS_NLON; i++) {
        if (!Number.isNaN(GLORYS_TEMP_NORTH[s * GLORYS_NLON + i])) sourceCells.push(s * GLORYS_NLON + i);
    }
    const sourcePositions = new Float32Array(sourceCells.length * 4 * 3);
    const sourceColors = new Float32Array(sourceCells.length * 4 * 3);
    const sourceIndex = [];
    sourceCells.forEach((cellIdx, q) => {
        const s = Math.floor(cellIdx / GLORYS_NLON), i = cellIdx % GLORYS_NLON;
        const x0 = glorysX[i], x1 = glorysX[i + 1], y0 = glorysY[s], y1 = glorysY[s + 1];
        const vo = q * 4;
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        corners.forEach(([x, y], c) => {
            const vi = (vo + c) * 3;
            sourcePositions[vi] = x; sourcePositions[vi + 1] = y; sourcePositions[vi + 2] = glorysZ;
        });
        sourceIndex.push(vo, vo + 1, vo + 2, vo, vo + 2, vo + 3);
    });
    const sourceGeo = new THREE.BufferGeometry();
    sourceGeo.setAttribute("position", new THREE.BufferAttribute(sourcePositions, 3));
    sourceGeo.setAttribute("color", new THREE.BufferAttribute(sourceColors, 3));
    sourceGeo.setIndex(sourceIndex);
    const sourceMesh = new THREE.Mesh(sourceGeo, new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1,
        polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    }));
    // same value range + colour stops the boundary wall currently uses (the
    // north wall's own, not a shared four-wall range -- see wallColors) --
    // only the structure differs between the two views, not the palette.
    const NORTH_WALL_RANGES = { temp: wallFieldRange(WALLS.north.temp), salt: wallFieldRange(WALLS.north.salt) };
    function paintSourceSlice(key) {
        const field = key === "salt" ? GLORYS_SALT_NORTH : GLORYS_TEMP_NORTH;
        const [lo, hi] = NORTH_WALL_RANGES[key];
        const stops = BOUNDARY_FIELDS[key].stops;
        const col = sourceGeo.attributes.color;
        sourceCells.forEach((cellIdx, q) => {
            const c = colormap((field[cellIdx] - lo) / (hi - lo || 1), stops);
            const vo = q * 4;
            for (let v = 0; v < 4; v++) col.setXYZ(vo + v, c.r, c.g, c.b);
        });
        col.needsUpdate = true;
    }
    paintSourceSlice("temp");
    boundaryGroup.add(sourceMesh); // inherits fade + step retirement for free, same as the walls

    function setBoundaryField(key) {
        if (!BOUNDARY_FIELDS[key]) return;
        boundaryFieldKey = key;
        boundaryWallMeshes.forEach((mesh) => {
            mesh.geometry.setAttribute("color", new THREE.BufferAttribute(wallColors(mesh.userData.spec, key), 3));
        });
        if (key === "temp" || key === "salt") paintSourceSlice(key);
        else if (boundarySourceOn) setBoundarySource(false); // no source slice for current speed -- drop back to the wall view
        const buttons = document.getElementById("boundary-field-buttons");
        if (buttons) Array.from(buttons.children).forEach((b) => b.classList.toggle("active", b.dataset.key === key));
    }

    // -- Source slice crossfade machinery: kept so the GLORYS slice mesh
    // still compiles and can be driven from __debug, but the in-step
    // "Source" toggle button (and its goTo reset / detail-text swap) that
    // used to drive it from the card is gone -- the boundary step's card
    // now shows only Temperature/Salinity/Current speed. Independent of the
    // per-step fade system above -- that one only drives the whole boundary
    // step in/out together; this mirrors its lerp-toward-target approach at
    // a finer grain, inside the step, and is combined with the step's own
    // fade fraction each frame (see updateBoundarySourceFade) so retiring
    // the step still fades everything out together regardless of which view
    // was showing.
    let boundarySourceOn = false;
    let sourceProgress = 0; // 0 = walls, 1 = source slice
    const SOURCE_FADE_DURATION = 0.6;
    function setBoundarySource(on) {
        if (on && boundaryFieldKey === "speed") return; // no source slice for current speed
        boundarySourceOn = on;
    }
    function updateBoundarySourceFade(dt) {
        const target = boundarySourceOn ? 1 : 0;
        if (sourceProgress !== target) {
            const dir = target > sourceProgress ? 1 : -1;
            sourceProgress += dir * (dt / SOURCE_FADE_DURATION);
            if ((dir > 0 && sourceProgress > target) || (dir < 0 && sourceProgress < target)) sourceProgress = target;
        }
        const groupInfo = fadeInfo.get(boundaryGroup);
        const groupFrac = groupInfo ? groupInfo.current : (boundaryGroup.visible ? 1 : 0);
        boundaryWallMeshes.forEach((m) => { m.material.opacity = groupFrac * (1 - sourceProgress); });
        sourceMesh.material.opacity = groupFrac * sourceProgress;
    }

    const boundaryFieldEl = document.getElementById("boundary-field-buttons");
    if (boundaryFieldEl) {
        Object.entries(BOUNDARY_FIELDS).forEach(([key, f]) => {
            const btn = document.createElement("button");
            btn.textContent = f.label;
            btn.dataset.key = key;
            btn.className = key === boundaryFieldKey ? "active" : "";
            btn.addEventListener("click", () => setBoundaryField(key));
            boundaryFieldEl.appendChild(btn);
        });
    }
    scene.add(boundaryGroup);

    // -- the ocean surface: ONE mesh, reused and repainted by every step that
    // drapes a real state onto the sea surface (climatology here, weather
    // later) rather than each step holding its own copy at its own height.
    // "Weather above" replaces whatever's showing here when we get to it --
    // it doesn't float a second surface on top. Its switcher is the same
    // two options as the boundary step -- same climatology pipeline.
    const SURFACE_Y = -1.2; // just below y=0 so it doesn't z-fight the land plateau
    const surfaceGeo = buildGridGeometry();
    // BufferGeometry.setIndex only auto-wraps a plain Array into a
    // BufferAttribute -- a typed array passed directly is treated as already
    // being one and breaks, so convert explicitly rather than just slice().
    const surfaceFullIndex = Array.from(surfaceGeo.index.array); // the standard full-fill triangulation, for weather
    // climatology instead gets a hole matching the nudging ramp: it's a flat,
    // near-opaque sheet, and it completely hid the depth-following border
    // sitting below it (confirmed: toggling the border changed nothing on
    // screen until this). Cutting a matching hole lets the border show
    // through where it actually is, instead of competing for the same pixels.
    const surfaceHoleIndex = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i, b = j * NX + i + 1, c = (j + 1) * NX + i, d = (j + 1) * NX + i + 1;
        if (!nudgInRamp[a] && !nudgInRamp[b] && !nudgInRamp[c] && !nudgInRamp[d]) surfaceHoleIndex.push(a, b, c, b, d, c);
    }
    // the initial-state drape is an OCEAN surface (unlike weather, which
    // legitimately covers land): cut land cells and any shelf shallow enough
    // to rise above the drape plane, where a flat sheet would otherwise
    // knife visibly through the coastal terrain.
    const surfaceIniIndex = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i, b = j * NX + i + 1, c = (j + 1) * NX + i, d = (j + 1) * NX + i + 1;
        const ok = (k) => MASK[k] >= 0.5 && depthToY(H[k]) < SURFACE_Y - 0.2;
        if (ok(a) && ok(b) && ok(c) && ok(d)) surfaceIniIndex.push(a, b, c, b, d, c);
    }
    const surfaceMesh = new THREE.Mesh(surfaceGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    surfaceMesh.position.y = SURFACE_Y;
    surfaceMesh.visible = false;
    scene.add(surfaceMesh);

    function setSurfaceField(source, key, buttonsElId) {
        const f = source[key];
        if (!f) return;
        surfaceMesh.geometry.setIndex(
            source === CLIM_FIELDS ? surfaceHoleIndex
                : source === INI_FIELDS ? surfaceIniIndex
                    : surfaceFullIndex);
        paintField(surfaceMesh.geometry, f.field, f.range, f.stops);
        const buttons = document.getElementById(buttonsElId);
        if (buttons) Array.from(buttons.children).forEach(b => b.classList.toggle("active", b.dataset.key === key));
    }
    let lastVolumeField = { source: CLIM_FIELDS, key: "temp", buttonsElId: "clim-field-buttons" };
    let lastMeteoField = { source: METEO_FIELDS, key: "pair", buttonsElId: "meteo-field-buttons" };
    function setClimField(key) {
        lastVolumeField = { source: CLIM_FIELDS, key, buttonsElId: "clim-field-buttons" };
        setSurfaceField(CLIM_FIELDS, key, "clim-field-buttons");
    }
    function setMeteoField(key) {
        lastMeteoField = { source: METEO_FIELDS, key, buttonsElId: "meteo-field-buttons" };
        setSurfaceField(METEO_FIELDS, key, "meteo-field-buttons");
    }
    function makeFieldButtons(elId, fields, activeKey, onPick) {
        const el = document.getElementById(elId);
        if (!el) return;
        Object.entries(fields).forEach(([key, f]) => {
            const btn = document.createElement("button");
            btn.textContent = f.label;
            btn.dataset.key = key;
            btn.className = key === activeKey ? "active" : "";
            btn.addEventListener("click", () => onPick(key));
            el.appendChild(btn);
        });
    }
    makeFieldButtons("clim-field-buttons", CLIM_FIELDS, "temp", setClimField);
    setClimField("temp");

    // -- interior nudging is a 3D border, not a flat interior fill or a bare
    // horizontal shelf. Reading the raw coefficient directly (not
    // reconstructing it) shows why: 1/day at the open-boundary wall, decaying
    // linearly to a 0.001/day floor by ~39 cells in (~195 km), then dead flat
    // everywhere else -- the "interior" is a red herring, it's a border
    // effect with the same footprint as the boundary curtains. So this
    // builds an actual hollow frame sitting on the seafloor: a wall at the
    // true domain edge (full depth, coincides with the boundary curtains), a
    // floor that reaches inward across the ramp cells following real
    // bathymetry, and a second wall at the ramp's inner edge closing it off
    // -- nothing is drawn past that inner wall, into the interior. The
    // coefficient is vertically uniform (verified: same value at all 50
    // sigma levels), so each wall's colour is constant top-to-bottom, which
    // is the honest shape, not a missing feature.
    const NUDG_BORDER_LIFT = 6; // world units the floor sits above the seafloor -- reads as a distinct shelf, not paint on the terrain
    const NUDG_PULSE_PERIOD = 7; // seconds per cycle -- a display exaggeration only

    // brightness pulse whose PHASE (not rate) is set by each cell's own
    // coefficient, so at any instant the outer wall (strong pull, phase ~0)
    // and the inner wall (weak pull, phase ~pi) are lit at different points
    // in the same cycle -- reads as a pulse of "pull" travelling from the
    // open boundary inward. Real relaxation timescales span 1 to 1000 days;
    // this compresses the whole range into one repeating cycle for
    // legibility (like the tide step's compressed period).
    const [nudgLo, nudgHi] = nudgTracerRange;
    const nudgBaseColors = new Float32Array(NY * NX * 3);
    const nudgPhaseCos = new Float32Array(NY * NX), nudgPhaseSin = new Float32Array(NY * NX);
    const nudgBorderIndices = [];
    for (let k = 0; k < NY * NX; k++) {
        if (MASK[k] < 0.5) {
            nudgBaseColors[k * 3] = LAND_COLOR.r; nudgBaseColors[k * 3 + 1] = LAND_COLOR.g; nudgBaseColors[k * 3 + 2] = LAND_COLOR.b;
            nudgPhaseCos[k] = 1; nudgPhaseSin[k] = 0;
            continue;
        }
        const norm = (nudgTracerLog[k] - nudgLo) / (nudgHi - nudgLo || 1);
        const c = colormap(norm, NUDG_STOPS);
        nudgBaseColors[k * 3] = c.r; nudgBaseColors[k * 3 + 1] = c.g; nudgBaseColors[k * 3 + 2] = c.b;
        const phase = norm * Math.PI; // strong pull (norm~1) leads; weak pull (norm~0) trails by up to half a cycle
        nudgPhaseCos[k] = Math.cos(phase); nudgPhaseSin[k] = Math.sin(phase);
        if (nudgInRamp[k]) nudgBorderIndices.push(k);
    }

    // floor + roof: terrain-following fill at the seafloor, and a flat cap
    // at the sea surface, both restricted to cells still inside the real
    // ramp -- together with the two walls below, these close the frame into
    // an actual box, not an open-topped trench.
    function buildNudgCapGeometry(yOf) {
        const positions = new Float32Array(NY * NX * 3);
        const colors = new Float32Array(NY * NX * 3);
        for (let k = 0; k < NY * NX; k++) {
            positions[k * 3] = gridX[k];
            positions[k * 3 + 1] = yOf(k);
            positions[k * 3 + 2] = gridZ[k];
            colors[k * 3] = nudgBaseColors[k * 3]; colors[k * 3 + 1] = nudgBaseColors[k * 3 + 1]; colors[k * 3 + 2] = nudgBaseColors[k * 3 + 2];
        }
        const index = [];
        for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
            const a = j * NX + i, b = j * NX + i + 1, c = (j + 1) * NX + i, d = (j + 1) * NX + i + 1;
            // include the quad if any corner is still inside the ramp -- gives
            // a solid cap with no seams at its inner (wall-side) edge
            if (nudgInRamp[a] || nudgInRamp[b] || nudgInRamp[c] || nudgInRamp[d]) index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.setIndex(index);
        geo.computeVertexNormals();
        return geo;
    }
    function buildNudgCapMesh(yOf) {
        // polygonOffset makes sure this wins the depth test against the
        // terrain/boundary geometry it sits right against -- two large,
        // nearly-coincident transparent surfaces otherwise sort ambiguously
        // (same issue as tide-vs-boundary-curtain), which made the floor
        // nearly invisible in testing. MeshBasicMaterial (unlit), matching
        // the walls -- Lambert shading was dimming the roof specifically,
        // since a perfectly flat upward-facing surface only picks up
        // whatever the scene lights give it, unlike the walls/terrain whose
        // varied normals catch light more evenly.
        // offset -8 (not -16, same as the tide ribbon below) -- both are
        // visible together from the "tides" step onward, sitting near the
        // same wall; equal offsets tie in the depth buffer and flicker.
        // Magnitude widened 4x from the original -2/-4 pair (see buildWall)
        // so the separation survives grazing view angles, not just top-down.
        return new THREE.Mesh(buildNudgCapGeometry(yOf), new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
            polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
        }));
    }
    const nudgFloorMesh = buildNudgCapMesh(k => (MASK[k] < 0.5 ? 0 : depthToY(H[k])) + NUDG_BORDER_LIFT);
    const nudgRoofMesh = buildNudgCapMesh(() => 0);
    const nudgCapMeshes = [nudgFloorMesh, nudgRoofMesh];

    // outer/inner walls: full-depth curtains (surface to seafloor), same N50-
    // row grid layout as the boundary curtains (buildWall) -- needed now
    // because these walls can show real depth-varying climatology, not just
    // the (vertically uniform) coefficient. Outer sits at the true domain
    // edge -- literally the same row/column the boundary curtains use, so it
    // reads as that curtain tinted with whichever mode is active (same
    // polygonOffset trick used for the tide ribbon, to win the depth test
    // against the coincident boundary curtain beneath it). Inner sits at
    // each side's ramp margin, closing the frame so nothing is drawn past it.
    function nudgWallK(axis, fixedIdx) {
        return axis === "ns" ? (idx) => fixedIdx * NX + idx : (idx) => idx * NX + fixedIdx;
    }
    const NUDG_WALLS = [
        { kOf: nudgWallK("ns", 0), n: NX, clim: NUDG_CLIM_WALLS.southOuter },                          // south, outer
        { kOf: nudgWallK("ns", NY - 1), n: NX, clim: NUDG_CLIM_WALLS.northOuter },                     // north, outer
        { kOf: nudgWallK("ew", 0), n: NY, clim: NUDG_CLIM_WALLS.westOuter },                           // west, outer
        { kOf: nudgWallK("ew", NX - 1), n: NY, clim: NUDG_CLIM_WALLS.eastOuter },                      // east, outer
        { kOf: nudgWallK("ns", NUDG_MARGIN_SOUTH), n: NX, clim: NUDG_CLIM_WALLS.southInner },          // south, inner
        { kOf: nudgWallK("ns", NY - 1 - NUDG_MARGIN_NORTH), n: NX, clim: NUDG_CLIM_WALLS.northInner }, // north, inner
        { kOf: nudgWallK("ew", NUDG_MARGIN_WEST), n: NY, clim: NUDG_CLIM_WALLS.westInner },            // west, inner
        { kOf: nudgWallK("ew", NX - 1 - NUDG_MARGIN_EAST), n: NY, clim: NUDG_CLIM_WALLS.eastInner },   // east, inner
    ];
    function buildNudgWallMesh(kOf, n, clim) {
        const positions = new Float32Array(n * BND_N_SRHO * 3);
        for (let s = 0; s < BND_N_SRHO; s++) {
            const frac = s / (BND_N_SRHO - 1);
            for (let idx = 0; idx < n; idx++) {
                const k = kOf(idx);
                const yBot = MASK[k] < 0.5 ? 0 : depthToY(H[k]);
                const vi = (s * n + idx) * 3;
                positions[vi] = gridX[k]; positions[vi + 1] = THREE.MathUtils.lerp(yBot, 0, frac); positions[vi + 2] = gridZ[k];
            }
        }
        const index = [];
        for (let s = 0; s < BND_N_SRHO - 1; s++) for (let idx = 0; idx < n - 1; idx++) {
            const a = s * n + idx, b = s * n + idx + 1, c = (s + 1) * n + idx, d = (s + 1) * n + idx + 1;
            index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * BND_N_SRHO * 3), 3));
        geo.setIndex(index);
        // offset -8, not -16 (see buildNudgCapMesh) -- avoids tying with the
        // tide ribbon's -16 where the outer wall is coincident with it.
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
            polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
        }));
        mesh.userData = { kOf, n, clim };
        return mesh;
    }
    const nudgWallMeshes = NUDG_WALLS.map(({ kOf, n, clim }) => buildNudgWallMesh(kOf, n, clim));
    const nudgBorderGroup = new THREE.Group();
    nudgCapMeshes.forEach(m => nudgBorderGroup.add(m));
    nudgWallMeshes.forEach(m => nudgBorderGroup.add(m));
    nudgBorderGroup.visible = false;
    scene.add(nudgBorderGroup);

    // -- toggle between "how hard it pulls" (the coefficient, animated) and
    // "what it pulls toward" (climatology temp/salt, a static snapshot --
    // real ocean stratification doesn't need a pulse to read as alive).
    let nudgDisplayMode = "coef";
    // per-mode lookup so wall/cap painting isn't a hardcoded temp/salt binary
    // -- capField is the surface-only array the caps share (see the caps
    // comment below); wallKey picks the matching field off each wall's clim.
    const NUDG_CLIM_META = {
        temp: { wallKey: "temp", capField: CLIM_TEMP, range: NUDG_CLIM_TEMP_RANGE, stops: WARM_STOPS },
        salt: { wallKey: "salt", capField: CLIM_SALT, range: NUDG_CLIM_SALT_RANGE, stops: SALT_STOPS },
        speed: { wallKey: "speed", capField: CLIM_SPEED, range: NUDG_CLIM_SPEED_RANGE, stops: WIND_SPEED_STOPS },
    };
    function paintNudgWallClim(mesh, key) {
        const { n, clim } = mesh.userData;
        const meta = NUDG_CLIM_META[key];
        const arr = clim[meta.wallKey];
        const [lo, hi] = meta.range;
        const col = mesh.geometry.attributes.color;
        for (let s = 0; s < BND_N_SRHO; s++) for (let idx = 0; idx < n; idx++) {
            const vi = s * n + idx;
            const c = colormap((arr[vi] - lo) / (hi - lo || 1), meta.stops);
            col.setXYZ(vi, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }
    // floor and roof both use the same surface climatology (floor sits at
    // the seafloor but is *coloured* by what's at the top of the ramp
    // profile, same simplification the rest of the app already makes --
    // climatology is a full depth profile, this shows its surface).
    function paintNudgCapClim(mesh, key) {
        const meta = NUDG_CLIM_META[key];
        const arr = meta.capField;
        const [lo, hi] = meta.range;
        const col = mesh.geometry.attributes.color;
        for (let k = 0; k < NY * NX; k++) {
            if (MASK[k] < 0.5) { col.setXYZ(k, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b); continue; }
            const c = colormap((arr[k] - lo) / (hi - lo || 1), meta.stops);
            col.setXYZ(k, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }
    const NUDG_MODE_FIELDS = { coef: { label: "Pull strength" }, temp: { label: "Temperature" }, salt: { label: "Salinity" }, speed: { label: "Current speed" } };
    function setNudgDisplayMode(key) {
        if (!NUDG_MODE_FIELDS[key]) return;
        nudgDisplayMode = key;
        if (key === "coef") {
            // static base paint now; the per-frame pulse (gated on
            // nudgDisplayMode below) takes over from here every frame
            nudgCapMeshes.forEach((mesh) => {
                const col = mesh.geometry.attributes.color;
                for (let k = 0; k < NY * NX; k++) col.setXYZ(k, nudgBaseColors[k * 3], nudgBaseColors[k * 3 + 1], nudgBaseColors[k * 3 + 2]);
                col.needsUpdate = true;
            });
        } else {
            nudgCapMeshes.forEach((mesh) => paintNudgCapClim(mesh, key));
            nudgWallMeshes.forEach((mesh) => paintNudgWallClim(mesh, key));
        }
        const buttons = document.getElementById("nudg-mode-buttons");
        if (buttons) Array.from(buttons.children).forEach(b => b.classList.toggle("active", b.dataset.key === key));
    }
    makeFieldButtons("nudg-mode-buttons", NUDG_MODE_FIELDS, "temp", setNudgDisplayMode);
    setNudgDisplayMode("temp");

    let nudgClock = 0;
    function updateNudgBorderPulse(dt) {
        nudgClock += dt;
        const omega = (2 * Math.PI) / NUDG_PULSE_PERIOD;
        const cosWt = Math.cos(omega * nudgClock), sinWt = Math.sin(omega * nudgClock);
        const brightness = (k) => 0.7 + 0.3 * (cosWt * nudgPhaseCos[k] + sinWt * nudgPhaseSin[k]); // floor raised from 0.1 to 0.4 -- the old dip read as "too dark"
        nudgCapMeshes.forEach((mesh) => {
            const col = mesh.geometry.attributes.color.array;
            for (const k of nudgBorderIndices) {
                const bright = brightness(k), idx = k * 3;
                col[idx] = nudgBaseColors[idx] * bright;
                col[idx + 1] = nudgBaseColors[idx + 1] * bright;
                col[idx + 2] = nudgBaseColors[idx + 2] * bright;
            }
            mesh.geometry.attributes.color.needsUpdate = true;
        });
        nudgWallMeshes.forEach((mesh) => {
            const { kOf, n } = mesh.userData;
            const col = mesh.geometry.attributes.color.array;
            for (let idx = 0; idx < n; idx++) {
                const k = kOf(idx), bright = brightness(k);
                const cr = nudgBaseColors[k * 3] * bright, cg = nudgBaseColors[k * 3 + 1] * bright, cb = nudgBaseColors[k * 3 + 2] * bright;
                for (let s = 0; s < BND_N_SRHO; s++) {
                    const vi = (s * n + idx) * 3;
                    col[vi] = cr; col[vi + 1] = cg; col[vi + 2] = cb;
                }
            }
            mesh.geometry.attributes.color.needsUpdate = true;
        });
    }

    // -- tides step: animated M2 wave along the open boundary, where it's
    // actually specified. tide_Eamp/Ephase are ~zero through the interior --
    // tides enter ROMS as a boundary condition (elevation + phase at the four
    // walls), not a body force, and the model's own dynamics produce the
    // interior response from that, the same principle as the GLORYS boundary
    // state. A flat interior drape would have implied a field that was never
    // actually given to the model, so this animates the real amplitude/phase
    // along the boundary instead, reusing the wall layout from that step.
    const TIDE_EXAG = 20; // world units at peak amplitude -- normalized per constituent (see below), a display exaggeration only
    const tideWaveRGB = toRGB(TIDE_WAVE_STOPS);
    // demo cycle length scales with the constituent's real period (M4 spins
    // fastest, Mf/Mm slowest) but is clamped to stay watchable -- Mf/Mm's real
    // periods (13.7d, 27.6d) would otherwise render as effectively frozen.
    let tideKey = "M2";
    let tideAmp = TIDE_CONSTITUENTS[tideKey].amp;
    let tideAmpMax = TIDE_CONSTITUENTS[tideKey].range[1] || 1e-6;
    let tideCosPhi = TIDE_CONSTITUENTS[tideKey].cosPhi;
    let tideSinPhi = TIDE_CONSTITUENTS[tideKey].sinPhi;
    let tideDemoPeriod = 9;
    function setTideConstituent(key) {
        if (!TIDE_CONSTITUENTS[key]) return;
        tideKey = key;
        const c = TIDE_CONSTITUENTS[key];
        tideAmp = c.amp;
        tideAmpMax = c.range[1] || 1e-6;
        tideCosPhi = c.cosPhi;
        tideSinPhi = c.sinPhi;
        tideDemoPeriod = Math.min(22, Math.max(4, 9 * (TIDE_PERIOD_HOURS[TIDE_NAMES.indexOf(key)] / 12.4206012)));
        const select = document.getElementById("tide-constituent-select");
        if (select) select.value = key;
    }
    const WALL_K = {
        north: (idx) => (NY - 1) * NX + idx,
        south: (idx) => idx,
        east: (idx) => idx * NX + (NX - 1),
        west: (idx) => idx * NX,
    };
    function buildTideWall(name, spec) {
        const n = spec.along.length;
        const positions = new Float32Array(n * 2 * 3);
        const colors = new Float32Array(n * 2 * 3);
        const index = [];
        for (let i = 0; i < n; i++) {
            const [x, z] = spec.axis === "ns"
                ? lonLatToXZ(spec.along[i], spec.fixed, lonMid, latMid)
                : lonLatToXZ(spec.fixed, spec.along[i], lonMid, latMid);
            positions[i * 6] = x; positions[i * 6 + 1] = 0; positions[i * 6 + 2] = z;
            positions[i * 6 + 3] = x; positions[i * 6 + 4] = 0; positions[i * 6 + 5] = z;
        }
        for (let i = 0; i < n - 1; i++) {
            const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
            index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.setIndex(index);
        // polygonOffset pulls this mesh slightly forward in the depth buffer
        // only -- it sits at the true wall coordinates (no world-space offset)
        // but wins the z-fight against the coplanar boundary-curtain mesh.
        // -16, widened 4x along with the rest of the stack (see buildWall)
        // for grazing-angle headroom.
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
            polygonOffset: true, polygonOffsetFactor: -16, polygonOffsetUnits: -16,
        }));
        mesh.userData = { kOf: WALL_K[name], n };
        return mesh;
    }
    const tideWallGroup = new THREE.Group();
    Object.entries(WALLS).forEach(([name, spec]) => tideWallGroup.add(buildTideWall(name, spec)));
    tideWallGroup.position.y = 0;
    tideWallGroup.visible = false;
    scene.add(tideWallGroup);
    let tideClock = 0;
    const tideCol = [0, 0, 0];
    function updateTide(dt) {
        tideClock += dt;
        const omega = (2 * Math.PI) / tideDemoPeriod;
        const cosWt = Math.cos(omega * tideClock), sinWt = Math.sin(omega * tideClock);
        tideWallGroup.children.forEach((mesh) => {
            const { kOf, n } = mesh.userData;
            const pos = mesh.geometry.attributes.position.array;
            const col = mesh.geometry.attributes.color.array;
            for (let i = 0; i < n; i++) {
                const k = kOf(i);
                if (MASK[k] < 0.5) {
                    pos[i * 6 + 4] = 0;
                    col[i * 6] = LAND_COLOR.r; col[i * 6 + 1] = LAND_COLOR.g; col[i * 6 + 2] = LAND_COLOR.b;
                    col[i * 6 + 3] = LAND_COLOR.r; col[i * 6 + 4] = LAND_COLOR.g; col[i * 6 + 5] = LAND_COLOR.b;
                    continue;
                }
                // baseline row (index i*6+1) stays at the sea surface; the second
                // row (i*6+4) rides the wave, so the ribbon's height *is* the
                // instantaneous elevation -- it visibly flattens to nothing at
                // amphidromic points instead of just changing colour. Height and
                // colour both use elev normalized by THIS constituent's own peak
                // amplitude -- without that, weak constituents (Mf, Mm, M4) would
                // barely move next to strong ones (M2, S2) at a shared world scale.
                const elev = tideAmp[k] * (cosWt * tideCosPhi[k] + sinWt * tideSinPhi[k]);
                const ratio = Math.max(-1, Math.min(1, elev / tideAmpMax));
                pos[i * 6 + 4] = ratio * TIDE_EXAG;
                // colour uses a sqrt-stretched magnitude, not the raw ratio -- most
                // boundary points have far smaller amplitude than the few resonant
                // hotspots that set tideAmpMax, so a linear scale reads as flat
                // white almost everywhere. Perceptual stretch, still monotonic,
                // still zero at zero.
                const stretched = Math.sign(ratio) * Math.sqrt(Math.abs(ratio));
                fastColormap((stretched + 1) / 2, tideWaveRGB, tideCol);
                const glow = Math.abs(stretched) * 0.28;
                const r = Math.min(1, tideCol[0] + glow), g = Math.min(1, tideCol[1] + glow), b = Math.min(1, tideCol[2] + glow);
                col[i * 6] = r; col[i * 6 + 1] = g; col[i * 6 + 2] = b;
                col[i * 6 + 3] = r; col[i * 6 + 4] = g; col[i * 6 + 5] = b;
            }
            mesh.geometry.attributes.position.needsUpdate = true;
            mesh.geometry.attributes.color.needsUpdate = true;
        });
    }
    const tideSelectEl = document.getElementById("tide-constituent-select");
    if (tideSelectEl) {
        TIDE_NAMES.forEach((name) => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = TIDE_CONSTITUENTS[name].label;
            tideSelectEl.appendChild(opt);
        });
        tideSelectEl.value = tideKey;
        tideSelectEl.addEventListener("change", () => setTideConstituent(tideSelectEl.value));
    }

    // -- rivers step ----------------------------------------------------
    const riverGroup = new THREE.Group();
    const maxTransport = Math.max(...RIVERS.map(r => r.transport));
    RIVERS.forEach(r => {
        const radius = 0.6 + 2.2 * Math.sqrt(r.transport / maxTransport);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), new THREE.MeshBasicMaterial({ color: 0x4fa8ff, transparent: true, opacity: 1 }));
        const [x, z] = lonLatToXZ(r.lon, r.lat, lonMid, latMid);
        mesh.position.set(x, 2, z);
        mesh.userData = { kind: "river", river: r };
        riverGroup.add(mesh);
    });
    riverGroup.visible = false;
    scene.add(riverGroup);

    // -- meteo step: the weather field switches on the SAME surface mesh the
    // volume step painted (climatology/nudging) -- when we arrive here it
    // cleanly replaces whatever was showing, it doesn't add a second drape
    // above it. See setMeteoField/makeFieldButtons wiring near surfaceMesh.
    makeFieldButtons("meteo-field-buttons", METEO_FIELDS, "pair", setMeteoField);

    // downsampled wind lookup for cheap per-particle sampling
    const FIELD_W = 180, FIELD_H = Math.round((FIELD_W * NY) / NX);
    const fieldU = new Float32Array(FIELD_W * FIELD_H), fieldV = new Float32Array(FIELD_W * FIELD_H);
    const fieldValid = new Uint8Array(FIELD_W * FIELD_H);
    for (let fy = 0; fy < FIELD_H; fy++) for (let fx = 0; fx < FIELD_W; fx++) {
        const i = Math.min(NX - 1, Math.floor((fx / FIELD_W) * NX));
        const j = Math.min(NY - 1, Math.floor((fy / FIELD_H) * NY));
        const k = j * NX + i, f = fy * FIELD_W + fx;
        fieldU[f] = uwind[k]; fieldV[f] = vwind[k]; fieldValid[f] = MASK[k] >= 0.5 ? 1 : 0;
    }
    // fy increases with j, i.e. with latitude -- fy=0 is south, fy=FIELD_H-1 is north.
    // Bilinear, not nearest-cell -- this is what keeps the streaks curving
    // smoothly instead of kinking at field-cell boundaries.
    function sampleWind(fx, fy) {
        if (fx < 0 || fx >= FIELD_W - 1 || fy < 0 || fy >= FIELD_H - 1) return null;
        const i0 = fx | 0, j0 = fy | 0, i1 = i0 + 1, j1 = j0 + 1, tx = fx - i0, ty = fy - j0;
        const f00 = j0 * FIELD_W + i0, f10 = j0 * FIELD_W + i1, f01 = j1 * FIELD_W + i0, f11 = j1 * FIELD_W + i1;
        if (!fieldValid[f00] || !fieldValid[f10] || !fieldValid[f01] || !fieldValid[f11]) return null;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        return [
            fieldU[f00] * w00 + fieldU[f10] * w10 + fieldU[f01] * w01 + fieldU[f11] * w11,
            fieldV[f00] * w00 + fieldV[f10] * w10 + fieldV[f01] * w01 + fieldV[f11] * w11,
        ];
    }

    const flowCanvas = document.createElement("canvas");
    // higher multiplier than the other drapes -- at 3x this looked blobby/like
    // rain up close (a stroke barely wider than one texture pixel), not the
    // fine hairline nullschool streaks. 6x gives real sub-strand resolution.
    flowCanvas.width = FIELD_W * 6; flowCanvas.height = FIELD_H * 6;
    const flowCtx = flowCanvas.getContext("2d"); // starts fully transparent -- swrad shows through until trails are drawn
    const flowTexture = new THREE.CanvasTexture(flowCanvas);
    flowTexture.minFilter = THREE.LinearFilter;
    flowTexture.colorSpace = THREE.SRGBColorSpace;

    // quad spanning the exact domain bbox, at the same world coords/orientation
    // every other layer uses -- uv (0,0) is the south-west corner (lonLo,latLo).
    // Sits just above the shared ocean-surface mesh (not floating way above
    // it) so the wind reads as being on the surface, not a separate deck.
    const WIND_PLANE_Y = SURFACE_Y + 0.6;
    const swXZ = lonLatToXZ(lonLo, latLo, lonMid, latMid), seXZ = lonLatToXZ(lonHi, latLo, lonMid, latMid);
    const nwXZ = lonLatToXZ(lonLo, latHi, lonMid, latMid), neXZ = lonLatToXZ(lonHi, latHi, lonMid, latMid);
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        swXZ[0], WIND_PLANE_Y, swXZ[1], seXZ[0], WIND_PLANE_Y, seXZ[1], nwXZ[0], WIND_PLANE_Y, nwXZ[1],
        seXZ[0], WIND_PLANE_Y, seXZ[1], neXZ[0], WIND_PLANE_Y, neXZ[1], nwXZ[0], WIND_PLANE_Y, nwXZ[1],
    ]), 3));
    flowGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), 2));
    const windPlane = new THREE.Mesh(flowGeo, new THREE.MeshBasicMaterial({ map: flowTexture, transparent: true, opacity: 0.95, depthWrite: false }));

    const N_PARTICLES = 4500;
    const particles = new Float32Array(N_PARTICLES * 2); // fx, fy
    function resetParticle(p) {
        for (let tries = 0; tries < 30; tries++) {
            const fx = Math.random() * FIELD_W, fy = Math.random() * FIELD_H;
            if (sampleWind(fx, fy)) { particles[p * 2] = fx; particles[p * 2 + 1] = fy; return; }
        }
        particles[p * 2] = FIELD_W / 2; particles[p * 2 + 1] = FIELD_H / 2;
    }
    for (let p = 0; p < N_PARTICLES; p++) resetParticle(p);

    const VELOCITY_SCALE = 1.8; // field-pixels per (m/s * second) -- tuned to read as flow, not a data value
    const windBucketRGB = toRGB(WIND_SPEED_STOPS);
    const N_BUCKETS = windBucketRGB.length - 1;
    const bucketPaths = Array.from({ length: N_BUCKETS }, () => new Path2D());
    const bucketStyles = Array.from({ length: N_BUCKETS }, (_, b) => {
        const c = [0, 0, 0];
        fastColormap((b + 0.5) / N_BUCKETS, windBucketRGB, c);
        return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    });
    function updateWindParticles(dt) {
        // erode existing alpha toward transparent (destination-in), rather than
        // painting toward black -- this is what makes it read as fading trails
        // over the shortwave drape instead of trails over an opaque black plate.
        flowCtx.globalCompositeOperation = "destination-in";
        flowCtx.fillStyle = "rgba(0,0,0,0.95)";
        flowCtx.fillRect(0, 0, flowCanvas.width, flowCanvas.height);
        flowCtx.globalCompositeOperation = "source-over";
        const sx = flowCanvas.width / FIELD_W, sy = flowCanvas.height / FIELD_H;
        for (let b = 0; b < N_BUCKETS; b++) bucketPaths[b] = new Path2D();
        for (let p = 0; p < N_PARTICLES; p++) {
            const fx = particles[p * 2], fy = particles[p * 2 + 1];
            const v = sampleWind(fx, fy);
            if (!v) { resetParticle(p); continue; }
            const nfx = fx + v[0] * VELOCITY_SCALE * dt, nfy = fy + v[1] * VELOCITY_SCALE * dt;
            if (!sampleWind(nfx, nfy)) { resetParticle(p); continue; }
            particles[p * 2] = nfx; particles[p * 2 + 1] = nfy;
            const spd = Math.hypot(v[0], v[1]);
            const bucket = Math.min(N_BUCKETS - 1, Math.floor((spd / 14) * N_BUCKETS));
            const path = bucketPaths[bucket];
            path.moveTo(fx * sx, fy * sy);
            path.lineTo(nfx * sx, nfy * sy);
            if (Math.random() < 0.006) resetParticle(p); // slow recycle keeps the field looking fresh
        }
        flowCtx.lineWidth = 1.4;
        flowCtx.lineCap = "round";
        flowCtx.globalAlpha = 0.8;
        for (let b = 0; b < N_BUCKETS; b++) { flowCtx.strokeStyle = bucketStyles[b]; flowCtx.stroke(bucketPaths[b]); }
        flowCtx.globalAlpha = 1;
        flowTexture.needsUpdate = true;
    }

    windPlane.visible = false;
    scene.add(windPlane);

    // -- initial state step: reuses the SAME shared surface mesh the
    // climatology/meteo steps repaint (see the "ocean surface" comment
    // above setSurfaceField) -- temp/salt/speed/ssh switch on it exactly
    // like the earlier steps' fields do, just a third source. The two
    // vertical curtains are new: full-depth slices through the domain
    // middle, the one place in this app where the water column's actual
    // sigma-level depths matter (temperature/salinity structure through the
    // pycnocline), so they use the model's real Vtransform=2 formula
    // (S_RHO/CS_R/HC, the same values ROMS itself used) instead of the
    // boundary walls' simpler even-frac lerp.
    function zSigmaY(hVal, zetaVal, levelIdx) {
        const Zo = (HC * S_RHO[levelIdx] + CS_R[levelIdx] * hVal) / (HC + hVal);
        const z = zetaVal + (zetaVal + hVal) * Zo; // ROMS convention: negative below the surface
        return depthToY(-z);
    }
    function buildIniSliceGeo(kOf, n) {
        const positions = new Float32Array(BND_N_SRHO * n * 3);
        const alongWater = new Uint8Array(n);
        for (let idx = 0; idx < n; idx++) {
            const k = kOf(idx);
            const water = MASK[k] >= 0.5;
            alongWater[idx] = water ? 1 : 0;
            const h = H[k], zeta = INI_ZETA[k];
            for (let s = 0; s < BND_N_SRHO; s++) {
                const vi = s * n + idx;
                positions[vi * 3] = gridX[k];
                // clamp everything (top sigma levels AND land columns) to just
                // below the surface drape plane -- the top rho level sits at
                // ~-2 m real depth, which is ABOVE the drape at SURFACE_Y, so
                // unclamped slices poke through it and read as a dark cross
                // from overhead.
                const yCap = SURFACE_Y - 0.4;
                positions[vi * 3 + 1] = water ? Math.min(zSigmaY(h, zeta, s), yCap) : yCap;
                positions[vi * 3 + 2] = gridZ[k];
            }
        }
        const index = [];
        for (let s = 0; s < BND_N_SRHO - 1; s++) for (let idx = 0; idx < n - 1; idx++) {
            const a = s * n + idx, b = s * n + idx + 1, c = (s + 1) * n + idx, d = (s + 1) * n + idx + 1;
            index.push(a, b, c, b, d, c);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(BND_N_SRHO * n * 3), 3));
        geo.setIndex(index);
        return { geo, alongWater, n };
    }
    function sliceFieldRange(field, alongWater, n) {
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < field.length; k++) {
            if (!alongWater[k % n]) continue;
            if (field[k] < lo) lo = field[k];
            if (field[k] > hi) hi = field[k];
        }
        return [lo, hi];
    }
    function paintIniSlice(mesh, field, alongWater, n, stops) {
        const [lo, hi] = sliceFieldRange(field, alongWater, n);
        const col = mesh.geometry.attributes.color;
        for (let k = 0; k < field.length; k++) {
            if (!alongWater[k % n]) { col.setXYZ(k, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b); continue; }
            const c = colormap((field[k] - lo) / (hi - lo || 1), stops);
            col.setXYZ(k, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }
    const etaSlice = buildIniSliceGeo((i) => INI_SLICE_JROW * NX + i, NX);
    const xiSlice = buildIniSliceGeo((j) => j * NX + INI_SLICE_ICOL, NY);
    function makeIniSliceMaterial() {
        // offset -4, same tier as the boundary curtains -- these only ever
        // touch (not overlap) the boundary walls, at the two edge columns
        // where the slice line meets the domain edge, so grazing z-fight
        // risk is minor but the offset costs nothing to add for safety.
        return new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        });
    }
    const etaSliceMesh = new THREE.Mesh(etaSlice.geo, makeIniSliceMaterial());
    const xiSliceMesh = new THREE.Mesh(xiSlice.geo, makeIniSliceMaterial());
    const iniSliceGroup = new THREE.Group();
    iniSliceGroup.add(etaSliceMesh, xiSliceMesh);
    iniSliceGroup.visible = false;
    scene.add(iniSliceGroup);
    const INI_SLICE_STOPS = { temp: WARM_STOPS, salt: SALT_STOPS };
    function setIniSliceField(key) {
        const stops = INI_SLICE_STOPS[key];
        if (!stops) return;
        paintIniSlice(etaSliceMesh, INI_SLICES.eta[key], etaSlice.alongWater, etaSlice.n, stops);
        paintIniSlice(xiSliceMesh, INI_SLICES.xi[key], xiSlice.alongWater, xiSlice.n, stops);
    }
    let lastIniField = { source: INI_FIELDS, key: "temp", buttonsElId: "ini-field-buttons" };
    let iniSlicesApplicable = true; // false for speed/ssh -- those are surface-only, no slice data
    function setIniField(key) {
        if (!INI_FIELDS[key]) return;
        lastIniField = { source: INI_FIELDS, key, buttonsElId: "ini-field-buttons" };
        setSurfaceField(INI_FIELDS, key, "ini-field-buttons");
        iniSlicesApplicable = key === "temp" || key === "salt";
        if (iniSlicesApplicable) setIniSliceField(key);
        applyVisibility(); // re-derive slice visibility immediately if already on the "ini" step
    }
    makeFieldButtons("ini-field-buttons", INI_FIELDS, "temp", setIniField);

    // -- run-forward step: a DEDICATED lower-res mesh, not the shared
    // surfaceMesh -- FN frames x 4 fields of full-resolution per-vertex
    // colour would be wasteful to recompute on every switch. Colours are
    // decoded from the quantized bytes and cached ONCE per field (FN
    // Float32Array buffers, built lazily on first use), so playback and
    // field switching after that first hit is just an array copy +
    // needsUpdate -- no per-frame colour math.
    const FNY = FRAMES_NY, FNX = FRAMES_NX, FN = FRAMES_N, FCOUNT = FNY * FNX;
    const framesPositions = new Float32Array(FCOUNT * 3);
    for (let jf = 0; jf < FNY; jf++) for (let iff = 0; iff < FNX; iff++) {
        const k = (jf * FRAMES_SUB) * NX + (iff * FRAMES_SUB); // same subsample stride the server used
        const f = jf * FNX + iff;
        framesPositions[f * 3] = gridX[k]; framesPositions[f * 3 + 1] = 0; framesPositions[f * 3 + 2] = gridZ[k];
    }
    // land fully excluded from the triangulation (not painted grey) -- a
    // time-lapse of the ocean surface only, same hole-cutting technique the
    // climatology drape uses to expose the nudging border underneath it.
    const framesIndex = [];
    for (let jf = 0; jf < FNY - 1; jf++) for (let iff = 0; iff < FNX - 1; iff++) {
        const a = jf * FNX + iff, b = jf * FNX + iff + 1, c = (jf + 1) * FNX + iff, d = (jf + 1) * FNX + iff + 1;
        // cut shallow cells as well as land: where the shelf rises above the
        // drape plane a flat sheet would knife through the terrain (ugly from
        // any low angle), so the animated ocean simply ends at that contour.
        const deep = (ff) => {
            const kk = (Math.floor(ff / FNX) * FRAMES_SUB) * NX + ((ff % FNX) * FRAMES_SUB);
            return depthToY(H[kk]) < SURFACE_Y - 0.2;
        };
        if (FRAMES_MASK_ARR[a] && FRAMES_MASK_ARR[b] && FRAMES_MASK_ARR[c] && FRAMES_MASK_ARR[d]
            && deep(a) && deep(b) && deep(c) && deep(d)) framesIndex.push(a, b, c, b, d, c);
    }
    const framesGeo = new THREE.BufferGeometry();
    framesGeo.setAttribute("position", new THREE.BufferAttribute(framesPositions, 3));
    framesGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(FCOUNT * 3), 3));
    framesGeo.setIndex(framesIndex);
    const framesMesh = new THREE.Mesh(framesGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    framesMesh.position.y = SURFACE_Y;
    framesMesh.visible = false;
    scene.add(framesMesh);

    const framesColorCache = {}; // field key -> [Float32Array(FCOUNT*3) x FN], built on first use
    function framesToT01(key) {
        // every field except ssh maps its own byte range straight to
        // [0,1] -- (val-vmin)/span collapses to byte/255 exactly, since
        // that's how quantize_frames() built the byte in the first place.
        // ssh needs a range SYMMETRIC about zero (so ZETA_STOPS' white
        // middle stop lands on mean sea level), which differs from the
        // field's own [vmin,vmax], so that one case actually dequantizes.
        if (key !== "ssh") return (byte) => byte / 255;
        const [vmin, vmax] = FRAMES_FIELDS.ssh.range, span = (vmax - vmin) || 1;
        const m = Math.max(Math.abs(vmin), Math.abs(vmax)) || 1;
        return (byte) => ((vmin + (byte / 255) * span) + m) / (2 * m);
    }
    function buildFramesCache(key) {
        const raw = FRAMES_RAW[key], stopsRGB = toRGB(FRAMES_FIELDS[key].stops), toT01 = framesToT01(key);
        const cache = new Array(FN), tmp = [0, 0, 0];
        for (let t = 0; t < FN; t++) {
            const arr = new Float32Array(FCOUNT * 3), base = t * FCOUNT;
            for (let k = 0; k < FCOUNT; k++) {
                if (!FRAMES_MASK_ARR[k]) continue; // land -- excluded from the index, colour never sampled
                fastColormap(toT01(raw[base + k]), stopsRGB, tmp);
                arr[k * 3] = tmp[0]; arr[k * 3 + 1] = tmp[1]; arr[k * 3 + 2] = tmp[2];
            }
            cache[t] = arr;
        }
        return cache;
    }
    let framesFieldKey = "temp", framesDayIdx = 0, framesPlaying = false, framesElapsed = 0;
    // playback speed scales with frame count so a multi-year timelapse still
    // finishes in a reasonable time instead of taking the single-month pace
    // (~10 s) and stretching it out to minutes.
    const FRAMES_FPS = FN <= 40 ? 3 : Math.min(12, Math.max(6, Math.round(FN / 20)));
    function paintFramesFrame() {
        if (!framesColorCache[framesFieldKey]) framesColorCache[framesFieldKey] = buildFramesCache(framesFieldKey);
        framesGeo.attributes.color.array.set(framesColorCache[framesFieldKey][framesDayIdx]);
        framesGeo.attributes.color.needsUpdate = true;
    }
    function formatFramesDay(idx) {
        return (typeof FRAMES_DATES !== "undefined" && FRAMES_DATES[idx]) ? FRAMES_DATES[idx] : `frame ${idx + 1}`;
    }
    function updateFramesUI() {
        const slider = document.getElementById("frames-day-slider");
        if (slider) { slider.max = String(FN); slider.value = String(framesDayIdx + 1); }
        const label = document.getElementById("frames-day-label");
        if (label) label.textContent = formatFramesDay(framesDayIdx);
        const playBtn = document.getElementById("frames-play-btn");
        if (playBtn) playBtn.textContent = framesPlaying ? "Pause" : "Play";
    }
    function setFramesDay(idx) {
        framesDayIdx = Math.max(0, Math.min(FN - 1, idx));
        paintFramesFrame();
        updateFramesUI();
    }
    function setFramesField(key) {
        if (!FRAMES_FIELDS[key]) return;
        framesFieldKey = key;
        paintFramesFrame();
        const buttons = document.getElementById("frames-field-buttons");
        if (buttons) Array.from(buttons.children).forEach(b => b.classList.toggle("active", b.dataset.key === key));
    }
    function playFrames() { framesPlaying = true; updateFramesUI(); }
    function pauseFrames() { framesPlaying = false; updateFramesUI(); }
    paintFramesFrame(); // pre-warm temp/day-1 so the mesh isn't blank on first visit
    makeFieldButtons("frames-field-buttons", FRAMES_FIELDS, "temp", setFramesField);
    const framesSlider = document.getElementById("frames-day-slider");
    if (framesSlider) framesSlider.addEventListener("input", () => setFramesDay(parseInt(framesSlider.value, 10) - 1));
    const framesPlayBtn = document.getElementById("frames-play-btn");
    if (framesPlayBtn) framesPlayBtn.addEventListener("click", () => (framesPlaying ? pauseFrames() : playFrames()));
    updateFramesUI();

    // -- Argo check step: every float as a small orange marker (click target
    // + locator) plus a vertical difference-profile line at the float's own
    // lon/lat. The line IS the comparison: each vertex is coloured by MODEL
    // MINUS OBSERVED (tempAtObs/saltAtObs/sigAtObs -- the model interpolated
    // to the float's own observed pressure levels -- minus what the float
    // actually measured there), not the raw variable. Click handling lives
    // further down (near the river raycaster it reuses).
    const ARGO_DIFF_STOPS = ZETA_STOPS; // reuse the existing diverging blue-white-red ramp, already centred on zero
    const ARGO_LINE_HALF_WIDTH = 0.9; // world units either side of the float's lon/lat -- ~1.8 units wide overall (spec: ~1.5-2)
    const ARGO_MISSING_COLOR = { r: 0.4, g: 0.4, b: 0.42 }; // cosmetic only -- degenerate segments below never actually rasterize

    // model-minus-observed at each float's own (up to 40) pressure levels,
    // computed once per float at build time. tempAtObs/saltAtObs/sigAtObs
    // are never null (model side, interpolated); the observation itself may
    // be, so the diff is left null wherever the float didn't measure that
    // level, rather than treated as a fabricated zero.
    const ARGO_DIFFS = ARGO_FLOATS.map((fl, idx) => {
        const model = ARGO_MODEL[idx];
        const n = fl.pressure.length;
        const temp = new Array(n).fill(null);
        const salt = new Array(n).fill(null);
        const density = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            const t = fl.temperature[i], s = fl.salinity[i], sig = model.obsSig[i];
            if (t !== null && t !== undefined) temp[i] = model.tempAtObs[i] - t;
            if (s !== null && s !== undefined) salt[i] = model.saltAtObs[i] - s;
            if (sig !== null && sig !== undefined) density[i] = model.sigAtObs[i] - sig;
        }
        return { temp, salt, density };
    });
    // symmetric colour limit per variable = 95th percentile of |diff| across
    // ALL floats' valid levels, computed once and cached -- clamp beyond it
    // rather than letting one outlier float stretch the ramp for everyone.
    function percentile95Abs(values) {
        if (!values.length) return 1e-6;
        values.sort((a, b) => a - b);
        return Math.max(values[Math.min(values.length - 1, Math.floor(0.95 * (values.length - 1)))], 1e-6);
    }
    const ARGO_VAR_SCALE = {};
    ["temp", "salt", "density"].forEach((key) => {
        const vals = [];
        ARGO_DIFFS.forEach(d => d[key].forEach(v => { if (v !== null && Number.isFinite(v)) vals.push(Math.abs(v)); }));
        ARGO_VAR_SCALE[key] = percentile95Abs(vals);
    });

    const argoGroup = new THREE.Group();
    const argoLineEntries = []; // { mesh, x, z, n, pressures, diffs } -- one per float, parallel to ARGO_FLOATS
    ARGO_FLOATS.forEach((fl, idx) => {
        // per-marker material instance (not shared), matching the river
        // markers' convention -- keeps each float independently tintable
        // later without affecting the rest, and fadeInfo's per-child
        // traversal doesn't end up writing the same material 134x/frame.
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0xf2a63c, transparent: true, opacity: 1 }));
        const [x, z] = lonLatToXZ(fl.lon, fl.lat, lonMid, latMid);
        mesh.position.set(x, 3, z);
        mesh.userData = { kind: "argo", float: fl, model: ARGO_MODEL[idx] };
        argoGroup.add(mesh);

        // difference-profile line: two thin perpendicular ribbons (a "+"
        // cross-section in plan view) rather than a THREE.Line -- plain
        // WebGL line width is unreliable across platforms/GPUs, so this is
        // what keeps the ~1.8-world-unit width actually readable from any
        // orbit angle. Pressure (dbar) is used directly as depth in metres
        // for the y position via depthToY -- fine at this precision, same
        // convention the panel chart below already uses (1 dbar =~ 1 m in
        // the upper ocean).
        const n = fl.pressure.length;
        const segCount = Math.max(0, n - 1);
        const vertsPerSeg = 12; // 2 ribbon planes x 2 triangles x 3 verts
        const positions = new Float32Array(segCount * vertsPerSeg * 3);
        const colors = new Float32Array(segCount * vertsPerSeg * 3);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        lineGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 1 }));
        lineMesh.userData = { kind: "argo", float: fl, model: ARGO_MODEL[idx] };
        // floats were intermittently vanishing during orbit: 268 small
        // transparent meshes are exactly the worst case for per-object
        // frustum culling + distance sorting, so (a) never cull them --
        // they're tiny, culling buys nothing -- and (b) pin them to render
        // after every other transparent surface instead of interleaving.
        mesh.frustumCulled = false; mesh.renderOrder = 11;
        lineMesh.frustumCulled = false; lineMesh.renderOrder = 10;
        argoGroup.add(lineMesh);
        argoLineEntries.push({ mesh: lineMesh, x, z, n, pressures: fl.pressure, diffs: ARGO_DIFFS[idx] });
    });
    argoGroup.visible = false;
    scene.add(argoGroup);

    function pushRibbonTri(pos, col, o, p0, p1, p2, c0, c1, c2) {
        const pts = [p0, p1, p2], cs = [c0, c1, c2];
        for (let v = 0; v < 3; v++) {
            pos[o * 3] = pts[v][0]; pos[o * 3 + 1] = pts[v][1]; pos[o * 3 + 2] = pts[v][2];
            col[o * 3] = cs[v].r; col[o * 3 + 1] = cs[v].g; col[o * 3 + 2] = cs[v].b;
            o++;
        }
        return o;
    }
    // (re)paints one float's line for the given variable -- rebuilds
    // positions too, not just colour, since which segments are degenerate
    // (missing observation) differs per variable.
    function fillArgoLineGeometry(entry, key) {
        const { mesh, x, z, n, pressures, diffs } = entry;
        const diffArr = diffs[key], scale = ARGO_VAR_SCALE[key];
        const pos = mesh.geometry.attributes.position.array;
        const col = mesh.geometry.attributes.color.array;
        let o = 0;
        for (let i = 0; i < n - 1; i++) {
            const v0 = diffArr[i], v1 = diffArr[i + 1];
            const y0 = depthToY(pressures[i]), y1 = depthToY(pressures[i + 1]);
            const segValid = v0 !== null && v0 !== undefined && Number.isFinite(v0) && v1 !== null && v1 !== undefined && Number.isFinite(v1);
            if (!segValid) {
                // no observation at (at least) one end of this segment --
                // collapse every corner to the same point so all triangles
                // have zero area and never rasterize, instead of colouring
                // a level that was never actually measured.
                const p = [x, y0, z];
                for (let v = 0; v < 4; v++) o = pushRibbonTri(pos, col, o, p, p, p, ARGO_MISSING_COLOR, ARGO_MISSING_COLOR, ARGO_MISSING_COLOR);
                continue;
            }
            const t0 = (Math.max(-scale, Math.min(scale, v0)) / scale + 1) / 2;
            const t1 = (Math.max(-scale, Math.min(scale, v1)) / scale + 1) / 2;
            const c0 = colormap(t0, ARGO_DIFF_STOPS), c1 = colormap(t1, ARGO_DIFF_STOPS);
            const hw = ARGO_LINE_HALF_WIDTH;
            // X-plane ribbon
            o = pushRibbonTri(pos, col, o, [x - hw, y0, z], [x - hw, y1, z], [x + hw, y1, z], c0, c1, c1);
            o = pushRibbonTri(pos, col, o, [x - hw, y0, z], [x + hw, y1, z], [x + hw, y0, z], c0, c1, c0);
            // Z-plane ribbon (perpendicular, so the profile reads as "fat" from any azimuth)
            o = pushRibbonTri(pos, col, o, [x, y0, z - hw], [x, y1, z - hw], [x, y1, z + hw], c0, c1, c1);
            o = pushRibbonTri(pos, col, o, [x, y0, z - hw], [x, y1, z + hw], [x, y0, z + hw], c0, c1, c0);
        }
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.attributes.color.needsUpdate = true;
        mesh.geometry.computeBoundingSphere(); // raycasting tests the sphere first; keep it in step with rebuilt positions
    }
    const ARGO_VAR_FIELDS = { temp: { label: "Temperature" }, salt: { label: "Salinity" }, density: { label: "Density" } };
    let argoVar = "temp";
    let argoPanelState = null; // { float, model } of whichever float's panel is currently open, or null
    function setArgoVar(key) {
        if (!ARGO_VAR_FIELDS[key]) return;
        argoVar = key;
        argoLineEntries.forEach(entry => fillArgoLineGeometry(entry, key));
        const buttons = document.getElementById("argo-var-buttons");
        if (buttons) Array.from(buttons.children).forEach(b => b.classList.toggle("active", b.dataset.key === key));
        if (argoPanelState) drawArgoPanelChart(); // keep the open panel's chart in sync with the new variable
    }
    makeFieldButtons("argo-var-buttons", ARGO_VAR_FIELDS, argoVar, setArgoVar);
    argoLineEntries.forEach(entry => fillArgoLineGeometry(entry, argoVar)); // paint at the default variable before first reveal

    const STEP_LAYERS = {
        grid: [terrainMesh],
        boundary: [boundaryGroup],
        volume: [nudgBorderGroup],
        tides: [tideWallGroup],
        rivers: [riverGroup],
        argo: [argoGroup],
    };
    // surfaceMesh/windPlane/iniSliceGroup/framesMesh are NOT in STEP_LAYERS:
    // the sea-surface real estate is exclusive, not cumulative -- only one
    // of {climatology/weather drape, initial-state drape+slices, daily-frame
    // animation} is ever meant to be on screen at once, so applyVisibility()
    // (below) drives them directly off the current step id instead of the
    // generic "visible from this id onward" rule every other layer uses.
    const EXCLUSIVE_SURFACE_LAYERS = [surfaceMesh, windPlane, iniSliceGroup, framesMesh];

    // -- cross-fade each layer in/out on step change, instead of an instant
    // snap. `current`/`target` are a 0..1 fraction of each material's OWN
    // authored opacity (not a shared absolute value), so a group mixing
    // different opacities across its children keeps their ratio intact
    // through the fade instead of clamping both to one number. Only flips
    // .visible off once fully transparent, so fade-out is seen at all.
    const FADE_DURATION = 0.55; // seconds
    const fadeInfo = new Map();
    [...Object.values(STEP_LAYERS).flat(), ...EXCLUSIVE_SURFACE_LAYERS].forEach((obj) => {
        const mats = [];
        obj.traverse((child) => { if (child.material) mats.push({ mat: child.material, full: child.material.opacity }); });
        const current = obj.visible ? 1 : 0;
        mats.forEach(({ mat, full }) => {
            mat.opacity = full * current;
            // transparent overlays must NOT write depth: a mesh mid-fade (or
            // faded to 0 but not yet flipped invisible) otherwise stays solid
            // to the depth buffer -- an invisible wall that eats whatever
            // renders behind it (Logan spotted Argo floats vanishing exactly
            // along the old nudging ring). Terrain is the one true opaque
            // occluder and keeps its depth writes.
            if (obj !== terrainMesh) mat.depthWrite = false;
        });
        fadeInfo.set(obj, { mats, current, target: current, speed: 1 / FADE_DURATION });
    });
    function setLayerVisible(obj, show) {
        const info = fadeInfo.get(obj);
        if (!info) { obj.visible = show; return; }
        if (show) obj.visible = true; // must stay visible through the fade-in
        info.target = show ? 1 : 0;
    }
    function updateFades(dt) {
        fadeInfo.forEach((info, obj) => {
            if (info.current === info.target) return;
            const dir = info.target > info.current ? 1 : -1;
            info.current += dir * info.speed * dt;
            if ((dir > 0 && info.current > info.target) || (dir < 0 && info.current < info.target)) info.current = info.target;
            info.mats.forEach(({ mat, full }) => { mat.opacity = full * info.current; });
            if (info.current === 0 && info.target === 0) obj.visible = false; // fade-out finished
        });
    }

    // -- "The parts" step: only the rebuilt/reconstructed forcing pieces,
    // floating apart in empty space (terrain, nudging, the cube wireframe
    // and all model-output layers hide -- see applyVisibility's "parts"
    // override). Each piece gets a clickable name label that opens its
    // dig-down page. Offsets are ADDED to each object's own resting y, not
    // an absolute height.
    const PARTS_SHELF = new Map([
        [surfaceMesh, { base: surfaceMesh.position.y, offset: 150 }],  // rebuilt (weather drape)
        [windPlane, { base: windPlane.position.y, offset: 150 }],      // rebuilt
        [boundaryGroup, { base: boundaryGroup.position.y, offset: 80 }], // rebuilt (walls span 0..-150)
        [tideWallGroup, { base: tideWallGroup.position.y, offset: 20 }], // rebuilt (TPXO8 regrid, WIP)
        [riverGroup, { base: riverGroup.position.y, offset: -140 }],   // reconstructed
    ]);
    const PARTS_TWEEN_DURATION = 0.8; // seconds
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    const partsShelfTween = new Map();
    PARTS_SHELF.forEach((cfg, obj) => partsShelfTween.set(obj, { from: obj.position.y, to: obj.position.y, t: 1 }));
    function setPartsShelf(active) {
        PARTS_SHELF.forEach((cfg, obj) => {
            const tw = partsShelfTween.get(obj);
            tw.from = obj.position.y;
            tw.to = active ? cfg.base + cfg.offset : cfg.base;
            tw.t = 0;
        });
    }
    function updatePartsShelf(dt) {
        partsShelfTween.forEach((tw, obj) => {
            if (tw.t >= 1) return;
            tw.t = Math.min(1, tw.t + dt / PARTS_TWEEN_DURATION);
            obj.position.y = THREE.MathUtils.lerp(tw.from, tw.to, easeInOutCubic(tw.t));
        });
    }

    // the floating pieces span y +150..-140 -- the tour's default orbit
    // can't frame that, so entering "parts" recentres the orbit target on
    // the stack and dollies out (and both restore on leaving, keeping
    // whatever the user had before).
    const partsCam = { t: 1, fromTy: 0, toTy: 0, fromDist: 0, toDist: 0, prevDist: null, prevTy: null };
    function setPartsCam(active) {
        const dist = camera.position.distanceTo(controls.target);
        partsCam.fromTy = controls.target.y;
        partsCam.fromDist = dist;
        if (active) {
            partsCam.prevDist = dist;
            partsCam.prevTy = controls.target.y;
            partsCam.toTy = 5;
            partsCam.toDist = Math.max(dist, 640);
        } else {
            partsCam.toTy = partsCam.prevTy ?? -CUBE_HEIGHT / 2;
            partsCam.toDist = partsCam.prevDist ?? dist;
        }
        partsCam.t = 0;
    }
    function updatePartsCam(dt) {
        if (partsCam.t >= 1) return;
        partsCam.t = Math.min(1, partsCam.t + dt / PARTS_TWEEN_DURATION);
        const k = easeInOutCubic(partsCam.t);
        controls.target.y = THREE.MathUtils.lerp(partsCam.fromTy, partsCam.toTy, k);
        const d = THREE.MathUtils.lerp(partsCam.fromDist, partsCam.toDist, k);
        const dir = camera.position.clone().sub(controls.target);
        dir.y = Math.max(dir.y, 1); // keep the orbit above the stack's horizon
        dir.normalize();
        camera.position.copy(controls.target).addScaledVector(dir, d);
    }

    // one clickable name label per floating piece, on the west side at that
    // piece's parts-step height -- clicking it opens the dig-down page
    // (same destination as clicking the piece itself). Only shown on the
    // "parts" step, so a plain visibility flag is enough.
    const partsLabelX = lonLatToXZ(lonWest, latMid, lonMid, latMid)[0] - 25;
    const partsLabelZ = 0;
    function makePartsLabel(text, color, y, href) {
        const div = document.createElement("div");
        div.className = "parts-shelf-label";
        div.style.color = color;
        div.textContent = text;
        div.addEventListener("click", () => { window.location.href = href; });
        const label = new CSS2DObject(div);
        label.position.set(partsLabelX, y, partsLabelZ);
        return label;
    }
    const partsLabelGroup = new THREE.Group();
    partsLabelGroup.add(
        makePartsLabel("Weather", PROV.rebuilt.color, 150, "dig_weather.html"),
        makePartsLabel("Open boundaries", PROV.rebuilt.color, 80, "dig_boundary.html"),
        makePartsLabel("Tides", PROV.rebuilt.color, 20, "dig_tides.html"),
        makePartsLabel("Rivers", PROV.reconstructed.color, -140, "dig_rivers.html"),
    );
    partsLabelGroup.visible = false;
    scene.add(partsLabelGroup);

    // -- river inspection (the one step with a real per-object drill-down) --
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function drawLineChart(canvas, xs, ys, color) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
        ctx.clearRect(0, 0, w, h);
        const xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(...ys), yhi = Math.max(...ys);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
        xs.forEach((x, idx) => {
            const px = ((x - xlo) / (xhi - xlo || 1)) * (w - 20) + 10;
            const py = h - (((ys[idx] - ylo) / (yhi - ylo || 1)) * (h - 20) + 10);
            idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
    }
    renderer.domElement.addEventListener("click", (ev) => {
        if (stepIdx < 0 || STEPS[stepIdx].id !== "rivers") return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(riverGroup.children, false);
        if (!hits.length) return;
        const r = hits[0].object.userData.river;
        const panel = document.getElementById("river-detail");
        if (!panel) return;
        panel.style.display = "block";
        panel.innerHTML = `<div class="k">${r.transport.toFixed(0)} m&sup3;/s &middot; ${r.temp.toFixed(1)}&deg;C &middot; injection profile</div><canvas class="chart" id="riverChart"></canvas>`;
        const sLevels = r.vshape.map((_, idx) => idx / (r.vshape.length - 1) - 1);
        drawLineChart(document.getElementById("riverChart"), r.vshape, sLevels, "#4fa8ff");
    });

    // -- Argo inspection: same raycaster/pointer as rivers above, gated on
    // its own step id -- the two listeners coexist harmlessly since only
    // one step can ever be active at a time.
    function drawArgoProfile(canvas, modelZ, modelVal, obsZ, obsVal) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
        ctx.clearRect(0, 0, w, h);
        const allVal = modelVal.concat(obsVal), allZ = modelZ.concat(obsZ);
        if (!allVal.length) return;
        const xlo = Math.min(...allVal), xhi = Math.max(...allVal);
        const ylo = Math.min(...allZ), yhi = Math.max(...allZ);
        const px = (v) => ((v - xlo) / (xhi - xlo || 1)) * (w - 20) + 10;
        const py = (z) => h - (((z - ylo) / (yhi - ylo || 1)) * (h - 20) + 10);
        ctx.strokeStyle = "#5cb3ff"; ctx.lineWidth = 3; ctx.beginPath();
        modelZ.forEach((z, idx) => { const x = px(modelVal[idx]), y = py(z); idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
        ctx.fillStyle = "#f2a63c";
        obsZ.forEach((z, idx) => { const x = px(obsVal[idx]), y = py(z); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    }
    // the variable switcher now lives on the step card (argo-var-buttons,
    // built above with the profile lines) rather than inside this panel --
    // one selector drives both the lines' colour and this chart, so the
    // panel just redraws against whatever argoVar currently is.
    function drawArgoPanelChart() {
        if (!argoPanelState) return;
        const { float: fl, model } = argoPanelState;
        // pressure (dbar) treated as depth in metres for display -- fine at
        // this precision (1 dbar =~ 1 m in the upper ocean).
        const obsDepthAll = fl.pressure.map(p => -p);
        let modelZ, modelVal, obsValAll;
        if (argoVar === "density") {
            // no full-resolution model density profile is carried through
            // (only temp/salt get one) -- sigAtObs is already index-aligned
            // with the float's own pressure levels, so it stands in as the
            // "model line" here, against obsSig as the observed dots.
            modelZ = obsDepthAll; modelVal = model.sigAtObs; obsValAll = model.obsSig;
        } else {
            modelZ = model.z;
            modelVal = argoVar === "temp" ? model.temp : model.salt;
            obsValAll = argoVar === "temp" ? fl.temperature : fl.salinity;
        }
        const obsZ = [], obsVal = [];
        obsValAll.forEach((v, idx) => {
            const d = obsDepthAll[idx];
            if (v !== null && v !== undefined && d !== null && d !== undefined) { obsZ.push(d); obsVal.push(v); }
        });
        drawArgoProfile(document.getElementById("argoChart"), modelZ, modelVal, obsZ, obsVal);
    }
    function renderArgoPanel(fl, model) {
        const panel = document.getElementById("argo-detail");
        if (!panel) return;
        panel.style.display = "block";
        panel.innerHTML = `<div class="k">${fl.id} &middot; day ${model.day + 1} Jan 2021 &middot; ${model.dist_km} km from model cell</div>
            <canvas class="chart" id="argoChart"></canvas>`;
        argoPanelState = { float: fl, model };
        drawArgoPanelChart();
    }
    renderer.domElement.addEventListener("click", (ev) => {
        if (stepIdx < 0 || STEPS[stepIdx].id !== "argo") return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(argoGroup.children, false);
        if (!hits.length) return;
        const { float, model } = hits[0].object.userData;
        renderArgoPanel(float, model);
    });

    // -- "The parts" step: clicking a rebuilt/reconstructed shelf opens its
    // own dig-deeper page. Only these four respond -- the "original" shelves
    // (terrain, nudging border) are exactly as given by the hindcast, so
    // there's nothing further to dig into and clicks on them are ignored.
    // Same raycaster/pointer as the river/Argo listeners above.
    const PARTS_CLICK_TARGETS = [
        { group: tideWallGroup, href: "dig_tides.html" },
        { group: riverGroup, href: "dig_rivers.html" },
        { group: boundaryGroup, href: "dig_boundary.html" },
        { objects: [surfaceMesh, windPlane], href: "dig_weather.html" },
    ];
    renderer.domElement.addEventListener("click", (ev) => {
        if (stepIdx < 0 || STEPS[stepIdx].id !== "parts") return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hrefByObject = new Map();
        const allObjects = [];
        PARTS_CLICK_TARGETS.forEach(({ group, objects, href }) => {
            (objects || group.children).forEach((obj) => { hrefByObject.set(obj, href); allObjects.push(obj); });
        });
        const hits = raycaster.intersectObjects(allObjects, false);
        if (!hits.length) return;
        const href = hrefByObject.get(hits[0].object);
        if (href) window.location.href = href;
    });

    // -- step navigation --------------------------------------------------
    let stepIdx = -1; // -1 = empty cube, before step 0

    function renderStepUI() {
        const dots = document.getElementById("step-dots");
        const titleEl = document.getElementById("step-title");
        const kidEl = document.getElementById("step-kid");
        const detailBody = document.getElementById("step-detail-body");
        const limitEl = document.getElementById("step-limitation");
        const riverPanel = document.getElementById("river-detail");
        if (riverPanel) { riverPanel.style.display = "none"; riverPanel.innerHTML = ""; }
        const argoPanel = document.getElementById("argo-detail");
        if (argoPanel) { argoPanel.style.display = "none"; argoPanel.innerHTML = ""; }
        argoPanelState = null;

        if (dots) {
            dots.innerHTML = "";
            STEPS.forEach((s, i) => {
                const d = document.createElement("span");
                d.className = "step-dot" + (i === stepIdx ? " active" : i < stepIdx ? " done" : "");
                d.title = s.title;
                d.addEventListener("click", () => goTo(i));
                dots.appendChild(d);
            });
        }

        const fieldButtons = document.getElementById("meteo-field-buttons");
        const boundaryButtons = document.getElementById("boundary-field-buttons");
        const climButtons = document.getElementById("clim-field-buttons");
        const nudgModeButtons = document.getElementById("nudg-mode-buttons");
        const tideSelectWrap = document.getElementById("tide-constituent-wrap");
        const iniButtons = document.getElementById("ini-field-buttons");
        const framesButtons = document.getElementById("frames-field-buttons");
        const framesControls = document.getElementById("frames-controls-wrap");
        const argoVarButtons = document.getElementById("argo-var-buttons");

        if (stepIdx < 0) {
            if (titleEl) titleEl.textContent = "An empty model";
            if (kidEl) kidEl.textContent = "Nothing in the box yet.";
            if (detailBody) detailBody.innerHTML = "";
            if (limitEl) limitEl.style.display = "none";
            if (fieldButtons) fieldButtons.classList.remove("visible");
            if (boundaryButtons) boundaryButtons.classList.remove("visible");
            if (climButtons) climButtons.classList.remove("visible");
            if (nudgModeButtons) nudgModeButtons.classList.remove("visible");
            if (tideSelectWrap) tideSelectWrap.classList.remove("visible");
            if (iniButtons) iniButtons.classList.remove("visible");
            if (framesButtons) framesButtons.classList.remove("visible");
            if (framesControls) framesControls.classList.remove("visible");
            if (argoVarButtons) argoVarButtons.classList.remove("visible");
            return;
        }
        const s = STEPS[stepIdx];
        if (fieldButtons) fieldButtons.classList.toggle("visible", s.id === "meteo");
        if (boundaryButtons) boundaryButtons.classList.toggle("visible", s.id === "boundary");
        // clim-field-buttons stays hidden here -- surfaceMesh (what it
        // switches) no longer shows at "volume", see STEP_LAYERS.meteo note.
        // nudg-mode-buttons takes over the step's switcher role instead --
        // toggling the border itself between coefficient and target state.
        if (climButtons) climButtons.classList.remove("visible");
        if (nudgModeButtons) nudgModeButtons.classList.toggle("visible", s.id === "volume");
        if (tideSelectWrap) tideSelectWrap.classList.toggle("visible", s.id === "tides");
        if (iniButtons) iniButtons.classList.toggle("visible", s.id === "ini");
        if (framesButtons) framesButtons.classList.toggle("visible", s.id === "frames");
        if (framesControls) framesControls.classList.toggle("visible", s.id === "frames");
        if (argoVarButtons) argoVarButtons.classList.toggle("visible", s.id === "argo");
        if (titleEl) titleEl.textContent = s.title;
        if (kidEl) kidEl.textContent = s.kid;
        // colour legend for "parts" -- always visible (not tucked behind the
        // collapsed Information disclosure like a normal file's provenance
        // badge) since it's read alongside the floating pieces, not after.
        const partsLegendEl = document.getElementById("parts-legend");
        if (partsLegendEl) {
            partsLegendEl.innerHTML = s.id === "parts"
                ? [PROV.rebuilt, PROV.reconstructed].map(p =>
                    `<span class="prov-badge" style="--c:${p.color}"><span class="dot"></span>${p.label}</span>`
                  ).join("")
                : "";
        }
        if (detailBody) {
            // most steps are a single file with one provenance; a few (e.g.
            // volume, which bundles a regridded climatology with a recovered
            // original nudging file) genuinely mix two -- show one badge per file.
            // A step with neither `sources` nor `prov` (e.g. "parts", which
            // is an index page rather than one file) simply omits the badge
            // row entirely rather than faking a provenance for it.
            const sources = s.sources || (s.prov ? [{ prov: s.prov, source: s.source }] : []);
            const rows = sources.map(({ prov, source }) => {
                const p = PROV[prov];
                const srcHtml = source ? `<code class="src">${source}</code>` : "";
                return `<div class="prov-pair"><div class="prov-badge" style="--c:${p.color}"><span class="dot"></span>${p.label}</div>${srcHtml}</div>`;
            }).join("");
            detailBody.innerHTML = `${rows}<div class="layer-note">${s.detail}</div>`;
        }
        if (limitEl) {
            if (s.limitation) { limitEl.style.display = "block"; limitEl.innerHTML = s.limitation; }
            else limitEl.style.display = "none";
        }
    }

    function applyVisibility() {
        const activeIds = new Set();
        for (let i = 0; i <= stepIdx; i++) activeIds.add(STEPS[i].id);
        Object.entries(STEP_LAYERS).forEach(([id, objs]) => {
            objs.forEach((obj) => setLayerVisible(obj, activeIds.has(id)));
        });
        // -- the sea-surface real estate is exclusive, not cumulative: only
        // one of {meteo drape, initial-state drape+slices, daily-frame
        // animation} is ever meant to be on screen, so these override the
        // generic reveal-and-keep rule above instead of adding to it.
        const id = stepIdx >= 0 ? STEPS[stepIdx].id : null;
        // the nudging border has done its explanatory job once the weather
        // arrives -- from "meteo" onward it would only sit on top of (and
        // fight with) the drapes and model-output layers, so it retires
        // instead of following the cumulative reveal-and-keep rule.
        const meteoIdx = STEPS.findIndex(s => s.id === "meteo");
        if (stepIdx >= meteoIdx) setLayerVisible(nudgBorderGroup, false);
        // the forcing walls retire once the model's own state takes over --
        // from "ini" onward they'd only clutter (and z-fight) the output
        // layers, same reasoning as the nudging border retiring at "meteo".
        const iniIdx = STEPS.findIndex(s => s.id === "ini");
        if (stepIdx >= iniIdx) { setLayerVisible(boundaryGroup, false); setLayerVisible(tideWallGroup, false); }
        setLayerVisible(surfaceMesh, id === "meteo" || id === "ini");
        setLayerVisible(windPlane, id === "meteo");
        setLayerVisible(iniSliceGroup, id === "ini" && iniSlicesApplicable);
        setLayerVisible(framesMesh, id === "frames");
        // -- "The parts": only the rebuilt/reconstructed forcing pieces,
        // floating in empty space. Everything else -- terrain, nudging, the
        // cube wireframe, model-output layers (ini slices, run-forward
        // frames, Argo) -- hides: this step is about the pieces that were
        // rebuilt or reconstructed, each a doorway to its dig-down page.
        // CSS2DRenderer checks each CSS2DObject's OWN .visible when
        // traversing -- it does not stop descending (or consult) at an
        // invisible parent group the way the WebGL renderer does, so the
        // group flag alone leaves every label showing on every step. Each
        // label's own flag has to be set directly.
        partsLabelGroup.visible = id === "parts";
        partsLabelGroup.children.forEach((lbl) => { lbl.visible = id === "parts"; });
        cubeWire.visible = id !== "parts";
        if (id === "parts") {
            setLayerVisible(terrainMesh, false);
            setLayerVisible(nudgBorderGroup, false);
            setLayerVisible(boundaryGroup, true);
            setLayerVisible(tideWallGroup, true);
            setLayerVisible(riverGroup, true);
            setLayerVisible(surfaceMesh, true);
            setLayerVisible(windPlane, true);
            setLayerVisible(argoGroup, false);
        }
    }

    function goTo(i) {
        const prevId = stepIdx >= 0 ? STEPS[stepIdx].id : null;
        stepIdx = Math.max(-1, Math.min(STEPS.length - 1, i));
        // the shared surface mesh restores whichever field this step last
        // showed -- so arriving at "meteo" always shows weather (replacing
        // whatever volume left on it) and going back to "volume" restores
        // climatology, rather than leaving a stale field showing. "ini"
        // additionally restores whether its slices apply to that field.
        if (stepIdx >= 0) {
            const id = STEPS[stepIdx].id;
            // "parts" restores the meteo field too -- its surface shelf shows
            // the weather drape, same source as the "meteo" step itself.
            const restore = id === "volume" ? lastVolumeField : (id === "meteo" || id === "parts") ? lastMeteoField : id === "ini" ? lastIniField : null;
            if (restore) setSurfaceField(restore.source, restore.key, restore.buttonsElId);
            if (id === "ini") {
                iniSlicesApplicable = lastIniField.key === "temp" || lastIniField.key === "salt";
                if (iniSlicesApplicable) setIniSliceField(lastIniField.key);
            }
        }
        applyVisibility();
        if (prevId === "frames" && (stepIdx < 0 || STEPS[stepIdx].id !== "frames")) pauseFrames(); // auto-pause on leaving the step
        // pull the class shelves apart on entering "parts", collapse them
        // back together on leaving it.
        const curId = stepIdx >= 0 ? STEPS[stepIdx].id : null;
        if (curId === "parts" && prevId !== "parts") { setPartsShelf(true); setPartsCam(true); }
        else if (curId !== "parts" && prevId === "parts") { setPartsShelf(false); setPartsCam(false); }
        renderStepUI();
    }

    document.getElementById("step-next").addEventListener("click", () => goTo(stepIdx + 1));
    document.getElementById("step-prev").addEventListener("click", () => goTo(stepIdx - 1));
    goTo(-1);
    // the dig-deeper pages' back-links point at index.html#parts -- land
    // straight on that step instead of the empty cube when arriving that way.
    if (location.hash === "#parts") {
        const partsStepIdx = STEPS.findIndex(s => s.id === "parts");
        if (partsStepIdx >= 0) goTo(partsStepIdx);
    }

    // -- render loop --------------------------------------------------------
    resize();
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const dt = Math.min(0.1, clock.getDelta()); // clamp so a stalled/backgrounded tab doesn't jump
        controls.update();
        updateFades(dt);
        updatePartsShelf(dt);
        updatePartsCam(dt);
        if (boundaryGroup.visible) updateBoundarySourceFade(dt);
        if (tideWallGroup.visible) updateTide(dt);
        if (nudgBorderGroup.visible && nudgDisplayMode === "coef") updateNudgBorderPulse(dt);
        if (windPlane.visible) updateWindParticles(dt);
        if (framesMesh.visible && framesPlaying) {
            framesElapsed += dt;
            const frameDur = 1 / FRAMES_FPS;
            if (framesElapsed >= frameDur) {
                framesElapsed -= frameDur;
                setFramesDay((framesDayIdx + 1) % FN);
            }
        }
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }
    animate();

    window.__debug = {
        THREE, scene, camera, renderer, labelRenderer, terrainMesh, boundaryGroup, surfaceMesh, nudgBorderGroup, nudgFloorMesh, nudgRoofMesh,
        tideWallGroup, riverGroup, windPlane, iniSliceGroup, framesMesh, argoGroup, goTo, STEPS,
        setMeteoField, setBoundaryField, setBoundarySource, setClimField, setTideConstituent, setNudgDisplayMode,
        setIniField, setFrameField: setFramesField, setFramesDay, playFrames, pauseFrames,
        setArgoVar,
        gotoPart: (name) => {
            const hrefs = { boundary: "dig_boundary.html", weather: "dig_weather.html", tides: "dig_tides.html", rivers: "dig_rivers.html" };
            if (!hrefs[name]) return false;
            window.location.href = hrefs[name];
            return true;
        },
        selectArgoFloat: (id) => {
            const idx = ARGO_FLOATS.findIndex(f => f.id === id);
            if (idx < 0) return false;
            renderArgoPanel(ARGO_FLOATS[idx], ARGO_MODEL[idx]);
            return true;
        },
    };
}
