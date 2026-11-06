import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Shared three.js scene builder for the ROMS extension domain explorer.
// Each page calls mountExplorer(config) after its own DOM (#viewport,
// #inspector-body, optional layer controls) is in place. Data decoding runs
// once at module scope since every page loads this as a fresh module
// instance anyway (no build step means no real cross-page sharing at
// runtime, only shared source).

// ---------------------------------------------------------------------------
// constants + small helpers
// ---------------------------------------------------------------------------
const XY_SCALE = 18;      // world units per degree of lon/lat
const KM_PER_DEG = 111;
const NY = GRID_NY, NX = GRID_NX;

function b64f32(s) {
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Float32Array(buf.buffer);
}

function depthToY(h_m, exag) {
    return -(h_m / 1000 / KM_PER_DEG) * XY_SCALE * exag;
}

function lonLatToXZ(lon, lat, lonMid, latMid) {
    // z is negated: with this scene's camera looking toward -Z, +Z renders
    // toward the bottom of the screen, so north (higher lat) must map to -Z
    // to appear at the top -- verified against Auckland/Dunedin screen
    // projections (2026-07-17).
    return [(lon - lonMid) * XY_SCALE, -(lat - latMid) * XY_SCALE];
}

function lerpColor(c1, c2, t) {
    const a = new THREE.Color(c1), b = new THREE.Color(c2);
    return a.lerp(b, t);
}

function colormap(t, stops) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1;
    const seg = t * n;
    const i = Math.min(n - 1, Math.floor(seg));
    return lerpColor(stops[i], stops[i + 1], seg - i);
}

const BATHY_STOPS = ["#bfe3e0", "#5aa6c9", "#2e6f9e", "#123a63", "#081a33"];
const LAND_COLOR = new THREE.Color("#6b6a63");
const WARM_STOPS = ["#2b5faa", "#6fb1c9", "#f2e394", "#e0782f", "#a8281f"];
const NUDG_STOPS = ["#140b1f", "#5b2a86", "#c8632e", "#f2c53d"];
const TIDE_STOPS = ["#0b1f4d", "#1c7a8c", "#4fb478", "#e3d158"];

// ---------------------------------------------------------------------------
// decode packed fields (module scope: cheap, runs once per page load)
// ---------------------------------------------------------------------------
const lonRho = b64f32(LON_RHO_B64), latRho = b64f32(LAT_RHO_B64);
const H = b64f32(H_B64), MASK = b64f32(MASK_RHO_B64);
const CLIM_TEMP = b64f32(CLIM_TEMP_SURF_B64);
const NUDG = b64f32(NUDG_TRACER_SURF_B64);
const TIDE_AMP = b64f32(TIDE_AMP_M2_B64); // scene_data now packs every constituent as TIDE_AMP_<NAME>_B64; this view keeps showing M2

function minMax(arr) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] < lo) lo = arr[i];
        if (arr[i] > hi) hi = arr[i];
    }
    return [lo, hi];
}
const [lonLo, lonHi] = minMax(lonRho);
const [latLo, latHi] = minMax(latRho);
const lonMid = (lonLo + lonHi) / 2;
const latMid = (latLo + latHi) / 2;

function fieldRange(arr, maskArr) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < arr.length; k++) {
        if (maskArr[k] < 0.5) continue;
        if (arr[k] < lo) lo = arr[k];
        if (arr[k] > hi) hi = arr[k];
    }
    return [lo, hi];
}
const hRange = fieldRange(H, MASK);
const climRange = fieldRange(CLIM_TEMP, MASK);
const nudgLog = Float32Array.from(NUDG, v => Math.log10(Math.max(v, 1e-5)));
const nudgRange = fieldRange(nudgLog, MASK);
const tideRange = fieldRange(TIDE_AMP, MASK);

const DRAPES = {
    clim_temp: { field: CLIM_TEMP, range: climRange, stops: WARM_STOPS,
        label: "Climatology surface temp (C)", prov: "nz5km_N50_clim_202101.nc — interior nudging target, January 2021 snapshot" },
    nudging: { field: nudgLog, range: nudgRange, stops: NUDG_STOPS,
        label: "log10 nudging rate (1/day)", prov: "nz5km_nudg_N50.nc — recovered Souza et al. 4DVar nudging file; 1/day at the edge, 0.001/day floor inland" },
    tide_amp: { field: TIDE_AMP, range: tideRange, stops: TIDE_STOPS,
        label: "M2 elevation amplitude (m)", prov: "nz5km-tide.nc — reconstructed from archived output, validated vs EOT20 (M2 ratio ~1.002)" },
};

// ---------------------------------------------------------------------------
// mountExplorer(config): builds the scene into whatever DOM the page provides
// ---------------------------------------------------------------------------
export function mountExplorer(config = {}) {
    const cfg = {
        initialDrape: "bathymetry",
        overlays: { boundary: false, rivers: false, argo: false, wind: false },
        camera: { position: [0, 260, 340] },
        ...config,
    };

    const viewport = document.getElementById("viewport");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f6ef);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(200, 400, 150);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(...cfg.camera.position);
    if (cfg.camera.target) controls.target.set(...cfg.camera.target);
    controls.update();

    function resize() {
        const w = viewport.clientWidth, h = viewport.clientHeight;
        camera.aspect = w / h;
        // Fit the domain in narrow stages without changing orbital zoom.
        camera.zoom = Math.min(1, (w / h) / 1.8) * 0.9;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    window.addEventListener("resize", resize);
    new ResizeObserver(resize).observe(viewport);

    // -- terrain (always bathymetry-colored) + surface drape --------------
    function buildGridGeometry() {
        const positions = new Float32Array(NY * NX * 3);
        const index = [];
        for (let j = 0; j < NY; j++) {
            for (let i = 0; i < NX; i++) {
                const k = j * NX + i;
                const [x, z] = lonLatToXZ(lonRho[k], latRho[k], lonMid, latMid);
                positions[k * 3] = x;
                positions[k * 3 + 1] = 0;
                positions[k * 3 + 2] = z;
            }
        }
        for (let j = 0; j < NY - 1; j++) {
            for (let i = 0; i < NX - 1; i++) {
                const a = j * NX + i, b = j * NX + i + 1;
                const c = (j + 1) * NX + i, d = (j + 1) * NX + i + 1;
                index.push(a, b, c, b, d, c);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setIndex(index);
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(NY * NX * 3), 3));
        return geo;
    }

    const terrainGeo = buildGridGeometry();
    const surfaceGeo = buildGridGeometry();

    function setTerrainHeights(exag) {
        const pos = terrainGeo.attributes.position;
        for (let k = 0; k < NY * NX; k++) {
            pos.setY(k, MASK[k] < 0.5 ? 0 : depthToY(H[k], exag));
        }
        pos.needsUpdate = true;
        terrainGeo.computeVertexNormals();
    }

    function paintField(geo, field, range, stops) {
        const col = geo.attributes.color;
        const [lo, hi] = range;
        for (let k = 0; k < NY * NX; k++) {
            if (MASK[k] < 0.5) {
                col.setXYZ(k, LAND_COLOR.r, LAND_COLOR.g, LAND_COLOR.b);
                continue;
            }
            const t = (field[k] - lo) / (hi - lo || 1);
            const c = colormap(t, stops);
            col.setXYZ(k, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
    }

    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.userData = { kind: "terrain" };
    scene.add(terrainMesh);

    const surfaceMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.visible = false;
    surfaceMesh.userData = { kind: "surface" };
    scene.add(surfaceMesh);

    paintField(terrainGeo, H, hRange, BATHY_STOPS);

    function setDrape(mode) {
        if (mode === "bathymetry") {
            surfaceMesh.visible = false;
            return;
        }
        const d = DRAPES[mode];
        paintField(surfaceGeo, d.field, d.range, d.stops);
        surfaceMesh.visible = true;
    }

    // -- boundary wall (north edge curtain, colored by temperature) -------
    const bndLon = b64f32(BND_LON_NORTH_B64), bndH = b64f32(BND_H_NORTH_B64);
    const bndTemp = b64f32(BND_TEMP_NORTH_B64); // (BND_N_SRHO, nx) row-major
    const nxBnd = bndLon.length;
    const latNorth = latRho[(NY - 1) * NX];
    let currentExag = 22;

    function buildBoundaryWall() {
        const positions = new Float32Array(BND_N_SRHO * nxBnd * 3);
        const colors = new Float32Array(BND_N_SRHO * nxBnd * 3);
        const index = [];
        const [lo, hi] = fieldRange(bndTemp, new Float32Array(bndTemp.length).fill(1));
        for (let s = 0; s < BND_N_SRHO; s++) {
            const frac = s / (BND_N_SRHO - 1);
            for (let i = 0; i < nxBnd; i++) {
                const k = s * nxBnd + i;
                const [x, z] = lonLatToXZ(bndLon[i], latNorth, lonMid, latMid);
                const y = THREE.MathUtils.lerp(depthToY(bndH[i], currentExag), 0, frac);
                positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;
                const t = (bndTemp[k] - lo) / (hi - lo || 1);
                const c = colormap(t, WARM_STOPS);
                colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
            }
        }
        for (let s = 0; s < BND_N_SRHO - 1; s++) {
            for (let i = 0; i < nxBnd - 1; i++) {
                const a = s * nxBnd + i, b = s * nxBnd + i + 1;
                const c = (s + 1) * nxBnd + i, d = (s + 1) * nxBnd + i + 1;
                index.push(a, b, c, b, d, c);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.setIndex(index);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        mesh.userData = {
            kind: "boundary",
            label: "North open boundary",
            prov: "nz5km_N50_bnd_202101.nc — GLORYS regridded onto the NZ grid + 50 sigma levels via objective analysis (1/6° scale, weight 9)",
        };
        return mesh;
    }
    let boundaryGroup = buildBoundaryWall();
    boundaryGroup.visible = cfg.overlays.boundary;
    scene.add(boundaryGroup);

    // -- rivers -------------------------------------------------------------
    const riverGroup = new THREE.Group();
    const riverMat = new THREE.MeshBasicMaterial({ color: 0x4fa8ff });
    if (typeof RIVERS !== "undefined") {
        const maxTransport = Math.max(...RIVERS.map(r => r.transport));
        RIVERS.forEach(r => {
            const radius = 0.6 + 2.2 * Math.sqrt(r.transport / maxTransport);
            const geo = new THREE.SphereGeometry(radius, 12, 12);
            const mesh = new THREE.Mesh(geo, riverMat);
            const [x, z] = lonLatToXZ(r.lon, r.lat, lonMid, latMid);
            mesh.position.set(x, 2, z);
            mesh.userData = { kind: "river", river: r };
            riverGroup.add(mesh);
        });
    }
    riverGroup.visible = cfg.overlays.rivers;
    scene.add(riverGroup);

    // -- Argo floats ----------------------------------------------------
    const argoGroup = new THREE.Group();
    const argoMat = new THREE.MeshBasicMaterial({ color: 0xf2a63c });
    if (typeof ARGO_FLOATS !== "undefined") {
        ARGO_FLOATS.forEach(fl => {
            const geo = new THREE.SphereGeometry(1.1, 10, 10);
            const mesh = new THREE.Mesh(geo, argoMat);
            const [x, z] = lonLatToXZ(fl.lon, fl.lat, lonMid, latMid);
            mesh.position.set(x, 3.5, z);
            mesh.userData = { kind: "argo", float: fl };
            argoGroup.add(mesh);
        });
    }
    argoGroup.visible = cfg.overlays.argo;
    scene.add(argoGroup);

    // -- meteo wind (subsampled arrows) --------------------------------
    const uwind = b64f32(MET_UWIND_SNAP_B64), vwind = b64f32(MET_VWIND_SNAP_B64);
    const windGroup = new THREE.Group();
    const WIND_STEP = 14;
    for (let j = 0; j < NY; j += WIND_STEP) {
        for (let i = 0; i < NX; i += WIND_STEP) {
            const k = j * NX + i;
            if (MASK[k] < 0.5) continue;
            const spd = Math.hypot(uwind[k], vwind[k]);
            if (spd < 0.1) continue;
            const [x, z] = lonLatToXZ(lonRho[k], latRho[k], lonMid, latMid);
            const dir = new THREE.Vector3(uwind[k], 0, -vwind[k]).normalize();
            const len = Math.min(10, 1.5 + spd * 0.5);
            const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(x, 4, z), len, 0xe7ebf1, len * 0.35, len * 0.2);
            arrow.userData = { kind: "wind", speed: spd };
            windGroup.add(arrow);
        }
    }
    windGroup.visible = cfg.overlays.wind;
    scene.add(windGroup);

    // -- UI wiring (only if the page actually has these controls) ---------
    const drapeRadios = document.querySelectorAll('input[name="drape"]');
    drapeRadios.forEach(el => {
        if (el.value === cfg.initialDrape) el.checked = true;
        el.addEventListener("change", () => setDrape(el.value));
    });
    setDrape(cfg.initialDrape);

    function wireOverlayCheckbox(id, group) {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = group.visible;
        el.addEventListener("change", e => group.visible = e.target.checked);
    }
    wireOverlayCheckbox("ov-boundary", boundaryGroup);
    wireOverlayCheckbox("ov-rivers", riverGroup);
    wireOverlayCheckbox("ov-argo", argoGroup);
    wireOverlayCheckbox("ov-wind", windGroup);

    const vexagInput = document.getElementById("vexag");
    if (vexagInput) {
        vexagInput.addEventListener("input", () => {
            currentExag = parseFloat(vexagInput.value);
            setTerrainHeights(currentExag);
            scene.remove(boundaryGroup);
            boundaryGroup = buildBoundaryWall();
            const ovBoundary = document.getElementById("ov-boundary");
            boundaryGroup.visible = ovBoundary ? ovBoundary.checked : cfg.overlays.boundary;
            scene.add(boundaryGroup);
        });
    }
    setTerrainHeights(currentExag);

    // -- picking + inspector -----------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const inspectorBody = document.getElementById("inspector-body");

    function triFaceToGridCell(faceIndex, nx) {
        const trisPerRow = (nx - 1) * 2;
        const row = Math.floor(faceIndex / trisPerRow);
        const rem = faceIndex % trisPerRow;
        const col = Math.floor(rem / 2);
        return [row, col];
    }

    function showField(kv) {
        if (!inspectorBody) return;
        inspectorBody.innerHTML = "";
        kv.forEach(([k, v]) => {
            const div = document.createElement("div");
            div.className = "field";
            div.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
            inspectorBody.appendChild(div);
        });
    }

    function drawLineChart(canvas, xs, ys, color) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width = canvas.clientWidth * 2;
        const h = canvas.height = canvas.clientHeight * 2;
        ctx.clearRect(0, 0, w, h);
        const xlo = Math.min(...xs), xhi = Math.max(...xs);
        const ylo = Math.min(...ys), yhi = Math.max(...ys);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
        xs.forEach((x, idx) => {
            const px = ((x - xlo) / (xhi - xlo || 1)) * (w - 20) + 10;
            const py = h - (((ys[idx] - ylo) / (yhi - ylo || 1)) * (h - 20) + 10);
            idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
    }

    function inspectTerrain(hit, isSurface) {
        const [j, i] = triFaceToGridCell(hit.faceIndex, NX);
        const k = Math.min(NY - 1, j) * NX + Math.min(NX - 1, i);
        if (!isSurface) {
            showField([
                ["layer", "Bathymetry"],
                ["depth", `${H[k].toFixed(0)} m`],
                ["lon / lat", `${lonRho[k].toFixed(2)}, ${latRho[k].toFixed(2)}`],
            ]);
            inspectorBody && inspectorBody.insertAdjacentHTML("beforeend",
                `<div class="prov">nz5km_grd_horizontal.nc — 395x465 interior rho points, N=50 sigma levels</div>`);
            return;
        }
        const checked = document.querySelector('input[name="drape"]:checked');
        const mode = checked ? checked.value : cfg.initialDrape;
        const d = DRAPES[mode];
        if (!d) return;
        showField([
            ["layer", d.label],
            ["value", d.field[k].toFixed(3)],
            ["lon / lat", `${lonRho[k].toFixed(2)}, ${latRho[k].toFixed(2)}`],
        ]);
        inspectorBody && inspectorBody.insertAdjacentHTML("beforeend", `<div class="prov">${d.prov}</div>`);
    }

    function inspectRiver(r) {
        showField([
            ["layer", "River point source"],
            ["mean transport", `${r.transport.toFixed(1)} m³/s`],
            ["lon / lat", `${r.lon.toFixed(2)}, ${r.lat.toFixed(2)}`],
        ]);
        inspectorBody.insertAdjacentHTML("beforeend", `<div class="k" style="margin-top:8px">Vertical injection profile (surface plume)</div><canvas class="chart" id="riverChart"></canvas>`);
        inspectorBody.insertAdjacentHTML("beforeend",
            `<div class="prov">nz5km_N50_rivers.nc — Vshape chosen empirically against archived salinity fingerprints (top 10 m, thickness-weighted)</div>`);
        const sLevels = r.vshape.map((_, idx) => idx / (r.vshape.length - 1) - 1);
        drawLineChart(document.getElementById("riverChart"), r.vshape, sLevels, "#4fa8ff");
    }

    function inspectArgo(fl) {
        showField([
            ["layer", "Argo float profile"],
            ["float / cycle", fl.id],
            ["date", fl.time.slice(0, 10)],
            ["lon / lat", `${fl.lon.toFixed(2)}, ${fl.lat.toFixed(2)}`],
        ]);
        inspectorBody.insertAdjacentHTML("beforeend", `<div class="k" style="margin-top:8px">Temperature vs pressure</div><canvas class="chart" id="argoChart"></canvas>`);
        inspectorBody.insertAdjacentHTML("beforeend",
            `<div class="prov">Fetched directly from the Argo GDAC via the Argovis v3 API for ${ARGO_MONTH} — independent of this repo's CORA/MATLAB matchup pipeline</div>`);
        drawLineChart(document.getElementById("argoChart"), fl.temperature, fl.pressure, "#f2a63c");
    }

    function inspectBoundary(userData) {
        showField([["layer", userData.label]]);
        inspectorBody.insertAdjacentHTML("beforeend", `<div class="prov">${userData.prov}</div>`);
    }

    renderer.domElement.addEventListener("click", (ev) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const pickables = [terrainMesh];
        if (surfaceMesh.visible) pickables.push(surfaceMesh);
        if (boundaryGroup.visible) pickables.push(boundaryGroup);
        if (riverGroup.visible) pickables.push(...riverGroup.children);
        if (argoGroup.visible) pickables.push(...argoGroup.children);
        const hits = raycaster.intersectObjects(pickables, false);
        if (!hits.length) return;
        const hit = hits[0];
        const kind = hit.object.userData.kind;
        if (kind === "terrain") inspectTerrain(hit, false);
        else if (kind === "surface") inspectTerrain(hit, true);
        else if (kind === "river") inspectRiver(hit.object.userData.river);
        else if (kind === "argo") inspectArgo(hit.object.userData.float);
        else if (kind === "boundary") inspectBoundary(hit.object.userData);
    });

    // -- render loop --------------------------------------------------------
    resize();
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    const handles = { THREE, scene, camera, renderer, controls, terrainMesh, surfaceMesh, boundaryGroup, riverGroup, argoGroup, windGroup, setDrape, lonMid, latMid, lonLatToXZ, lonRho, latRho };
    window.__debug = handles; // harmless in production, useful for QA
    return handles;
}
