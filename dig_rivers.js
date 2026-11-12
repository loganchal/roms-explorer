// MetOcean river forcing detail page.
// Plan-view map of the domain (from MASK_RHO) with the 47 river point
// sources plotted as green dots. Click a dot to see its transport and
// vertical injection profile (vshape).

import { b64f32, mountHeader, PROV } from "./dig_common.js?v=20261112-direct-return";

mountHeader(document.getElementById("header-mount"), {
    prov: "metocean",
    title: "Rivers",
    sentence: "River forcing provided by MetOcean.",
    source: "nz5km_N50_rivers.nc",
});

const RIVER_COLOR = PROV.metocean.color;
const LAND_COLOR = "#2a2f36";
const WATER_COLOR = "#050810";

const lonRho = b64f32(LON_RHO_B64);
const latRho = b64f32(LAT_RHO_B64);
const mask = b64f32(MASK_RHO_B64);
const NY = GRID_NY, NX = GRID_NX;

// -- domain bounds + equirectangular-ish projection (cos-lat x-scale) -----
let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
for (let k = 0; k < lonRho.length; k++) {
    const lo = lonRho[k], la = latRho[k];
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
    if (lo < lonMin) lonMin = lo; if (lo > lonMax) lonMax = lo;
    if (la < latMin) latMin = la; if (la > latMax) latMax = la;
}
const cosLat = Math.cos((latMin + latMax) / 2 * Math.PI / 180);

// pre-filter land cells once -- mask never changes, no need to rescan on resize
const landLon = [], landLat = [];
for (let k = 0; k < mask.length; k++) {
    if (mask[k] >= 0.5) continue; // water, skip
    const lo = lonRho[k], la = latRho[k];
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
    landLon.push(lo); landLat.push(la);
}

const maxTransport = Math.max(...RIVERS.map(r => r.transport));
function radiusFor(t) {
    const norm = Math.sqrt(t) / Math.sqrt(maxTransport);
    return Math.max(2, Math.min(10, 2 + norm * 8));
}

const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d");

let scaleX, scaleY, offX, offY;
function computeProjection() {
    const W = canvas.width, H = canvas.height;
    const lonSpan = (lonMax - lonMin) * cosLat;
    const latSpan = (latMax - latMin);
    const s = Math.min(W / lonSpan, H / latSpan);
    scaleX = s * cosLat; scaleY = s;
    offX = (W - lonSpan * s) / 2;
    offY = (H - latSpan * s) / 2;
}
function project(lon, lat) {
    return [offX + (lon - lonMin) * scaleX, offY + (latMax - lat) * scaleY]; // north up
}

let selected = null;
let riverPositions = []; // recomputed every draw: {r, x, y, radius}

function draw() {
    computeProjection();
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = WATER_COLOR;
    ctx.fillRect(0, 0, W, H);

    // land, painted as small blocks sized to roughly tile the grid spacing
    const blockR = Math.max(1, Math.round((W / NX) / 2) + 1);
    ctx.fillStyle = LAND_COLOR;
    for (let n = 0; n < landLon.length; n++) {
        const [px, py] = project(landLon[n], landLat[n]);
        ctx.fillRect(Math.round(px) - blockR, Math.round(py) - blockR, blockR * 2 + 1, blockR * 2 + 1);
    }

    // rivers
    riverPositions = RIVERS.map(r => {
        const [x, y] = project(r.lon, r.lat);
        return { r, x, y, radius: radiusFor(r.transport) };
    });
    riverPositions.forEach(({ r, x, y, radius }) => {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = RIVER_COLOR;
        ctx.globalAlpha = r === selected ? 1 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (r === selected) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    });
}

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    draw();
}
window.addEventListener("resize", resize);
resize();

// -- river injection-profile chart (vshape fraction vs sigma level) -------
// vshape is stored bottom -> top: index 0 = seafloor, last index = surface.
function drawProfile(canvasEl, vshape) {
    const c = canvasEl.getContext("2d");
    const w = canvasEl.width = canvasEl.clientWidth * 2;
    const h = canvasEl.height = canvasEl.clientHeight * 2;
    c.clearRect(0, 0, w, h);
    const n = vshape.length;
    const maxV = Math.max(...vshape, 1e-6);
    const padL = 12, padR = 10, padT = 16, padB = 16;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const py = (idx) => padT + (1 - idx / (n - 1)) * plotH;
    const px = (v) => padL + (v / maxV) * plotW;

    // filled area
    c.beginPath();
    c.moveTo(padL, py(0));
    for (let idx = 0; idx < n; idx++) c.lineTo(px(vshape[idx]), py(idx));
    c.lineTo(padL, py(n - 1));
    c.closePath();
    c.fillStyle = "rgba(242,166,60,0.22)";
    c.fill();

    // line
    c.strokeStyle = RIVER_COLOR;
    c.lineWidth = 2.5;
    c.beginPath();
    for (let idx = 0; idx < n; idx++) {
        const x = px(vshape[idx]), y = py(idx);
        idx === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();

    // baseline
    c.strokeStyle = "rgba(255,255,255,0.15)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(padL, padT); c.lineTo(padL, h - padB); c.stroke();

    c.fillStyle = "rgba(255,255,255,0.4)";
    c.font = "20px -apple-system, sans-serif";
    c.textBaseline = "top";
    c.fillText("surface", padL + 4, padT + 2);
    c.textBaseline = "bottom";
    c.fillText("seafloor", padL + 4, h - padB - 2);
}

function selectRiver(r) {
    selected = r;
    const panel = document.getElementById("river-detail");
    panel.style.display = "block";
    document.getElementById("river-detail-text").innerHTML =
        `${r.transport.toFixed(0)} m&sup3;/s`;
    drawProfile(document.getElementById("riverChart"), r.vshape);
    draw();
}

canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const x = (ev.clientX - rect.left) * dpr;
    const y = (ev.clientY - rect.top) * dpr;
    let best = null, bestDist = Infinity;
    for (const rp of riverPositions) {
        const d = Math.hypot(rp.x - x, rp.y - y);
        if (d < bestDist) { bestDist = d; best = rp; }
    }
    const thresh = 12 * dpr;
    if (best && bestDist <= thresh) selectRiver(best.r);
});
