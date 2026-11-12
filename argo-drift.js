// Illustrative smooth trajectories anchored by the available float observations.
export function observedTracks(floats) {
 const groups=new Map();
 floats.forEach((profile,index)=>{
  const id=profile.id.split('_')[0],time=Date.parse(profile.time);
  if(!Number.isFinite(time))return;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({index,time,lon:profile.lon,lat:profile.lat});
 });
 return [...groups].map(([id,points])=>({id,points:points.sort((a,b)=>a.time-b.time)}));
}
function curvePoint(track,index,weight) {
 const a=track.points[index],b=track.points[Math.min(index+1,track.points.length-1)],dt=b.time-a.time;
 if(!track.tangents||!dt)return {lon:a.lon+(b.lon-a.lon)*weight,lat:a.lat+(b.lat-a.lat)*weight};
 const t=weight,t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
 return Object.fromEntries(['lon','lat'].map(key=>[key,h00*a[key]+h10*dt*track.tangents[index][key]+h01*b[key]+h11*dt*track.tangents[index+1][key]]));
}
// Shape-preserving cubic Hermite interpolation: shared, time-based point
// tangents give C1 turns while each coordinate stays within its GPS endpoints.
export function prepareSmoothTrack(track,isWet,project) {
 const p=track.points;
 track.tangents=p.map((point,i)=>Object.fromEntries(['lon','lat'].map(key=>{
  if(p.length===1)return [key,0];
  const previous=p[Math.max(0,i-1)],next=p[Math.min(p.length-1,i+1)];
  if(track.breaks?.[i-1]||track.breaks?.[i])return [key,0];
  if(i===0)return [key,(next[key]-point[key])/(next.time-point.time||1)];
  if(i===p.length-1)return [key,(point[key]-previous[key])/(point.time-previous.time||1)];
  const h0=point.time-previous.time,h1=next.time-point.time,d0=(point[key]-previous[key])/(h0||1),d1=(next[key]-point[key])/(h1||1);
  if(d0*d1<=0)return [key,0];
  const w0=2*h1+h0,w1=h1+2*h0;
  return [key,(w0+w1)/(w0/d0+w1/d1)];
 })));
 const safe=index=>{
  const a=project(p[index].lon,p[index].lat),b=project(p[index+1].lon,p[index+1].lat);
  const samples=Math.max(24,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.2));
  for(let i=0;i<=samples;i++){const q=curvePoint(track,index,i/samples);if(!isWet(q.lon,q.lat))return false;}
  return true;
 };
 // Damp shared tangents, never relocate GPS points. Zero tangents yield a
 // smooth start/stop along an already verified straight leg near a coast.
 for(let pass=0;pass<9;pass++){
  const bad=[];
  for(let i=0;i<p.length-1;i++)if(!track.breaks?.[i]&&!safe(i))bad.push(i);
  if(!bad.length)break;
  const affected=new Set(bad.flatMap(i=>[i,i+1]));
  for(const i of affected)for(const key of ['lon','lat'])track.tangents[i][key]*=pass===7?0:.5;
  if(pass===8)for(const i of bad)track.breaks[i]=true;
 }
}
export function trackPosition(track,time) {
 const p=track.points;
 time=Math.max(time,p[0].time);
 let lo=0,hi=p.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(p[mid].time<=time)lo=mid;else hi=mid-1;}
 const index=lo;
 const a=p[index],b=p[Math.min(index+1,p.length-1)];
 const weight=b.time===a.time?0:Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
 return {...curvePoint(track,index,weight),profileIndex:a.index,nextProfileIndex:b.index,pointIndex:index,weight};
}
