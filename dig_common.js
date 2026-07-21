// Shared helpers for the dig-down pages (dig_boundary / dig_tides /
// dig_rivers / dig_weather). Deliberately standalone -- the guided flow's
// assembly_scene.js stays a monolith; these pages only need decoding,
// colour ramps, small canvas charts and a common header. Colour semantics
// mirror assembly_scene.js exactly so a field looks the same on every page.

export function b64f32(b64) {
    const bin = atob(b64), n = bin.length;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
}

export function b64u8(b64) {
    const bin = atob(b64), n = bin.length;
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function hexRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
    };
}
function lerpColor(a, b, t) {
    const ca = hexRgb(a), cb = hexRgb(b);
    return { r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t };
}
export function colormap(t, stops) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1, seg = t * n, i = Math.min(n - 1, Math.floor(seg));
    return lerpColor(stops[i], stops[i + 1], seg - i);
}
export function cssColor(c) {
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
}

// same ramps as assembly_scene.js
export const WARM_STOPS = ["#2b5faa", "#6fb1c9", "#f2e394", "#e0782f", "#a8281f"];
export const SALT_STOPS = ["#1a3a2e", "#2f7a6e", "#5cd6c4", "#a8e6da", "#e8f7f0"];
export const BATHY_STOPS = ["#d8f2ea", "#5cd6c4", "#2e8fc9", "#1a4a8e", "#0a1230"];
export const DIVERGING_STOPS = ["#2166ac", "#67a9cf", "#f7f7f7", "#ef8a62", "#b2182b"];
export const PROV = {
    original: { label: "Original", color: "#5dcaa5" },
    rebuilt: { label: "Rebuilt", color: "#4fa8ff" },
    reconstructed: { label: "Reconstructed", color: "#f2a63c" },
};

export function wetMinMax(arr, wetTest) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < arr.length; k++) {
        const v = arr[k];
        if (!Number.isFinite(v)) continue;
        if (wetTest && !wetTest(k)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return [lo, hi];
}

// multi-series line chart with NaN gaps. series: [{ys, color, width?, dots?}]
export function drawSeries(canvas, series, opts = {}) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
    ctx.clearRect(0, 0, w, h);
    let lo = opts.ymin, hi = opts.ymax;
    if (lo === undefined || hi === undefined) {
        lo = Infinity; hi = -Infinity;
        series.forEach(s => s.ys.forEach(v => {
            if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        }));
    }
    const pad = 8, span = hi - lo || 1;
    const px = (i, n) => pad + (i / Math.max(1, n - 1)) * (w - 2 * pad);
    const py = (v) => h - pad - ((v - lo) / span) * (h - 2 * pad);
    if (opts.zeroLine && lo < 0 && hi > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad, py(0)); ctx.lineTo(w - pad, py(0)); ctx.stroke();
    }
    series.forEach(s => {
        const n = s.ys.length;
        if (s.dots) {
            ctx.fillStyle = s.color;
            for (let i = 0; i < n; i++) if (Number.isFinite(s.ys[i])) {
                ctx.beginPath(); ctx.arc(px(i, n), py(s.ys[i]), s.width || 3, 0, 2 * Math.PI); ctx.fill();
            }
            return;
        }
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2.5; ctx.beginPath();
        let pen = false;
        for (let i = 0; i < n; i++) {
            const v = s.ys[i];
            if (!Number.isFinite(v)) { pen = false; continue; }
            if (pen) ctx.lineTo(px(i, n), py(v)); else { ctx.moveTo(px(i, n), py(v)); pen = true; }
        }
        ctx.stroke();
    });
    return { lo, hi };
}

// common page header: class badge + title + one bare sentence + back link
export function mountHeader(el, { prov, title, sentence, source }) {
    const p = PROV[prov];
    el.innerHTML = `
      <a class="back-link" href="index.html#parts">&larr; Back to the parts</a>
      <div class="layer-title">${title}</div>
      <div class="prov-pair">
        <div class="prov-badge" style="--c:${p.color}"><span class="dot"></span>${p.label}</div>
        ${source ? `<code class="src">${source}</code>` : ""}
      </div>
      <div class="layer-note">${sentence}</div>`;
}
