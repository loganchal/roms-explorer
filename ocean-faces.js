import * as THREE from "three";

// Lazy, depth-resolved outer faces. Surface-only fields intentionally have none.
export function modelFaces({ nx, ny, mask, depth, x, z, initialZeta, dates, depthToY, surfaceY, style, color, onRange }) {
    const group = new THREE.Group();
    group.visible = false;
    const supported = new Set(["temp", "salt", "speed"]);
    const base = new URL("./data/ocean-faces/", import.meta.url);
    const cache = new Map(), pending = new Map(), failed = new Set();
    // Run-forward's existing surface export has no matching depth export.
    // Neutral cutaway faces close the domain without inventing tracer values.
    const domain = new THREE.Group();
    for (const side of ["north","south","east","west"]) {
        const n=side==="north"||side==="south"?nx:ny;
        const positions=[], colours=[], triangles=[];
        const cells=Array.from({length:n},(_,i)=>side==="north"?(ny-1)*nx+i:side==="south"?i:side==="east"?i*nx+nx-1:i*nx);
        cells.forEach(cell=>{
            positions.push(x[cell],surfaceY,z[cell],x[cell],depthToY(depth[cell]),z[cell]);
            const top=new THREE.Color("#8db7c5");
            const bottom=top.clone().lerp(new THREE.Color("#2b4b6f"),Math.min(1,-depthToY(depth[cell])/150));
            colours.push(top.r,top.g,top.b,bottom.r,bottom.g,bottom.b);
        });
        for(let i=0;i<n-1;i++) if(mask[cells[i]]>=.5&&mask[cells[i+1]]>=.5) {
            const a=i*2; triangles.push(a,a+1,a+2,a+1,a+3,a+2);
        }
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute("color",new THREE.Float32BufferAttribute(colours,3));geometry.setIndex(triangles);
        domain.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide})));
    }
    domain.visible=false;
    let manifestPromise, manifest, desired = null, drawn = "", geometryKind, sides;

    async function getManifest() {
        if (!manifestPromise) manifestPromise = (async () => {
            const response = await fetch(new URL("manifest.json", base));
            if (!response.ok) throw new Error("Depth manifest unavailable");
            const m = await response.json();
            if (m.nx !== nx || m.ny !== ny || JSON.stringify(m.dates) !== JSON.stringify(dates)) throw new Error("Depth grid/timeline mismatch");
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", depth.buffer)), b => b.toString(16).padStart(2,"0")).join("");
            if (hash !== m.grid_depth_sha256) throw new Error("Depth bathymetry mismatch");
            manifest = m;
            return m;
        })();
        return manifestPromise;
    }
    async function array(info, Type) {
        const response = await fetch(new URL(info.file, base));
        if (!response.ok) throw new Error("Depth field unavailable");
        let bytes = await response.arrayBuffer();
        // Accommodate hosts that decompress Content-Encoding automatically.
        if (new Uint8Array(bytes)[0] === 31 && new Uint8Array(bytes)[1] === 139) {
            bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
        }
        if (bytes.byteLength !== info.shape.reduce((a,b)=>a*b,1) * Type.BYTES_PER_ELEMENT) throw new Error("Invalid depth array length");
        return new Type(bytes);
    }
    function rebuild(kind) {
        for (const mesh of [...group.children]) { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
        const indices = kind === "initial" ? manifest.initial_indices : manifest.frame_indices;
        const levels = manifest.s_rho.length, rows = levels + 2;
        let offset = 0;
        sides = manifest.sides.map(side => {
            const along = indices[side];
            const cells = along.map(v => side === "north" ? (ny-1)*nx+v : side === "south" ? v : side === "east" ? v*nx+nx-1 : v*nx);
            const n = cells.length, positions = new Float32Array(rows*n*3), colors = new Float32Array(rows*n*3), triangles = [];
            for (let row=0;row<rows-1;row++) for (let i=0;i<n-1;i++) {
                if (mask[cells[i]] < .5 || mask[cells[i+1]] < .5) continue;
                const a=row*n+i,b=a+1,c=a+n,d=c+1;
                triangles.push(a,b,c,b,d,c);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
            geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
            geometry.setIndex(triangles);
            const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
            mesh.frustumCulled = false;
            group.add(mesh);
            const spec={cells,n,offset,geometry}; offset+=n;
            return spec;
        });
        geometryKind=kind;
    }
    function paint() {
        if (!desired) { group.visible=false; return; }
        const {kind,key,frame}=desired, id=kind+":"+key, data=cache.get(id);
        if (!data) { group.visible=false; return; }
        const signature=id+":"+frame;
        if (signature===drawn) { group.visible=true; return; }
        if (geometryKind!==kind) rebuild(kind);
        const {values,zeta,info}=data, levels=manifest.s_rho.length, rows=levels+2;
        const total=info.shape[info.shape.length-1], frameOffset=kind==="frames"?frame*levels*total:0;
        const {range,stops}=style(kind,key);
        for (const side of sides) {
            const {cells,n,offset,geometry}=side, positions=geometry.attributes.position, colors=geometry.attributes.color;
            for(let i=0;i<n;i++) {
                const cell=cells[i], h=depth[cell], eta=kind==="frames"?zeta[frame*total+offset+i]:initialZeta[cell];
                for(let row=0;row<rows;row++) {
                    const level=Math.max(0,Math.min(levels-1,row-1));
                    const zo=(manifest.hc*manifest.s_rho[level]+manifest.Cs_r[level]*h)/(manifest.hc+h);
                    const y=row===0?depthToY(h):row===rows-1?surfaceY:Math.min(surfaceY,depthToY(-(eta+(eta+h)*zo)));
                    const vertex=row*n+i;
                    positions.setXYZ(vertex,x[cell],y,z[cell]);
                    const value=values[frameOffset+level*total+offset+i]*info.scale+info.minimum;
                    const c=color((value-range[0])/(range[1]-range[0]||1),stops);
                    colors.setXYZ(vertex,c.r,c.g,c.b);
                }
            }
            positions.needsUpdate=colors.needsUpdate=true;
        }
        group.visible=true; drawn=signature;
    }
    function show(kind,key,frame=0) {
        domain.visible=kind==="frames" && supported.has(key);
        desired=kind==="initial" && supported.has(key)?{kind,key,frame}:null;
        if (!desired) { group.visible=false; return; }
        const id=kind+":"+key;
        if (cache.has(id)) { paint(); return; }
        group.visible=false;
        if (pending.has(id)||failed.has(id)) return;
        const request=(async()=>{
            const m=await getManifest(), info=m[kind][key];
            const [values,zeta]=await Promise.all([array(info,Uint16Array),kind==="frames"?getZeta(m):null]);
            cache.set(id,{values,zeta,info});
            onRange(kind,key,[info.minimum,info.maximum]);
            paint();
        })().catch(error=>{failed.add(id); console.warn("Outer model faces:",error.message);}).finally(()=>pending.delete(id));
        pending.set(id,request);
    }
    let zetaPromise;
    function getZeta(m) { return zetaPromise ||= array(m.zeta,Float32Array); }
    return {group,domain,show};
}
