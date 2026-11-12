import * as THREE from "three";

/* Clip the native mask at the halfway point of wet/dry grid edges. */
export function oceanSurfaceGeometry(nx, ny, mask, x, z, stride, textureWidth, textureHeight) {
    const positions = [];
    const uv = [];
    const samples = [];
    const gridCoordinates = [];
    const coastal = [];
    const triangles = [];
    const crossings = new Map();

    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        positions.push(x[k], 0, z[k]);
        uv.push((Math.min(i / stride, textureWidth - 1) + 0.5) / textureWidth,
            (Math.min(j / stride, textureHeight - 1) + 0.5) / textureHeight);
        samples.push(k);
        gridCoordinates.push(i,j);
        coastal.push(0);
    }

    function crossing(a, b) {
        const key = Math.min(a, b) + ":" + Math.max(a, b);
        if (crossings.has(key)) return crossings.get(key);
        const index = samples.length;
        positions.push((x[a] + x[b]) * 0.5, 0, (z[a] + z[b]) * 0.5);
        uv.push((uv[a * 2] + uv[b * 2]) * 0.5, (uv[a * 2 + 1] + uv[b * 2 + 1]) * 0.5);
        samples.push(mask[a] >= 0.5 ? a : b);
        gridCoordinates.push((gridCoordinates[a*2]+gridCoordinates[b*2])*.5,(gridCoordinates[a*2+1]+gridCoordinates[b*2+1])*.5);
        coastal.push(1);
        crossings.set(key, index);
        return index;
    }

    function triangle(a, b, c) {
        const wetCount = Number(mask[a] >= 0.5) + Number(mask[b] >= 0.5) + Number(mask[c] >= 0.5);
        if (!wetCount) return;
        if (wetCount === 3) {
            triangles.push(a, b, c);
            return;
        }
        const input = [a, b, c];
        const polygon = [];
        let previous = c;
        for (const current of input) {
            if ((mask[previous] >= 0.5) !== (mask[current] >= 0.5)) polygon.push(crossing(previous, current));
            if (mask[current] >= 0.5) polygon.push(current);
            previous = current;
        }
        for (let i = 1; i < polygon.length - 1; i++) triangles.push(polygon[0], polygon[i], polygon[i + 1]);
    }

    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        triangle(a, a + 1, a + nx);
        triangle(a + 1, a + nx + 1, a + nx);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(triangles);
    return { geometry, samples: new Uint32Array(samples), coastal: new Uint8Array(coastal), gridCoordinates: new Float32Array(gridCoordinates) };
}

/* Fill non-visible land texels from the nearest wet sample to prevent dark seams. */
export function nearestWetSamples(mask, width, height) {
    const nearest = new Int32Array(mask.length).fill(-1);
    const queue = [];
    for (let k = 0; k < mask.length; k++) if (mask[k]) {
        nearest[k] = k;
        queue.push(k);
    }
    for (let head = 0; head < queue.length; head++) {
        const k = queue[head], x = k % width, y = Math.floor(k / width);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const xx = x + dx, yy = y + dy, next = yy * width + xx;
            if (xx >= 0 && xx < width && yy >= 0 && yy < height && nearest[next] < 0) {
                nearest[next] = nearest[k];
                queue.push(next);
            }
        }
    }
    return nearest;
}
