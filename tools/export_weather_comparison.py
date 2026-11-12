#!/usr/bin/env python3
"""Export actual native/regridded CFSR snapshots for all weather selectors.

Run on Slurm beside source data; the small JSON is a display artifact. Native
wind components remain eastward/northward; RH is derived on each grid using
the production Teten/Buck conversion, with pressure bilinearly mapped to the
native humidity grid before derivation.
"""
import argparse,base64,datetime as dt,json,pathlib
import numpy as np
from netCDF4 import Dataset,num2date
from scipy.interpolate import RegularGridInterpolator

FIELDS={
 'uwind':('wnd10m','10u','u10','m/s'),
 'vwind':('wnd10m','10v','v10','m/s'),
 'swrad':('dswsfc','sdswrf','dswrf','W/m²'),
 'pair':('prmsl','prmsl','prmsl','hPa'),
 'tair':('tmp2m','2t','t2m','°C'),
 'qair':('q2m','2sh','q2m','%'),
 'rain':('prate','prate','prate','kg/m²/s'),
 'lwradDown':('dlwsfc','sdlwrf','dlwrf','W/m²')}

def rh(q,t,p):
 t=t-273.15;p=p*.01;q=np.maximum(q,0)
 e=q*p/(.62197+.378*q)
 es=(1.0007+3.46e-6*p)*6.1121*np.exp(17.502*t/(240.97+t))
 return np.clip(100*e/es,0,110)

def pack(a,flip):
 a=np.asarray(a,dtype='<f4')
 assert a.ndim==2 and np.isfinite(a).all()
 return dict(nx=a.shape[1],ny=a.shape[0],flipRows=bool(flip),b64=base64.b64encode(a.tobytes()).decode(),range=[float(a.min()),float(a.max())])

def interp_grid(field,lat,lon,newlat,newlon):
 iy=np.argsort(lat);ix=np.argsort(lon)
 fn=RegularGridInterpolator((lat[iy],lon[ix]),field[np.ix_(iy,ix)],bounds_error=True)
 xx,yy=np.meshgrid(newlon,newlat)
 return fn(np.c_[yy.ravel(),xx.ravel()]).reshape(yy.shape)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--month',default='202101');ap.add_argument('--native-dir',required=True);ap.add_argument('--roms',required=True);ap.add_argument('--grid',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
 with Dataset(args.grid) as g:
  mask=np.asarray(g['mask_rho'][:],bool);latg=np.asarray(g['lat_rho'][:]);pj,pi=np.array(mask.shape)//2
  if not mask[pj,pi]:
   jj,ii=np.nonzero(mask);k=np.argmin((jj-pj)**2+(ii-pi)**2);pj,pi=int(jj[k]),int(ii[k])
 with Dataset(args.roms) as m:
  times=m['ocean_time'];snap=int(np.argmax(np.asarray(m['dswrf'][:,pj,pi])))
  timestamp=float(times[snap]);utc=num2date(timestamp,times.units,only_use_cftime_datetimes=False)
  remap={k:np.asarray(m[v[2]][snap],float) for k,v in FIELDS.items()}
  remap_rh=rh(remap['qair'],remap['tair'],remap['pair'])
 native={}
 for key,(tag,var,_,unit) in FIELDS.items():
  source=pathlib.Path(args.native_dir)/f'cfsr_nz_met_{tag}_{args.month}.nc'
  with Dataset(source) as ds:
   tv=ds['time_'+var];ts=np.asarray(tv[:]);index=int(np.argmin(abs(ts-timestamp)))
   assert abs(float(ts[index])-timestamp)<=3.1*3600,(key,ts[index],timestamp)
   native[key]=dict(values=np.asarray(ds[var][index],float),lat=np.asarray(ds['lat_'+var][:],float),lon=np.asarray(ds['lon_'+var][:],float),offset=float(ts[index])-timestamp,source=source.name,variable=var)
 q=native['qair'];t=native['tair'];p=native['pair'];assert np.array_equal(q['lat'],t['lat']) and np.array_equal(q['lon'],t['lon'])
 native_rh=rh(q['values'],t['values'],interp_grid(p['values'],p['lat'],p['lon'],q['lat'],q['lon']))
 fields={}
 for key,(_,var,_,unit) in FIELDS.items():
  n=native[key];a=n['values'];b=remap[key]
  if key=='pair':a=a*.01;b=b*.01
  if key=='tair':a=a-273.15;b=b-273.15
  if key=='qair':a=native_rh;b=remap_rh
  if key in ['swrad','rain']:a=np.maximum(a,0);b=np.maximum(b,0)
  fields[key]=dict(native=pack(a,n['lat'][0]<n['lat'][-1]),regrid=pack(b,latg[-1].mean()>latg[0].mean()),unit=unit,model_unit=unit,source=n['source'],source_variable=var,native_time_offset_seconds=n['offset'])
  print(key,fields[key]['native']['range'],fields[key]['regrid']['range'],n['offset'],flush=True)
 result=dict(version=1,month=args.month,snapshot_utc=utc.strftime('%Y-%m-%dT%H:%M:%SZ'),snapshot_index=snap,fields=fields,methods={'humidity':'Relative humidity from specific humidity, temperature and pressure with the production Teten/Buck formula; coarse native pressure bilinearly interpolated onto the humidity grid before RH derivation.','pressure':'Pa converted to hPa (millibar).','wind':'Earth-relative eastward and northward 10 m components; no grid-angle rotation applied to either side.','selection':'Maximum downward shortwave hour at the domain-mid nearest wet model cell, matching the existing weather comparison.'})
 path=pathlib.Path(args.out);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,separators=(',',':'),ensure_ascii=False)+'\n');print('wrote',path,path.stat().st_size,flush=True)

if __name__=='__main__':main()
