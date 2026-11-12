import * as THREE from "three";

// Lazy, depth-resolved outer faces. Surface-only fields intentionally have none.
export function modelFaces({ nx, ny, mask, depth, x, z, initialZeta, dates, depthToY, surfaceY, style, color, onRange }) {
    const group = new THREE.Group();
    group.visible = false;
    const supported = new Set(["temp", "salt", "speed", "temp_anom", "salt_anom", "pea_anom"]);
    const base = new URL("./data/ocean-faces/", import.meta.url);
    const cache = new Map(), pending = new Map(), failed = new Set();
    let manifestPromise, manifest, desired = null, drawn = "", geometryKind, sides;

    async function getManifest() {
        if (!manifestPromise) manifestPromise = (async () => {
            const response = await fetch(new URL("manifest.json?v=20261112-anomaly-faces", base));
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
        const total=info.shape[info.shape.length-1], sourceLevels=info.shape[info.shape.length-2], frameOffset=kind==="frames"?frame*sourceLevels*total:0;
        const {range,stops}=style(kind,key);
        if(!data.palette) {
            data.palette=new Float32Array(65536*3);
            for(let q=0;q<65536;q++) {
                const c=color((q*info.scale+info.minimum-range[0])/(range[1]-range[0]||1),stops);
                data.palette.set([c.r,c.g,c.b],q*3);
            }
        }
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
                    const q=values[frameOffset+(info.column_metric?0:level)*total+offset+i]*3;
                    colors.setXYZ(vertex,data.palette[q],data.palette[q+1],data.palette[q+2]);
                }
            }
            positions.needsUpdate=colors.needsUpdate=true;
        }
        group.visible=true; drawn=signature;
    }
    function show(kind,key,frame=0) {
        desired=kind && supported.has(key)?{kind,key,frame}:null;
        if(kind==="frames" && key==="ssh") loadSeaLevel();
        if (!desired) { group.visible=false; return; }
        const id=kind+":"+key;
        if (cache.has(id)) { paint(); return; }
        group.visible=false;
        if (pending.has(id)||failed.has(id)) return;
        const request=(async()=>{
            const m=await getManifest(), info=m[kind][key];
            const surfaceInfo=kind==="frames"?m.surface[key]:null;
            const [values,zeta,surface]=await Promise.all([
                array(info,Uint16Array),kind==="frames"?getZeta(m):null,
                surfaceInfo?array(surfaceInfo,Uint8Array):null
            ]);
            cache.set(id,{values,zeta,info});
            onRange(kind,key,[info.minimum,info.maximum],surfaceInfo?{values:surface,info:surfaceInfo}:null);
            paint();
        })().catch(error=>{failed.add(id); console.warn("Outer model faces:",error.message);}).finally(()=>pending.delete(id));
        pending.set(id,request);
    }
    function loadSeaLevel() {
        const id="frames:ssh";
        if(cache.has(id)||pending.has(id)||failed.has(id)) return;
        const request=(async()=>{
            const m=await getManifest(), info=m.surface.zeta;
            const values=await array(info,Uint8Array);
            cache.set(id,{surfaceOnly:true});
            onRange("frames","ssh",[info.minimum,info.maximum],{values,info});
        })().catch(error=>{failed.add(id);console.warn("Sea-level frames:",error.message);}).finally(()=>pending.delete(id));
        pending.set(id,request);
    }
    let zetaPromise;
    function getZeta(m) { return zetaPromise ||= array(m.zeta,Float32Array); }
    return {group,show,state:()=>({desired:desired?{...desired}:null,drawn,pending:[...pending.keys()]})};
}
