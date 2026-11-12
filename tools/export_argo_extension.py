#!/usr/bin/env python3
"""Export display-only Argo history and collocated daily model profiles.

Fetch stage caches public Argovis monthly responses locally. Match stage runs
on a Slurm compute node beside daily model output, never on a login node.
This exports individual illustrative profiles, not unpublished budget results.
"""
import argparse, concurrent.futures, datetime as dt, json, pathlib, sys
import numpy as np

def sigma(s,t):
    s=np.asarray(s,dtype=float); t=np.asarray(t,dtype=float)
    w=999.842594+6.793952e-2*t-9.095290e-3*t**2+1.001685e-4*t**3-1.120083e-6*t**4+6.536332e-9*t**5
    a=.824493-4.0899e-3*t+7.6438e-5*t**2-8.2467e-7*t**3+5.3875e-9*t**4
    b=-5.72466e-3+1.0227e-4*t-1.6546e-6*t**2
    return w+a*s+b*s*np.sqrt(s)+4.8314e-4*s*s-1000

def clean(a,n=4):
    return [round(float(x),n) if np.isfinite(x) else None for x in a]

def fetch_all(args):
    import fetch_argo_month as fm
    cache=pathlib.Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
    months=[f'{y}-{m:02}' for y in range(2021,2026) for m in range(1,13) if (y,m)<=(2025,6)]
    def fetch_month(ym):
        p=cache/(ym+'.json')
        if not p.exists():
            records=fm.fetch(*fm.month_bounds(ym));p.write_text(json.dumps(records))
        else:records=json.loads(p.read_text())
        out=[]
        for r in records:
            if not r.get('data_info') or not r.get('data'):continue
            vals=dict(zip(r['data_info'][0],r['data']))
            p,t,s=vals.get('pressure'),vals.get('temperature'),vals.get('salinity')
            if not p or not t or not s:continue
            p,t,s=fm.apply_qc(p,t,s,vals.get('pressure_argoqc'),vals.get('temperature_argoqc'),vals.get('salinity_argoqc'))
            good=[i for i in range(len(p)) if p[i] is not None and t[i] is not None and s[i] is not None and p[i]>=0 and p[i]<3000]
            if len(good)<10:continue
            # Keep endpoints and about 32 measured levels; no invented depths.
            take=np.unique(np.linspace(0,len(good)-1,min(32,len(good))).astype(int)); ix=[good[i] for i in take]
            lon,lat=r['geolocation']['coordinates'];lon=lon%360
            out.append(dict(id=r['_id'],time=r['timestamp'],lon=round(lon,5),lat=round(lat,5),pressure=[round(p[i],2) for i in ix],temperature=[round(t[i],3) for i in ix],salinity=[round(s[i],4) for i in ix]))
        print(ym,len(out),flush=True);return out
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        profiles=[p for records in ex.map(fetch_month,months) for p in records]
    # Monthly-ish observations per WMO retain readable motion and compact data.
    profiles.sort(key=lambda x:(x['id'].split('_')[0],x['time']))
    last={};chosen=[]
    for p in profiles:
        w=p['id'].split('_')[0];t=dt.datetime.fromisoformat(p['time'].replace('Z','+00:00'))
        if w not in last or (t-last[w]).days>=20:
            chosen.append(p);last[w]=t
    chosen.sort(key=lambda x:x['time'])
    pathlib.Path(args.out).write_text(json.dumps(dict(version=1,period=dict(start='2021-01-01',end='2025-06-30'),source='Argovis v3 argo_core; pressure/T/S QC <= 2; measured levels decimated to 32; per-float minimum 20-day spacing',floats=chosen),separators=(',',':')))
    print('selected',len(chosen),'profiles',len(last),'floats',flush=True)

def match(args):
    from netCDF4 import Dataset
    payload=json.loads(pathlib.Path(args.observations).read_text()); floats=[p for p in payload['floats'] if not args.month or p['time'][:7].replace('-','')==args.month];payload['floats']=floats;models=[]
    with Dataset(args.grid) as d:
        lon=np.asarray(d['lon_rho'][:]);lat=np.asarray(d['lat_rho'][:]);h=np.asarray(d['h'][:]);wet=np.asarray(d['mask_rho'][:])>.5
    groups={}
    for k,p in enumerate(floats):groups.setdefault(p['time'][:7].replace('-',''),[]).append(k)
    allmodels=[None]*len(floats)
    for mm,ix in sorted(groups.items()):
        with Dataset(str(pathlib.Path(args.outputs)/f'nz5km_avg_{mm}.nc')) as d:
            sr=np.asarray(d['s_rho'][:]);cs=np.asarray(d['Cs_r'][:]);hc=float(d['hc'][...]);nt=len(d['ocean_time'])
            for k in ix:
                p=floats[k];dist=(lon-p['lon'])**2*np.cos(np.deg2rad(lat))**2+(lat-p['lat'])**2;dist[~wet]=np.inf
                j,i=np.unravel_index(np.argmin(dist),dist.shape);day=min(int(p['time'][8:10])-1,nt-1)
                zeta=float(d['zeta'][day,j,i]);z=zeta+(zeta+h[j,i])*(hc*sr+cs*h[j,i])/(hc+h[j,i])
                t=np.asarray(d['temp'][day,:,j,i]);s=np.asarray(d['salt'][day,:,j,i]);press=np.asarray(p['pressure'])
                ti=np.interp(press,-z[::-1],t[::-1]);si=np.interp(press,-z[::-1],s[::-1])
                allmodels[k]=dict(id=p['id'],day=day,dist_km=round(float(np.sqrt(dist[j,i])*111),1),z=clean(z,1),temp=clean(t,3),salt=clean(s,4),tempAtObs=clean(ti,3),saltAtObs=clean(si,4),sigAtObs=clean(sigma(si,ti)),obsSig=clean(sigma(p['salinity'],p['temperature'])))
        print(mm,len(ix),'matched',flush=True)
    payload['models']=allmodels;payload['modelSource']='Daily mean nz5km_avg, nearest wet horizontal cell; Vtransform=2 native levels, linear interpolation to measured pressure, UNESCO sigma-t, display dbar~m.'
    pathlib.Path(args.out).write_text(json.dumps(payload,separators=(',',':'),allow_nan=False))

if __name__=='__main__':
    ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest='mode',required=True)
    f=sub.add_parser('fetch');f.add_argument('--cache',required=True);f.add_argument('--out',required=True)
    m=sub.add_parser('match');m.add_argument('--month');m.add_argument('--observations',required=True);m.add_argument('--outputs',required=True);m.add_argument('--grid',required=True);m.add_argument('--out',required=True)
    a=ap.parse_args();fetch_all(a) if a.mode=='fetch' else match(a)
