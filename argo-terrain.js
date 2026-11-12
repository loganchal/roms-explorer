// Sample the actual rendered seabed triangles at a world-space X/Z position.
// This performs no coordinate remapping or geographic relocation.
export function createArgoTerrain(terrainMesh) {
    const geometry = terrainMesh.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index.array;
    const bins = new Map();
    const cellSize = 4;
    for (let offset = 0; offset < indices.length; offset += 3) {
        const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2];
        const ax = positions.getX(a), az = positions.getZ(a);
        const bx = positions.getX(b), bz = positions.getZ(b);
        const cx = positions.getX(c), cz = positions.getZ(c);
        const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(denominator) < 1e-12) continue;
        const triangle = { ax, az, bx, bz, cx, cz, ay: positions.getY(a), by: positions.getY(b), cy: positions.getY(c), denominator };
        const x0 = Math.floor(Math.min(ax, bx, cx) / cellSize), x1 = Math.floor(Math.max(ax, bx, cx) / cellSize);
        const z0 = Math.floor(Math.min(az, bz, cz) / cellSize), z1 = Math.floor(Math.max(az, bz, cz) / cellSize);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
            const key = x + "," + z;
            if (!bins.has(key)) bins.set(key, []);
            bins.get(key).push(triangle);
        }
    }
    function sample(x, z) {
        const candidates = bins.get(Math.floor(x / cellSize) + "," + Math.floor(z / cellSize));
        if (!candidates) return null;
        let y = null;
        for (const t of candidates) {
            const u = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / t.denominator;
            const v = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / t.denominator;
            const w = 1 - u - v;
            if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
            const value = u * t.ay + v * t.by + w * t.cy;
            y = y === null ? value : Math.max(y, value);
        }
        return y === null ? null : { y, wet: y < -1e-7 };
    }
    // The height is affine inside each rendered triangle. Clipping the
    // ribbon's bottom edge against every intersected triangle finds its exact
    // shallowest seabed, including ridges between the edge's corner samples.
    function segment(x0, z0, x1, z1) {
        const candidates = new Set();
        for (let x = Math.floor(Math.min(x0, x1) / cellSize); x <= Math.floor(Math.max(x0, x1) / cellSize); x++) {
            for (let z = Math.floor(Math.min(z0, z1) / cellSize); z <= Math.floor(Math.max(z0, z1) / cellSize); z++) {
                for (const triangle of bins.get(x + "," + z) || []) candidates.add(triangle);
            }
        }
        let highest = -Infinity;
        const intervals = [];
        for (const t of candidates) {
            const barycentric = (x, z) => {
                const u = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / t.denominator;
                const v = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / t.denominator;
                return [u, v, 1 - u - v];
            };
            const a = barycentric(x0, z0), b = barycentric(x1, z1);
            let lo = 0, hi = 1;
            for (let k = 0; k < 3; k++) {
                const delta = b[k] - a[k];
                if (Math.abs(delta) < 1e-12) {
                    if (a[k] < -1e-7) { lo = 1; hi = 0; break; }
                } else if (delta > 0) lo = Math.max(lo, -a[k] / delta);
                else hi = Math.min(hi, -a[k] / delta);
            }
            if (lo > hi + 1e-7) continue;
            lo = Math.max(0, Math.min(1, lo)); hi = Math.max(0, Math.min(1, hi));
            const y0 = a[0] * t.ay + a[1] * t.by + a[2] * t.cy;
            const y1 = b[0] * t.ay + b[1] * t.by + b[2] * t.cy;
            highest = Math.max(highest, y0 + (y1 - y0) * lo, y0 + (y1 - y0) * hi);
            intervals.push([lo, hi]);
        }
        intervals.sort((a, b) => a[0] - b[0]);
        let covered = 0;
        for (const [lo, hi] of intervals) {
            if (lo > covered + 1e-6) return null;
            covered = Math.max(covered, hi);
        }
        return covered >= 1 - 1e-6 && Number.isFinite(highest) ? { y: highest, wet: highest < -1e-7 } : null;
    }
    function sampleCross(x, z, halfWidth) {
        const horizontal = segment(x - halfWidth, z, x + halfWidth, z);
        const vertical = segment(x, z - halfWidth, x, z + halfWidth);
        if (!horizontal || !vertical) return null;
        const y = Math.max(horizontal.y, vertical.y);
        return { y, wet: horizontal.wet && vertical.wet };
    }
    return { sample, sampleCross, crossSample: sampleCross };
}
