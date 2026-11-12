#!/usr/bin/env python3
"""Independently QC displayed Argo GIS, full ribbon/seabed clipping and C1 motion.

Requires Playwright and installed Chrome. Example:
  python tools/check_argo_geometry.py --base-url http://localhost:8742/roms-explorer/
Uses actual native rendered mesh triangles, not the application's terrain sampler.
The default 600-time geometry sweep is supplemented by all recorded fixes and
49 independent positions on every unbroken trajectory leg.
"""
import argparse
import json
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright

GEOMETRY_QC = r"""()=>{
 const d=__debug;d.setArgoPlaying(false);const steps=window.__qcSteps||600;
 function binMesh(mesh){
  const g=mesh.geometry,p=g.attributes.position,index=g.index.array,bins=new Map(),size=4;
  for(let k=0;k<index.length;k+=3){const tri=[index[k],index[k+1],index[k+2]].map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
   const minx=Math.floor(Math.min(...tri.map(v=>v[0]))/size),maxx=Math.floor(Math.max(...tri.map(v=>v[0]))/size),minz=Math.floor(Math.min(...tri.map(v=>v[2]))/size),maxz=Math.floor(Math.max(...tri.map(v=>v[2]))/size);
   for(let x=minx;x<=maxx;x++)for(let z=minz;z<=maxz;z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(tri);}
  }
  return (x,z)=>{let y=null;
   for(const [a,b,c] of bins.get(Math.floor(x/size)+','+Math.floor(z/size))||[]){
    const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-12)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
    if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)y=Math.max(y??-Infinity,u*a[1]+v*b[1]+w*c[1]);
   }return y;};
 }
 const wet=binMesh(d.terrainMesh),land=binMesh(d.terrainMesh.children[0]);
 let onLand=0,noWet=0,below=0,maxBelow=0,maxMove=0,tests=0,finite=true,stationary=0,edgeLand=0;
 const examples=[],last=new Map(),first=new Map(),travel=new Map();
 for(let n=0;n<=steps;n++){
  d.setArgoTime(d.argoStart+(d.argoEnd-d.argoStart)*n/steps);
  for(const t of d.argoTracks){if(!t.marker.visible||!t.curtain.mesh.visible){last.delete(t.id);continue;}const m=t.marker.position,c=t.curtain.mesh,attrs=c.geometry.attributes.position;
   const wy=wet(m.x,m.z),ly=land(m.x,m.z);tests++;
   if(wy===null)noWet++;if(ly!==null)onLand++;
   if(n===0)first.set(t.id,[m.x,m.z]);
   if(last.has(t.id)){const old=last.get(t.id),dist=Math.hypot(m.x-old[0],m.z-old[1]);maxMove=Math.max(maxMove,dist);travel.set(t.id,(travel.get(t.id)||0)+dist);}last.set(t.id,[m.x,m.z]);
   // Four ribbon extremities, using the actual rendered world geometry.
   let bottom=Infinity,minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;
   for(let i=0;i<attrs.count;i++){const x=attrs.getX(i)+c.position.x,z=attrs.getZ(i)+c.position.z,y=attrs.getY(i)*c.scale.y+c.position.y;finite&&=Number.isFinite(x+y+z);bottom=Math.min(bottom,y);minx=Math.min(minx,x);maxx=Math.max(maxx,x);minz=Math.min(minz,z);maxz=Math.max(maxz,z);}
   const bottoms=[];for(let q=0;q<=12;q++){bottoms.push({x:minx+(maxx-minx)*q/12,z:m.z,y:bottom},{x:m.x,z:minz+(maxz-minz)*q/12,y:bottom});}
   for(const v of bottoms){const bed=wet(v.x,v.z);if(land(v.x,v.z)!==null)edgeLand++;if(bed!==null&&v.y<bed-1e-4){below++;maxBelow=Math.max(maxBelow,bed-v.y);if(examples.length<5)examples.push({id:t.id,n,x:v.x,z:v.z,bottom:v.y,bed});}}

  }
 }
 stationary=d.argoTracks.filter(t=>(travel.get(t.id)||0)<.001).length;
 return {tracks:d.argoTracks.length,steps,tests,onLand,noWet,edgeLand,below,maxBelow,maxMove,stationary,finite,examples};
}"""

CONTINUITY_QC = r"""async()=>{
 const d=__debug,{trackPosition}=await import('./argo-drift.js?independent-qc='+Date.now());
 const world=(track,time)=>{const p=trackPosition(track,time);return d.argoDisplayPosition(track,p.lon,p.lat);};
 const vector=(a,b)=>a.map((v,i)=>v-b[i]);const mag=v=>Math.hypot(...v);
 const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,(a[0]*b[0]+a[1]*b[1])/(mag(a)*mag(b)))))*180/Math.PI;
 let maxRecordedFixError=0,testedRecordedFixes=0,curvedMidpoints=0,segments=0;
 const turns=[],oldTurns=[],relativeJumps=[],examples=[];
 for(const entry of d.argoTracks){const t=entry.positions;
  for(let k=0;k<t.points.length;k++){const p=t.points[k],a=world(t,p.time),expected=d.argoDisplayPosition(t,p.lon,p.lat);maxRecordedFixError=Math.max(maxRecordedFixError,mag(vector(a,expected)));testedRecordedFixes++;
   if(k+1<t.points.length&&!t.breaks[k]){const next=t.points[k+1],middle=world(t,(p.time+next.time)/2),linear=expected.map((v,i)=>(v+d.argoDisplayPosition(t,next.lon,next.lat)[i])/2);if(mag(vector(middle,linear))>1e-7)curvedMidpoints++;segments++;}
   if(k===0||k===t.points.length-1||t.breaks[k-1]||t.breaks[k])continue;
   const prev=t.points[k-1],next=t.points[k+1],span=Math.min(p.time-prev.time,next.time-p.time),epsilon=Math.min(1000,span*.00001),before=world(t,p.time-epsilon),after=world(t,p.time+epsilon),v1=vector(a,before),v2=vector(after,a);
   const previous=d.argoDisplayPosition(t,prev.lon,prev.lat),following=d.argoDisplayPosition(t,next.lon,next.lat),ov1=vector(a,previous),ov2=vector(following,a);
   if(mag(ov1)>1e-8&&mag(ov2)>1e-8)oldTurns.push(angle(ov1,ov2));
   if(mag(v1)>1e-9&&mag(v2)>1e-9){const turn=angle(v1,v2),jump=mag(vector(v1,v2))/Math.max(mag(v1),mag(v2));turns.push(turn);relativeJumps.push(jump);if(turn>5&&examples.length<10)examples.push({id:entry.id,k,time:p.time,turn,jump,spanDays:span/86400000});}
  }
 }
 const stats=a=>{a.sort((a,b)=>a-b);return {count:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
 d.setArgoPlaying(false);
 let common=0,moving=0,singleFix=0,stationary=[];
 for(let k=1;k<15;k++){const time=d.argoStart+(d.argoEnd-d.argoStart)*k/16;d.setArgoTime(time);const before=new Map(d.argoTracks.filter(t=>t.marker.visible).map(t=>[t.id,t.marker.position.clone()]));d.setArgoTime(time+86400000);
  for(const t of d.argoTracks){if(!t.marker.visible||!before.has(t.id))continue;if(t.positions.points.length===1){singleFix++;continue;}common++;const m=t.marker.position.distanceTo(before.get(t.id));if(m>1e-8)moving++;else stationary.push({id:t.id,time});}
 }
 return {maxRecordedFixError,testedRecordedFixes,segments,curvedMidpoints,turns:stats(turns),priorLinearTurns:stats(oldTurns),relativeVelocityJumps:stats(relativeJumps),examples,common,moving,singleFix,stationary};
}"""

ALL_LEGS_QC = r"""async()=>{const d=__debug,{trackPosition}=await import('./argo-drift.js?path-qc='+Date.now());
 function binMesh(mesh){
  const g=mesh.geometry,p=g.attributes.position,index=g.index.array,bins=new Map(),size=4;
  for(let k=0;k<index.length;k+=3){const tri=[index[k],index[k+1],index[k+2]].map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
   const minx=Math.floor(Math.min(...tri.map(v=>v[0]))/size),maxx=Math.floor(Math.max(...tri.map(v=>v[0]))/size),minz=Math.floor(Math.min(...tri.map(v=>v[2]))/size),maxz=Math.floor(Math.max(...tri.map(v=>v[2]))/size);
   for(let x=minx;x<=maxx;x++)for(let z=minz;z<=maxz;z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(tri);}
  }
  return (x,z)=>{let y=null;
   for(const [a,b,c] of bins.get(Math.floor(x/size)+','+Math.floor(z/size))||[]){
    const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-12)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
    if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)y=Math.max(y??-Infinity,u*a[1]+v*b[1]+w*c[1]);
   }return y;};
 }
const wet=binMesh(d.terrainMesh),land=binMesh(d.terrainMesh.children[0]);let legs=0,samples=0,onLand=0,outside=0,shallowSamples=0;const examples=[];
for(const t of d.argoTracks){const p=t.positions.points;for(let i=0;i+1<p.length;i++){if(t.positions.breaks[i])continue;legs++;for(let k=0;k<=48;k++){const loc=trackPosition(t.positions,p[i].time+(p[i+1].time-p[i].time)*k/48),[x,z]=d.argoDisplayPosition(t,loc.lon,loc.lat),floor=wet(x,z);samples++;if(floor!==null&&floor>-10)shallowSamples++;if(land(x,z)!==null){onLand++;if(examples.length<5)examples.push({id:t.id,i,k,x,z});}if(floor===null)outside++;}}}return{legs,samples,onLand,outside,shallowSamples,examples};}"""

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True,help='Explorer directory URL, ending in /')
    parser.add_argument('--steps',type=int,default=600)
    parser.add_argument('--report',help='Optional JSON report path')
    args=parser.parse_args()
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',args=['--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(urljoin(args.base_url.rstrip('/')+'/', 'index.html#argo'))
        page.wait_for_function('window.__debug && __debug.argoTracks.length>200',timeout=120000)
        page.evaluate('value=>window.__qcSteps=value',args.steps)
        report={'geometry':page.evaluate(GEOMETRY_QC),'continuity':page.evaluate(CONTINUITY_QC),'all_legs':page.evaluate(ALL_LEGS_QC),'page_errors':errors}
        browser.close()
    text=json.dumps(report,indent=2)
    if args.report:
        from pathlib import Path
        Path(args.report).write_text(text+'\n')
    print(text)
    g=report['geometry'];c=report['continuity'];a=report['all_legs']
    assert not errors,errors
    assert g['finite'] and all(g[key]==0 for key in ['onLand','noWet','edgeLand','below']),g
    assert c['maxRecordedFixError']<1e-8,c
    assert c['curvedMidpoints']>c['segments']*.5,c
    assert c['turns']['p95']<.1 and c['relativeVelocityJumps']['max']<.05,c
    assert a['onLand']==a['outside']==0,a
    # Source fixes can genuinely repeat; identify these instead of inventing
    # motion or silently passing a blanket "all floats move" assertion.
    print('PASS: native recorded positions, smooth joins, coast and full-width seabed clipping')
    if c['stationary']:
        print('Review unchanged source-position intervals:',json.dumps(c['stationary']))

if __name__=='__main__':
    main()
