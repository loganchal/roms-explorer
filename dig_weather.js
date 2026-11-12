// Weather dig page: CFSR reanalysis fields regridded onto the model grid.
// Pure 2D canvas -- no three.js. Same decode-once-at-module-scope convention
// as assembly_scene.js, and the same colour ramps so a field reads the same
// here as it does in the guided flow.
import { b64f32, colormap, WARM_STOPS, DIVERGING_STOPS, drawSeries, mountHeader } from "./dig_common.js?v=20261113-stage-return";

const NX = GRID_NX, NY = GRID_NY;
const MASK = b64f32(MASK_RHO_B64); // 1 = wet, 0 = land

// same custom stops as assembly_scene.js's METEO_FIELDS -- kept local here
// since dig_common only exports the ramps shared across every dig page.
const SW_STOPS = ["#05070f", "#132244", "#2f5c8c", "#e0a83c", "#fff4cf"];
const PAIR_STOPS = ["#3d2a6b", "#4f7cae", "#dbe4de", "#d9843c", "#a8281f"];
const TAIR_STOPS = ["#1a3a6b", "#4f8ab0", "#dbe4a0", "#e0782f", "#a8281f"];
const QAIR_STOPS = ["#3a2a12", "#8a6a3c", "#c8d8dc", "#4f9ab0", "#1a5a8e"];
const RAIN_STOPS = ["#0a0e14", "#0a0e14", "#2f6690", "#5cb3ff", "#dbe9ee"];
const LWRAD_STOPS = ["#140b1f", "#5b2a86", "#c05c3e", "#e0a83c", "#fff4cf"];

function minMaxAll(arr) {
    // land is NOT masked out for meteo (CFSR covers land+sea alike), so the
    // colour range is taken over every finite cell, not just wet ones.
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < arr.length; k++) {
        const v = arr[k];
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return [lo, hi];
}
function symmetricRange(arr) {
    const [lo, hi] = minMaxAll(arr);
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m, m];
}

const uwind = b64f32(MET_UWIND_SNAP_B64);
const vwind = b64f32(MET_VWIND_SNAP_B64);
const swrad = b64f32(MET_SWRAD_SNAP_B64);
const pair = b64f32(MET_PAIR_SNAP_B64);
const tair = b64f32(MET_TAIR_SNAP_B64);
const qair = b64f32(MET_QAIR_SNAP_B64);
const rain = b64f32(MET_RAIN_SNAP_B64);
const lwradDown = b64f32(MET_LWRAD_DOWN_SNAP_B64);

const FIELDS = {
    uwind: { label: "Uwind", unit: "m/s", field: uwind, stops: DIVERGING_STOPS, range: symmetricRange(uwind) },
    vwind: { label: "Vwind", unit: "m/s", field: vwind, stops: DIVERGING_STOPS, range: symmetricRange(vwind) },
    swrad: { label: "Shortwave", unit: "W/m²", field: swrad, stops: WARM_STOPS, range: minMaxAll(swrad) },
    pair: { label: "Pressure", unit: "Pa", field: pair, stops: PAIR_STOPS, range: minMaxAll(pair) },
    tair: { label: "Air temp", unit: "°C", field: tair, stops: WARM_STOPS, range: minMaxAll(tair) },
    qair: { label: "Humidity", unit: "kg/kg", field: qair, stops: QAIR_STOPS, range: minMaxAll(qair) },
    rain: { label: "Rain", unit: "kg/m²/s", field: rain, stops: RAIN_STOPS, range: minMaxAll(rain) },
    lwradDown: { label: "Longwave", unit: "W/m²", field: lwradDown, stops: LWRAD_STOPS, range: minMaxAll(lwradDown) },
};

// -- main map: an off-screen NX x NY ImageData is far cheaper than NX*NY
// fillRect calls, then it's blitted up to a display canvas with nearest-
// neighbour scaling so cells stay crisp. Row 0 of the model grid (j=0) is
// the SOUTH edge of the domain (checked against LAT_RHO), so rows are
// flipped when painted top-to-bottom to keep the map north-up.
const SCALE = 2;
const mapCanvas = document.getElementById("map-canvas");
mapCanvas.width = NX * SCALE;
mapCanvas.height = NY * SCALE;
const mapCtx = mapCanvas.getContext("2d");
mapCtx.imageSmoothingEnabled = false;
const offCanvas = document.createElement("canvas");
offCanvas.width = NX; offCanvas.height = NY;
const offCtx = offCanvas.getContext("2d");

function renderField(key) {
    const f = FIELDS[key];
    const [lo, hi] = f.range;
    const span = (hi - lo) || 1;
    const img = offCtx.createImageData(NX, NY);
    const data = img.data;
    for (let row = 0; row < NY; row++) {
        const j = NY - 1 - row; // flip: row 0 (canvas top) = north
        const rowBase = row * NX;
        const jBase = j * NX;
        for (let i = 0; i < NX; i++) {
            const k = jBase + i;
            const v = f.field[k];
            const t = Number.isFinite(v) ? (v - lo) / span : 0;
            const c = colormap(t, f.stops);
            let r = c.r, g = c.g, b = c.b;
            if (MASK[k] < 0.5) { r *= 0.8; g *= 0.8; b *= 0.8; } // land: darken 20%, don't mask
            const idx = (rowBase + i) * 4;
            data[idx] = Math.round(r * 255);
            data[idx + 1] = Math.round(g * 255);
            data[idx + 2] = Math.round(b * 255);
            data[idx + 3] = 255;
        }
    }
    offCtx.putImageData(img, 0, 0);
    mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapCtx.drawImage(offCanvas, 0, 0, NX, NY, 0, 0, mapCanvas.width, mapCanvas.height);

    const readout = document.getElementById("map-readout");
    readout.innerHTML = `<span>${f.label}</span><span>${lo.toFixed(2)} &ndash; ${hi.toFixed(2)} ${f.unit}</span>`;
}

function makeFieldButtons(activeKey, onPick) {
    const el = document.getElementById("field-buttons");
    Object.entries(FIELDS).forEach(([key, f]) => {
        const btn = document.createElement("button");
        btn.textContent = f.label;
        btn.className = key === activeKey ? "active" : "";
        btn.addEventListener("click", () => {
            el.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            onPick(key);
        });
        el.appendChild(btn);
    });
}

makeFieldButtons("tair", renderField);
renderField("tair");

// -- point series: one grid point sampled hourly across the whole month.
drawSeries(document.getElementById("wind-canvas"), [
    { ys: MET_UWIND_TS, color: "#4fa8ff" },
    { ys: MET_VWIND_TS, color: "#f2a63c" },
], { zeroLine: true });

drawSeries(document.getElementById("swrad-canvas"), [
    { ys: MET_SWRAD_TS, color: "#ffce54" },
]);

mountHeader(document.getElementById("dig-header"), {
    prov: "rebuilt",
    title: "Weather",
    sentence: "CFSR reanalysis regridded onto the model grid.",
    source: "nz5km_N50_meteo_202101.nc",
});

// -- regrid visual: native CFSR air temperature vs the same hour regridded
// onto the model grid, one shared colour scale so a warm cell reads the
// same warmth on both. Same treatment as the boundary dig page's GLORYS
// slice, just a flat map instead of a depth curtain.
function minMaxFinite(arr) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < arr.length; k++) {
        const v = arr[k];
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v; if (v > hi) hi = v;
    }
    return [lo, hi];
}
function paintRaster(canvasEl, field, nx, ny, lo, hi, flipRows) {
    const c = canvasEl.getContext("2d");
    canvasEl.width = nx; canvasEl.height = ny;
    const img = c.createImageData(nx, ny);
    const data = img.data;
    const span = (hi - lo) || 1;
    for (let row = 0; row < ny; row++) {
        const j = flipRows ? ny - 1 - row : row;
        for (let i = 0; i < nx; i++) {
            const v = field[j * nx + i];
            const t = Number.isFinite(v) ? (v - lo) / span : 0;
            const col = colormap(t, WARM_STOPS);
            const idx = (row * nx + i) * 4;
            data[idx] = Math.round(col.r * 255);
            data[idx + 1] = Math.round(col.g * 255);
            data[idx + 2] = Math.round(col.b * 255);
            data[idx + 3] = Number.isFinite(v) ? 255 : 0;
        }
    }
    c.putImageData(img, 0, 0);
}
if (typeof WX_NATIVE_T2M_SNAP_B64 !== "undefined") {
    const nativeT = b64f32(WX_NATIVE_T2M_SNAP_B64);
    const regridT = b64f32(WX_REGRID_T2M_SNAP_B64);
    const nativeLon = b64f32(WX_NATIVE_LON_B64);
    const nativeLat = b64f32(WX_NATIVE_LAT_B64);
    const [loN, hiN] = minMaxFinite(nativeT);
    const [loR, hiR] = minMaxFinite(regridT);
    const lo = Math.min(loN, loR), hi = Math.max(hiN, hiR);
    // native rows run north->south already in most CFSR crops -- check
    // against its own lat vector rather than assume, same care as the
    // model grid's own row-flip above.
    const nativeFlip = nativeLat[0] < nativeLat[nativeLat.length - 1];
    paintRaster(document.getElementById("native-canvas"), nativeT,
        nativeLon.length, nativeLat.length, lo, hi, nativeFlip);
    paintRaster(document.getElementById("regrid-canvas"), regridT, NX, NY, lo, hi, true);
}
