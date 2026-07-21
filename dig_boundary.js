import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { b64f32, colormap, WARM_STOPS, SALT_STOPS, mountHeader } from "./dig_common.js";

// Dig page: the north wall's open-boundary story, GLORYS source vs the
// finished ROMS boundary file, side by side as two parallel curtains. Same
// convention as assembly_scene.js's boundary step (which this borrows the
// geometry approach from) but standalone: no step system, no other walls,
// just north, and a fixed left card instead of the guided-tour panel.

const WORLD_WIDTH = 300;      // world units spanning the shared lon extent
const CURTAIN_DEPTH = 150;    // world units spanning 0 -> MAX_DEPTH_M
const GAP_Z = 40;             // separation between the two curtains
const GLORYS_Z = GAP_Z / 2;   // GLORYS in front (toward the default camera)
const BND_Z = -GAP_Z / 2;     // ROMS boundary wall behind it

const BND_LON_NORTH = b64f32(BND_LON_NORTH_B64);
const BND_H_NORTH = b64f32(BND_H_NORTH_B64);
const BND_TEMP_NORTH = b64f32(BND_TEMP_NORTH_B64);
const BND_SALT_NORTH = b64f32(BND_SALT_NORTH_B64);
const N_SRHO = BND_N_SRHO;

const GLORYS_LON = b64f32(GLORYS_LON_B64);
const GLORYS_DEPTH = b64f32(GLORYS_DEPTH_B64);
const GLORYS_TEMP_NORTH = b64f32(GLORYS_TEMP_NORTH_B64);
const GLORYS_SALT_NORTH = b64f32(GLORYS_SALT_NORTH_B64);

// -- shared lon -> x and depth -> y mapping, used identically by both
// curtains so a feature at the same real lon/depth lands at the same world
// position regardless of which dataset it came from.
function minMaxOf(...arrays) {
    let lo = Infinity, hi = -Infinity;
    for (const arr of arrays) for (let i = 0; i < arr.length; i++) {
        if (arr[i] < lo) lo = arr[i];
        if (arr[i] > hi) hi = arr[i];
    }
    return [lo, hi];
}
const [lonLo, lonHi] = minMaxOf(GLORYS_LON, BND_LON_NORTH);
const lonMid = (lonLo + lonHi) / 2;
const SCALE_X = WORLD_WIDTH / (lonHi - lonLo);
function lonToX(lon) { return (lon - lonMid) * SCALE_X; }

const MAX_DEPTH_M = Math.max(minMaxOf(BND_H_NORTH)[1], minMaxOf(GLORYS_DEPTH)[1]);
function depthToY(depth_m) { return -(depth_m / MAX_DEPTH_M) * CURTAIN_DEPTH; }

// -- shared colour range per field: union of finite values across BOTH
// curtains, so a warm cell reads the same warmth whether it's GLORYS or the
// regridded boundary file -- only the mesh structure should differ.
function finiteMinMax(...arrays) {
    let lo = Infinity, hi = -Infinity;
    for (const arr of arrays) for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return [lo, hi];
}
const FIELDS = {
    temp: { label: "Temperature", stops: WARM_STOPS, bnd: BND_TEMP_NORTH, glorys: GLORYS_TEMP_NORTH, range: finiteMinMax(BND_TEMP_NORTH, GLORYS_TEMP_NORTH) },
    salt: { label: "Salinity", stops: SALT_STOPS, bnd: BND_SALT_NORTH, glorys: GLORYS_SALT_NORTH, range: finiteMinMax(BND_SALT_NORTH, GLORYS_SALT_NORTH) },
};

// -- the finished boundary wall: BND_N_SRHO sigma levels at their REAL
// Vtransform=2 depths (S_RHO/CS_R/HC from scene_data, zeta=0) -- the two
// curtains share one depth axis, so water at the same real depth must land
// at the same y on both. An even-fraction spread here would paint warm
// near-surface sigma levels hundreds of metres too deep next to GLORYS's
// true z-levels and make the shared colourbar look broken.
function sigmaDepth(h, s) {
    const Zo = (HC * S_RHO[s] + CS_R[s] * h) / (HC + h);
    return -Zo * h; // metres below the surface (positive down), zeta = 0
}
function buildWallGeometry() {
    const n = BND_LON_NORTH.length;
    const positions = new Float32Array(N_SRHO * n * 3);
    const index = [];
    for (let s = 0; s < N_SRHO; s++) {
        for (let i = 0; i < n; i++) {
            const k = s * n + i;
            const y = depthToY(sigmaDepth(BND_H_NORTH[i], s));
            positions[k * 3] = lonToX(BND_LON_NORTH[i]);
            positions[k * 3 + 1] = y;
            positions[k * 3 + 2] = BND_Z;
        }
    }
    for (let s = 0; s < N_SRHO - 1; s++) for (let i = 0; i < n - 1; i++) {
        const a = s * n + i, b = s * n + i + 1, c = (s + 1) * n + i, d = (s + 1) * n + i + 1;
        index.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N_SRHO * n * 3), 3));
    geo.setIndex(index);
    return geo;
}
function paintWall(geo, key) {
    const f = FIELDS[key], col = geo.attributes.color, [lo, hi] = f.range;
    const n = BND_LON_NORTH.length;
    for (let k = 0; k < N_SRHO * n; k++) {
        const c = colormap((f.bnd[k] - lo) / (hi - lo || 1), f.stops);
        col.setXYZ(k, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
}

// -- the raw GLORYS source slice: one flat-coloured quad per native cell,
// cell edges at the midpoint between neighbouring lon/depth samples, NaN
// (below the real seabed there) simply omitted so the gap under the
// seafloor is visible rather than painted over.
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
const glorysX = Float32Array.from(glorysLonEdges, lonToX);
const glorysY = Float32Array.from(glorysDepthEdges, depthToY);
const glorysCells = [];
for (let s = 0; s < GLORYS_NZ; s++) for (let i = 0; i < GLORYS_NLON; i++) {
    if (!Number.isNaN(GLORYS_TEMP_NORTH[s * GLORYS_NLON + i])) glorysCells.push(s * GLORYS_NLON + i);
}
function buildSourceGeometry() {
    const positions = new Float32Array(glorysCells.length * 4 * 3);
    const index = [];
    glorysCells.forEach((cellIdx, q) => {
        const s = Math.floor(cellIdx / GLORYS_NLON), i = cellIdx % GLORYS_NLON;
        const x0 = glorysX[i], x1 = glorysX[i + 1], y0 = glorysY[s], y1 = glorysY[s + 1];
        const vo = q * 4;
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        corners.forEach(([x, y], c) => {
            const vi = (vo + c) * 3;
            positions[vi] = x; positions[vi + 1] = y; positions[vi + 2] = GLORYS_Z;
        });
        index.push(vo, vo + 1, vo + 2, vo, vo + 2, vo + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(glorysCells.length * 4 * 3), 3));
    geo.setIndex(index);
    return geo;
}
function paintSource(geo, key) {
    const f = FIELDS[key], col = geo.attributes.color, [lo, hi] = f.range;
    glorysCells.forEach((cellIdx, q) => {
        const c = colormap((f.glorys[cellIdx] - lo) / (hi - lo || 1), f.stops);
        const vo = q * 4;
        for (let v = 0; v < 4; v++) col.setXYZ(vo + v, c.r, c.g, c.b);
    });
    col.needsUpdate = true;
}

// -- scene -------------------------------------------------------------
const viewport = document.getElementById("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera.position.set(60, 90, 260);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x0a0e14, 0.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 0.6);
sun.position.set(220, 420, 160);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 60;
controls.maxDistance = 700;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.target.set(0, -CURTAIN_DEPTH / 2, 0);
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
}
window.addEventListener("resize", resize);
resize();

// faint sea-surface guide spanning both curtains, so "0 m" reads as a plane
// rather than having to infer it from the wall tops alone.
const guideGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-WORLD_WIDTH / 2, 0, GLORYS_Z), new THREE.Vector3(WORLD_WIDTH / 2, 0, GLORYS_Z),
    new THREE.Vector3(-WORLD_WIDTH / 2, 0, BND_Z), new THREE.Vector3(WORLD_WIDTH / 2, 0, BND_Z),
]);
guideGeo.setIndex([0, 1, 2, 3]);
scene.add(new THREE.LineSegments(guideGeo, new THREE.LineBasicMaterial({ color: 0x3a4a5c, transparent: true, opacity: 0.5 })));

const wallGeo = buildWallGeometry();
const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
scene.add(wallMesh);

const sourceGeo = buildSourceGeometry();
const sourceMesh = new THREE.Mesh(sourceGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
scene.add(sourceMesh);

function setField(key) {
    paintWall(wallGeo, key);
    paintSource(sourceGeo, key);
    const buttons = document.getElementById("boundary-field-buttons");
    if (buttons) Array.from(buttons.children).forEach(b => b.classList.toggle("active", b.dataset.key === key));
}
setField("temp");

const fieldEl = document.getElementById("boundary-field-buttons");
Object.entries(FIELDS).forEach(([key, f]) => {
    const btn = document.createElement("button");
    btn.textContent = f.label;
    btn.dataset.key = key;
    btn.className = key === "temp" ? "active" : "";
    btn.addEventListener("click", () => setField(key));
    fieldEl.appendChild(btn);
});

mountHeader(document.getElementById("dig-header"), {
    prov: "rebuilt",
    title: "Open boundaries",
    sentence: "GLORYS z-levels rebuilt to 5 km sigma with seapy, the hindcast's own tooling.",
    source: "nz5km_N50_bnd_202101.nc",
});

// -- floating labels: projected once per frame so they stay pinned to their
// curtain through the orbit rather than sitting at fixed screen corners.
const glorysLabelEl = document.getElementById("glorys-label");
const bndLabelEl = document.getElementById("bnd-label");
const glorysAnchor = new THREE.Vector3(-70, 18, GLORYS_Z);
const bndAnchor = new THREE.Vector3(70, 18, BND_Z);
function placeLabel(el, worldPos) {
    const v = worldPos.clone().project(camera);
    if (v.z > 1) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.style.left = `${(v.x * 0.5 + 0.5) * viewport.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * viewport.clientHeight}px`;
}

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    controls.update(clock.getDelta());
    placeLabel(glorysLabelEl, glorysAnchor);
    placeLabel(bndLabelEl, bndAnchor);
    renderer.render(scene, camera);
}
animate();
