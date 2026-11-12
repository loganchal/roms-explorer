#!/usr/bin/env python3
"""Export the selected 42-source MetOcean file on its native staggered grid."""
import argparse,datetime,json,pathlib,hashlib
import numpy as np
from netCDF4 import Dataset,date2num,num2date

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--grid',required=True);p.add_argument('--snapshot',default='2021-01-01T00:00:00');p.add_argument('--out',required=True);a=p.parse_args()
 with Dataset(a.source) as r,Dataset(a.grid) as g:
  tv=r['river_time'];times=np.asarray(tv[:]);target=date2num(datetime.datetime.fromisoformat(a.snapshot),tv.units);k=int(np.argmin(abs(times-target)));assert abs(times[k]-target)<1e-7,'Requested native river record is unavailable'
  stamp=num2date(times[k],tv.units,only_use_cftime_datetimes=False).strftime('%Y-%m-%dT%H:%M:%SZ')
  x=np.asarray(r['river_Xposition'][:],int);y=np.asarray(r['river_Eposition'][:],int);d=np.asarray(r['river_direction'][:],int);assert len(x)==42
  transport=np.asarray(r['river_transport'][k],float);temp=np.asarray(r['river_temp'][k,-1,:],float);salt=np.asarray(r['river_salt'][k,-1,:],float);vshape=np.asarray(r['river_Vshape'][:],float)
  mask=np.asarray(g['mask_rho'][:],bool);sources=[]
  for n,(i,j,direction) in enumerate(zip(x,y,d)):
   assert direction in (0,1);u=direction==0;nj,ni=j-int(not u),i-int(u)
   lon=float(g['lon_rho'][j,i]);lat=float(g['lat_rho'][j,i]);flon=float(g['lon_u' if u else 'lon_v'][j if u else j-1,i-1 if u else i]);flat=float(g['lat_u' if u else 'lat_v'][j if u else j-1,i-1 if u else i])
   face=dict(i=int(i),j=int(j),direction=int(direction),lon=flon,lat=flat,coastal=bool(mask[j,i]!=mask[nj,ni]),source_wet=bool(mask[j,i]),neighbor_wet=bool(mask[nj,ni]),neighbor_i=int(ni),neighbor_j=int(nj))
   sources.append(dict(lon=lon,lat=lat,transport=abs(float(transport[n])),transport_signed=float(transport[n]),temp=float(temp[n]),salt=float(salt[n]),vshape=vshape[:,n].tolist(),face=face))
  result=dict(source='Extension_Run/inputs/metocean_original/nz5km_N50_rivers.nc',source_file_sha256=hashlib.sha256(pathlib.Path(a.source).read_bytes()).hexdigest(),snapshot=stamp,source_time_index=k,count=42,grid=dict(source='Extension_Run/inputs/nz5km_grd_horizontal.nc',ny=mask.shape[0],nx=mask.shape[1]),convention='Native zero-based source rho indices; west u face between i-1 and i, south v face between j-1 and j. Face positions read directly from native lon_u/lat_u or lon_v/lat_v, without relocation.',sources=sources,coastal_count=sum(s['face']['coastal'] for s in sources),wet_wet_count=sum(s['face']['source_wet'] and s['face']['neighbor_wet'] for s in sources))
 pathlib.Path(a.out).write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n');print(json.dumps({k:result[k] for k in ['source','snapshot','count','coastal_count','wet_wet_count']},indent=2),flush=True)
if __name__=='__main__':main()
