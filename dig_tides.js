// MetOcean tidal forcing; no obsolete hindcast harmonic-fit comparison.
import { b64f32, drawSeries, mountHeader } from "./dig_common.js?v=20261113-stage-return";

mountHeader(document.getElementById("dig-header"), {
    prov: "metocean",
    title: "Tides",
    sentence: "Tidal forcing provided by MetOcean.",
    source: "nz5km-tide.nc",
});

// ---- 1. pick a representative deep boundary point -------------------------
// North edge (j = GRID_NY - 1), wet cell, H > 1000 m, nearest mid-longitude.
const H = b64f32(H_B64);
const MASK = b64f32(MASK_RHO_B64);
const LON = b64f32(LON_RHO_B64);
const LAT = b64f32(LAT_RHO_B64);

const j = GRID_NY - 1;
const iMid = GRID_NX / 2;
let bestI = -1, bestDist = Infinity;
for (let i = 0; i < GRID_NX; i++) {
    const idx = j * GRID_NX + i;
    if (MASK[idx] < 0.5) continue;
    if (!(H[idx] > 1000)) continue;
    const d = Math.abs(i - iMid);
    if (d < bestDist) { bestDist = d; bestI = i; }
}
const i = bestI;
const pointIdx = j * GRID_NX + i;
const pointH = H[pointIdx];
const pointLon = LON[pointIdx];
const pointLat = LAT[pointIdx];

document.getElementById("decomp-point").innerHTML =
    `deep boundary point &middot; <code>j=${j}, i=${i}</code> &middot; ` +
    `${pointLon.toFixed(2)}&deg;E, ${pointLat.toFixed(2)}&deg;S &middot; H = ${pointH.toFixed(0)} m`;

// ---- 2. decompose the tide at that point over 72 h -------------------------
const HOURS = 72, NT = 300;
const ts = new Array(NT);
for (let k = 0; k < NT; k++) ts[k] = (k / (NT - 1)) * HOURS;

// scene_data.js declares these as top-level `const` in a classic script, so
// they're global lexical bindings (visible from this module by name) but not
// properties of `window` -- an explicit name->value map stands in for the
// dynamic `window[...]` lookup that would otherwise need.
const AMP_BY_NAME = {
    M4: TIDE_AMP_M4_B64, K2: TIDE_AMP_K2_B64, S2: TIDE_AMP_S2_B64, M2: TIDE_AMP_M2_B64,
    N2: TIDE_AMP_N2_B64, K1: TIDE_AMP_K1_B64, P1: TIDE_AMP_P1_B64, O1: TIDE_AMP_O1_B64,
    Q1: TIDE_AMP_Q1_B64, MF: TIDE_AMP_MF_B64, MM: TIDE_AMP_MM_B64,
};
const PHASE_BY_NAME = {
    M4: TIDE_PHASE_M4_B64, K2: TIDE_PHASE_K2_B64, S2: TIDE_PHASE_S2_B64, M2: TIDE_PHASE_M2_B64,
    N2: TIDE_PHASE_N2_B64, K1: TIDE_PHASE_K1_B64, P1: TIDE_PHASE_P1_B64, O1: TIDE_PHASE_O1_B64,
    Q1: TIDE_PHASE_Q1_B64, MF: TIDE_PHASE_MF_B64, MM: TIDE_PHASE_MM_B64,
};

// each constituent's own curve is kept (not just summed) so a click can
// re-style one of them without recomputing anything.
const constituents = {};
const sum = new Array(NT).fill(0);
TIDE_NAMES.forEach((name, ci) => {
    const amp = b64f32(AMP_BY_NAME[name]);
    const phase = b64f32(PHASE_BY_NAME[name]);
    const T = TIDE_PERIOD_HOURS[ci];
    const A = amp[pointIdx];
    const phDeg = phase[pointIdx];
    // phase is in degrees (values run well past 2*pi) -- convert to radians.
    const phRad = phDeg * Math.PI / 180;
    const ys = new Array(NT);
    for (let k = 0; k < NT; k++) {
        const v = A * Math.cos(2 * Math.PI * ts[k] / T - phRad);
        ys[k] = v;
        sum[k] += v;
    }
    constituents[name] = { ys, amp: A, period: T };
});

let selected = null;
function redrawDecomp() {
    const series = TIDE_NAMES.map(name => {
        const isSel = name === selected;
        return { ys: constituents[name].ys, color: isSel ? "#f2a63c" : "rgba(255,255,255,0.18)", width: isSel ? 2.5 : 1 };
    });
    series.push({ ys: sum, color: "#5cb3ff", width: 2.5 });
    drawSeries(document.getElementById("decomp-canvas"), series, { zeroLine: true });
}
redrawDecomp();

// Select an individual forcing constituent.
const pickerEl = document.getElementById("constituent-picker");
const infoEl = document.getElementById("constituent-info");
const namesByAmp = [...TIDE_NAMES].sort((a, b) => constituents[b].amp - constituents[a].amp);
namesByAmp.forEach(name => {
    const btn = document.createElement("button");
    btn.className = "tide-chip";
    btn.textContent = name;
    btn.addEventListener("click", () => {
        selected = selected === name ? null : name;
        Array.from(pickerEl.children).forEach(b => b.classList.toggle("active", b.textContent === selected));
        redrawDecomp();
        infoEl.innerHTML = selected
            ? `<code>${selected}</code> &middot; period ${constituents[selected].period.toFixed(2)} h &middot; amplitude ${constituents[selected].amp.toFixed(2)} m here`
            : "";
    });
    pickerEl.appendChild(btn);
});
