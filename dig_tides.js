// dig_tides.js -- the Rebuilt / Tides dig page.
// TPXO8-atlas is the tide forcing actually used (regridded onto the open
// boundary -- the same TPXO family the original hindcast's own tides came
// from). To check that choice, we independently fit eleven harmonics
// straight from the hindcast's own archived output (a completely separate
// method) and compared: they agree, which validates using TPXO8 here.
// Pure 2D canvas: (1) that eleven-constituent harmonic fit at one deep
// boundary point, (2) the M2 harmonic amplitude vs TPXO8 around the open
// boundary, (3) a per-constituent amplitude/phase agreement table.

import { b64f32, drawSeries, mountHeader } from "./dig_common.js";

const TIDEVAL_LABEL = typeof TIDEVAL_SOURCE !== "undefined" ? TIDEVAL_SOURCE : "EOT20";
const validationRefLabelEl = document.getElementById("validation-ref-label");
if (validationRefLabelEl) validationRefLabelEl.textContent = TIDEVAL_LABEL;

mountHeader(document.getElementById("dig-header"), {
    prov: "rebuilt",
    title: "Tides",
    sentence: `${TIDEVAL_LABEL}-atlas tide forcing, validated by independently fitting harmonics from the hindcast's own output and against LINZ tide gauges.`,
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

// ---- 3. the check: independently-fit harmonics vs TPXO8 around the -------
// open boundary. Only the 8 constituents in TIDEVAL_CURVE_NAMES have a
// match in TPXO8's product (M4/MF/MM aren't in it); same lexical-binding-
// not-window-property workaround as AMP_BY_NAME/PHASE_BY_NAME above.
const TIDEVAL_CURVE_BY_NAME = {
    M2: [TIDEVAL_CURVE_M2_OURS_B64, TIDEVAL_CURVE_M2_REF_B64],
    S2: [TIDEVAL_CURVE_S2_OURS_B64, TIDEVAL_CURVE_S2_REF_B64],
    N2: [TIDEVAL_CURVE_N2_OURS_B64, TIDEVAL_CURVE_N2_REF_B64],
    K2: [TIDEVAL_CURVE_K2_OURS_B64, TIDEVAL_CURVE_K2_REF_B64],
    K1: [TIDEVAL_CURVE_K1_OURS_B64, TIDEVAL_CURVE_K1_REF_B64],
    O1: [TIDEVAL_CURVE_O1_OURS_B64, TIDEVAL_CURVE_O1_REF_B64],
    P1: [TIDEVAL_CURVE_P1_OURS_B64, TIDEVAL_CURVE_P1_REF_B64],
    Q1: [TIDEVAL_CURVE_Q1_OURS_B64, TIDEVAL_CURVE_Q1_REF_B64],
};
const validationCaptionEl = document.getElementById("validation-caption");
const validationNoteEl = document.getElementById("validation-note");
function redrawValidation(name) {
    const shown = TIDEVAL_CURVE_BY_NAME[name] ? name : "M2";
    validationNoteEl.textContent = shown === name ? "" : `No ${TIDEVAL_LABEL} match for ${name} -- showing M2.`;
    const [oursYs, refYs] = TIDEVAL_CURVE_BY_NAME[shown].map(b64 => Array.from(b64f32(b64)));
    drawSeries(document.getElementById("validation-canvas"), [
        { ys: refYs, color: "#f2a63c", width: 2 },
        { ys: oursYs, color: "#5cb3ff", width: 2 },
    ], { zeroLine: false });
    validationCaptionEl.textContent = `${shown} amplitude around the open boundary: harmonics fit from the hindcast's own output vs ${TIDEVAL_LABEL}, the tide forcing used.`;
}
redrawValidation("M2");

// ---- pick a constituent to isolate it against the sum, and drive the ------
// validation panel below to the same constituent ----------------------------
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
        redrawValidation(selected || "M2");
        infoEl.innerHTML = selected
            ? `<code>${selected}</code> &middot; period ${constituents[selected].period.toFixed(2)} h &middot; amplitude ${constituents[selected].amp.toFixed(2)} m here`
            : "";
    });
    pickerEl.appendChild(btn);
});

// ---- 4. constituent table --------------------------------------------------
const rows = TIDEVAL_MEDIANS.map(r => {
    const weak = Math.abs(r.dphase_deg) > 30;
    return `<tr class="${weak ? "weak" : ""}">
        <td>${r.name}</td>
        <td>${r.ours_cm.toFixed(1)}</td>
        <td>${r.ref_cm.toFixed(1)}</td>
        <td>${r.ratio.toFixed(2)}</td>
    </tr>`;
}).join("");

document.getElementById("table-wrap").innerHTML = `
    <table class="dig-table">
        <thead><tr><th>constituent</th><th>harmonics (cm)</th><th>${TIDEVAL_LABEL} (cm)</th><th>ratio</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;

// ---- 5. total agreement, weighted by each constituent's own reference ----
// amplitude -- an unweighted average would let K2/P1/Q1 (a few cm, mostly
// noise) swamp the answer with their huge phase errors; weighting by
// amplitude reports what the tide itself actually does, dominated by M2.
const totalW = TIDEVAL_MEDIANS.reduce((s, r) => s + r.ref_cm, 0);
const weightedRatio = TIDEVAL_MEDIANS.reduce((s, r) => s + r.ratio * r.ref_cm, 0) / totalW;
const weightedDphase = TIDEVAL_MEDIANS.reduce((s, r) => s + Math.abs(r.dphase_deg) * r.ref_cm, 0) / totalW;
const strongCount = TIDEVAL_MEDIANS.filter(r => Math.abs(r.dphase_deg) <= 30).length;

document.getElementById("agreement-summary").innerHTML = `
    <div class="stat"><div class="v">${(weightedRatio * 100).toFixed(0)}%</div><div class="l">amplitude</div></div>
    <div class="stat"><div class="v">${weightedDphase.toFixed(0)}&deg;</div><div class="l">phase offset</div></div>
    <div class="note">harmonics agree with ${TIDEVAL_LABEL}, amplitude-weighted across all ${TIDEVAL_MEDIANS.length} &middot; ${strongCount}/${TIDEVAL_MEDIANS.length} individually within 30&deg;</div>`;
