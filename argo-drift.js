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
export function trackPosition(track,time) {
 const p=track.points;
 time=Math.max(time,p[0].time);
 let lo=0,hi=p.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(p[mid].time<=time)lo=mid;else hi=mid-1;}
 const index=lo;
 const a=p[index],b=p[Math.min(index+1,p.length-1)];
 const weight=b.time===a.time?0:Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
 const previous=p[Math.max(0,index-1)],after=p[Math.min(p.length-1,index+2)];
 const curve=key=>{const v0=previous[key],v1=a[key],v2=b[key],v3=after[key],t=weight;return .5*((2*v1)+(-v0+v2)*t+(2*v0-5*v1+4*v2-v3)*t*t+(-v0+3*v1-3*v2+v3)*t*t*t)};
 return {lon:curve('lon'),lat:curve('lat'),profileIndex:a.index,nextProfileIndex:b.index,pointIndex:index,weight};
}
