#!/usr/bin/env python3
"""Depth-resolved PEA contribution anomalies on fixed physical depths.
q(z)=g*(rho_bar-rho(z))*z, rho_bar the 0--min(h,200m) mean density.
The depth mean of q is PEA; q is not a cumulative integral. Density is computed
from each daily T/S state before q and before the 1994--2020 climatological mean.
"""
import argparse, json, subprocess, hashlib
from datetime import datetime
from pathlib import Path
import numpy as np
from netCDF4 import Dataset
from export_ocean_anomalies import profiles,reference
from export_ocean_faces import edge_indices,grid_edges,pack_field,file_receipt
DEPTHS=np.linspace(200,0,41)
def density(t,s):
 t=np.maximum(-2,np.asarray(t,dtype='f8'));s=np.maximum(0,np.asarray(s,dtype='f8'))
 c0=999.842594+t*(.06793952+t*(-.009095290+t*(.0001001685+t*(-.000001120083+t*.000000006536332))))
 c1=.824493+t*(-.00408990+t*(.0000764380+t*(-.000000824670+t*.00000000538750)))
 c2=-.00572466+t*(.000102270-t*.00000165460)
 return c0+s*(c1+np.sqrt(s)*c2+s*.00048314)
def contribution(rho,z,h):
 """Piecewise-linear density; exact layer mean, q sampled at fixed depths."""
 out=np.zeros((len(DEPTHS),len(h)),dtype='f4')
 for i,depth in enumerate(h):
  if depth<=0:continue
  D=min(float(depth),200.0)
  zz=z[:,i];rr=rho[:,i]
  nodes=np.r_[-D,zz[(zz>-D)&(zz<0)],0.0]
  vals=np.interp(nodes,zz,rr)
  mean=np.trapz(vals,nodes)/D
  target=-np.minimum(DEPTHS,D)
  out[:,i]=9.81*(mean-np.interp(target,zz,rr))*target
 return out

def state(d,t,indices,h):
 T=profiles(d,'temp',t,indices);S=profiles(d,'salt',t,indices)
 if T.ndim==2:T=T[None];S=S[None]
 eta=profiles(d,'zeta',t,indices)
 if eta.ndim==1:eta=eta[None]
 sr=np.asarray(d['s_rho'][:]);cs=np.asarray(d['Cs_r'][:]);hc=float(d['hc'][...]);z0=(hc*sr[:,None]+h[None]*cs[:,None])/(hc+h[None])
 return np.stack([contribution(density(T[n],S[n]),eta[n][None]+(eta[n][None]+h[None])*z0,h) for n in range(len(T))])
def main():
 p=argparse.ArgumentParser();p.add_argument('--grid',type=Path,required=True);p.add_argument('--outputs',type=Path,required=True);p.add_argument('--climatology',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--month',type=int);p.add_argument('--out',type=Path);a=p.parse_args()
 with Dataset(a.grid) as d:mask=np.asarray(d['mask_rho'][:]);h0=np.asarray(d['h'][:])
 indices=edge_indices(*mask.shape,4);h=grid_edges(h0,indices);wet=grid_edges(mask,indices)>.5
 revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 if a.month:
  total=None;count=0;sources=[];a.climatology.mkdir(parents=True,exist_ok=True)
  for year in range(1994,2021):
   path=a.outputs/f'nz5km_avg_{year}{a.month:02d}.nc'
   with Dataset(path) as d:q=state(d,slice(None),indices,h)
   total=q.sum(axis=0,dtype='f8') if total is None else total+q.sum(axis=0,dtype='f8');count+=len(q);sources.append(file_receipt(path));print(year,a.month,flush=True)
  dest=a.climatology/f'month-{a.month:02d}.npz'
  if dest.exists():raise FileExistsError(dest)
  np.savez_compressed(dest,q=(total/count).astype('f4'))
  dest.with_suffix('.json').write_text(json.dumps({'days':count,'revision':revision,'sources':sources}))
  return
 a.out.mkdir(parents=True,exist_ok=False);base=json.loads((a.base/'manifest.json').read_text());clims={m:dict(np.load(a.climatology/f'month-{m:02d}.npz')) for m in range(1,13)};records=[];sources=[]
 grouped={}
 for text in base['dates']:
  date=datetime.strptime(text,'%d %b %Y');grouped.setdefault(date.strftime('%Y%m'),[]).append(date)
 for month,dates in grouped.items():
  path=a.outputs/f'nz5km_avg_{month}.nc'
  with Dataset(path) as d:
   for date in dates:records.append(state(d,date.day-1,indices,h)[0]-reference(clims,date,'q'))
  sources.append(file_receipt(path));print(month,flush=True)
 info=pack_field(a.out,'frames-pea-depth-anomaly.u16.gz',np.stack(records),wet)
 info.update({'depths':DEPTHS.tolist(),'maximum_depth':200,'column_metric':False,'definition':'q(z)=g*(rho_bar-rho(z))*z; rho_bar is the mean potential density over 0--min(h,200m). Local PEA contribution, not a cumulative integral.','units':'J m-3','reference_years':[1994,2020],'reference_method':'Compute density and local contribution for every daily T/S state, average q by month over 1994--2020, then interpolate month-centre means and subtract at each fixed physical depth.','revision':revision,'sources':sources,'climatology_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in a.climatology.glob('month-*.npz')}})
 (a.out/'manifest-patch.json').write_text(json.dumps(info,indent=2)+'\n');print('Exported',len(records),'depth profiles',flush=True)
if __name__=='__main__':main()
