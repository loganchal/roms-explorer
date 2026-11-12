// Weather dig page: CFSR reanalysis fields regridded onto the model grid.
// Pure 2D canvas -- no three.js. Same decode-once-at-module-scope convention
// as assembly_scene.js, and the same colour ramps so a field reads the same
// here as it does in the guided flow.
import { b64f32, colormap, WARM_STOPS, DIVERGING_STOPS, drawSeries, mountHeader } from "./dig_common.js?v=20261113-native-final2";

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

const FIELDS = {
    uwind: { label: "Eastward wind", stops: DIVERGING_STOPS },
    vwind: { label: "Northward wind", stops: DIVERGING_STOPS },
    swrad: { label: "Shortwave", stops: WARM_STOPS },
    pair: { label: "Pressure", stops: PAIR_STOPS },
    tair: { label: "Air temp", stops: WARM_STOPS },
    qair: { label: "Humidity", stops: QAIR_STOPS },
    rain: { label: "Rain", stops: RAIN_STOPS },
    lwradDown: { label: "Longwave", stops: LWRAD_STOPS },
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
    renderComparison(key);
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

    mapCanvas.dataset.field = key;
    mapCanvas.setAttribute("aria-label", f.label);
    const readout = document.getElementById("map-readout");
    readout.innerHTML = `<span>${f.label}</span><span>${formatRange(lo, hi)} ${f.unit}</span>`;
}

function makeFieldButtons(activeKey, onPick) {
    const el = document.getElementById("field-buttons");
    Object.entries(FIELDS).forEach(([key, f]) => {
        const btn = document.createElement("button");
        btn.textContent = f.label;
        btn.className = key === activeKey ? "active" : "";
        btn.dataset.key = key;
        btn.setAttribute("aria-pressed", String(key === activeKey));
        btn.addEventListener("click", () => {
            el.querySelectorAll("button").forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-pressed", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            onPick(key);
        });
        el.appendChild(btn);
    });
}


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

// Native and regridded snapshots come from the same source field/hour.
// Keep this payload separate from scene_data.js: it is only needed here.
let comparisons;
function paintRaster(canvasEl, raster, lo, hi, stops, key) {
    const field = raster.values || b64f32(raster.b64);
    const { nx, ny, flipRows } = raster;
    if (field.length !== nx * ny) throw new Error(`Invalid weather raster: ${key}`);
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
            const col = colormap(t, stops);
            const idx = (row * nx + i) * 4;
            data[idx] = Math.round(col.r * 255);
            data[idx + 1] = Math.round(col.g * 255);
            data[idx + 2] = Math.round(col.b * 255);
            data[idx + 3] = Number.isFinite(v) ? 255 : 0;
        }
    }
    c.putImageData(img, 0, 0);
    canvasEl.dataset.field = key;
    canvasEl.setAttribute("aria-label", FIELDS[key].label);
}
function renderComparison(key) {
    const pair = comparisons.fields[key], f = FIELDS[key];
    const nativeRange = minMaxAll(pair.native.values);
    const regridRange = minMaxAll(pair.regrid.values);
    let lo = Math.min(nativeRange[0], regridRange[0]);
    let hi = Math.max(nativeRange[1], regridRange[1]);
    if (key === "uwind" || key === "vwind") {
        hi = Math.max(Math.abs(lo), Math.abs(hi)); lo = -hi;
    }
    paintRaster(document.getElementById("native-canvas"), pair.native, lo, hi, f.stops, key);
    paintRaster(document.getElementById("regrid-canvas"), pair.regrid, lo, hi, f.stops, key);
    const caption = document.getElementById("regrid-caption");
    caption.replaceChildren();
    const label = document.createElement("span"); label.textContent = f.label;
    const range = document.createElement("span");
    range.textContent = ` · ${formatRange(lo, hi)} ${pair.unit}`;
    caption.append(label, range);
    const time = document.createElement("span");
    time.textContent = ` · ${pair.snapshot_utc || comparisons.snapshot_utc}`;
    caption.append(time);
    const card = document.getElementById("regrid-card");
    card.dataset.field = key;
    card.dataset.source = pair.source;
    card.title = pair.source;
}
function formatRange(lo, hi) {
    const format = v => v !== 0 && Math.abs(v) < 0.01 ? v.toExponential(2) : v.toFixed(2);
    return `${format(lo)} – ${format(hi)}`;
}
async function loadComparisons() {
    const response = await fetch("data/weather-comparison.json?v=20261113-native-final2");
    if (!response.ok) throw new Error(`Weather snapshots: HTTP ${response.status}`);
    comparisons = await response.json();
    for (const [key, f] of Object.entries(FIELDS)) {
        const pair = comparisons.fields[key];
        if (!pair?.native || !pair?.regrid) throw new Error(`Missing native weather field: ${key}`);
        for (const raster of [pair.native, pair.regrid]) {
            raster.values = b64f32(raster.b64);
            if (raster.values.length !== raster.nx * raster.ny) throw new Error(`Invalid weather raster: ${key}`);
        }
        if (pair.regrid.nx !== NX || pair.regrid.ny !== NY) {
            throw new Error(`Weather/model grid mismatch: ${key}`);
        }
        // Use the paired snapshot here as well, so every map shows the
        // same hour and wind components (Earth-relative east/north).
        f.field = pair.regrid.values;
        f.unit = pair.unit;
        f.range = key === "uwind" || key === "vwind" ? symmetricRange(f.field) : minMaxAll(f.field);
    }
    makeFieldButtons("tair", renderField);
    renderField("tair");
    document.getElementById("regrid-card").setAttribute("aria-busy", "false");
}
loadComparisons().catch(error => {
    console.error(error);
    document.getElementById("err").style.display = "block";
    document.getElementById("err").textContent = error.message;
});
