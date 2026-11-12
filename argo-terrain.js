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
    return { sample };
}
