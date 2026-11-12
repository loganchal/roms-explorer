#!/usr/bin/env python3
"""Matching tracer-profile and upper-200 m PEA anomalies for the web model.

Build twelve 1994-2020 monthly model climatologies with a Slurm array, then
interpolate their seasonal cycle to each animation date. All source files are
read-only. PEA is the native daily-mean strat200_pea diagnostic.
"""
import argparse
import calendar
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from netCDF4 import Dataset
from export_ocean_faces import edge, edge_indices, grid_edges, pack_field, pack_surface, file_receipt

SIDES=("north","south","east","west")


def profiles(dataset, name, time, indices):
    return np.concatenate([np.ma.filled(edge(dataset[name],time,side),0)[...,indices[side]] for side in SIDES],axis=-1).astype('f4')


def surface(dataset, name, time, indices):
    v=dataset[name]
    a=v[time,-1] if v.ndim==4 else v[time]
    a=np.ma.filled(a,0)
    return a[...,indices['east'],:][...,indices['north']].astype('f4')


def pad_column_boundary(values):
    """Extend nearest interior display samples over unwritten ghost diagnostics."""
    result=np.array(values,copy=True)
    result[0,:]=result[1,:];result[-1,:]=result[-2,:]
    result[:,0]=result[:,1];result[:,-1]=result[:,-2]
    return result


def centre(year,month):
    return datetime(year,month,1)+timedelta(days=calendar.monthrange(year,month)[1]/2)


def reference(clims,date,key):
    y,m=date.year,date.month
    t=date+timedelta(hours=12)
    if t<centre(y,m):
        other=(m-2)%12+1;oy=y-1 if m==1 else y
        lo,hi=centre(oy,other),centre(y,m);a,b=clims[other][key],clims[m][key]
    else:
        other=m%12+1;oy=y+1 if m==12 else y
        lo,hi=centre(y,m),centre(oy,other);a,b=clims[m][key],clims[other][key]
    weight=(t-lo).total_seconds()/(hi-lo).total_seconds()
    return a*(1-weight)+b*weight


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--outputs',type=Path,required=True)
    p.add_argument('--grid',type=Path,required=True)
    p.add_argument('--climatology',type=Path,required=True)
    p.add_argument('--base',type=Path,required=True)
    p.add_argument('--out',type=Path)
    p.add_argument('--month',type=int)
    a=p.parse_args()
    with Dataset(a.grid) as g:mask=np.asarray(g['mask_rho'][:],dtype='u1')
    ny,nx=mask.shape;indices=edge_indices(ny,nx,4)
    wet=grid_edges(mask,indices).astype(bool);surf_wet=mask[np.ix_(indices['east'],indices['north'])].astype(bool)
    if a.month:
        a.climatology.mkdir(parents=True,exist_ok=True)
        sums={};count=0;sources=[]
        for year in range(1994,2021):
            stem=f'{year}{a.month:02d}'
            avg=a.outputs/f'nz5km_avg_{stem}.nc';dia=a.outputs/f'nz5km_dia_{stem}.nc'
            with Dataset(avg) as d,Dataset(dia) as e:
                nt=len(d['ocean_time']);assert len(e['ocean_time'])==nt
                fields={name:profiles(d,name,slice(None),indices) for name in ['temp','salt']}
                fields.update({name+'_surface':surface(d,name,slice(None),indices) for name in ['temp','salt']})
                pea=np.ma.filled(e['strat200_pea'][:],0)
                fields['pea']=np.stack([grid_edges(day,indices) for day in pea])[:,None,:]
                fields['pea_surface']=pea[...,indices['east'],:][...,indices['north']]
                for key,v in fields.items():
                    reduced=np.sum(v,axis=0,dtype='f8');sums[key]=sums.get(key,0)+reduced
                count+=nt;sources.extend([file_receipt(avg),file_receipt(dia)])
            print('climatology '+stem,flush=True)
        target=a.climatology/f'month-{a.month:02d}.npz'
        if target.exists():raise FileExistsError(target)
        np.savez_compressed(target,**{k:(v/count).astype('f4') for k,v in sums.items()})
        target.with_suffix('.json').write_text(json.dumps({'days':count,'sources':sources,'revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()},indent=2))
        return
    if a.out is None:raise ValueError('--out required for animation export')
    a.out.mkdir(parents=True,exist_ok=False)
    base=json.loads((a.base/'manifest.json').read_text())
    clims={m:dict(np.load(a.climatology/f'month-{m:02d}.npz')) for m in range(1,13)}
    records={k:[] for k in ['temp_anom','salt_anom','pea_anom']};surfaces={k:[] for k in records};sources=[]
    grouped={}
    for text in base['dates']:
        date=datetime.strptime(text,'%d %b %Y');grouped.setdefault(date.strftime('%Y%m'),[]).append(date)
    for month,dates in grouped.items():
        avg=a.outputs/f'nz5km_avg_{month}.nc';dia=a.outputs/f'nz5km_dia_{month}.nc'
        with Dataset(avg) as d,Dataset(dia) as e:
            for date in dates:
                t=date.day-1
                for name in ['temp','salt']:
                    records[name+'_anom'].append(profiles(d,name,t,indices)-reference(clims,date,name))
                    surfaces[name+'_anom'].append(surface(d,name,t,indices)-reference(clims,date,name+'_surface'))
                pea=np.ma.filled(e['strat200_pea'][t],0)
                pea_surface=pad_column_boundary(pea[np.ix_(indices['east'],indices['north'])]-reference(clims,date,'pea_surface'))
                records['pea_anom'].append(np.concatenate([pea_surface[-1,:],pea_surface[0,:],pea_surface[:,-1],pea_surface[:,0]])[None,:])
                surfaces['pea_anom'].append(pea_surface)
        sources.extend([file_receipt(avg),file_receipt(dia)]);print('anomalies '+month,flush=True)
    patch={'frames':{},'surface':{},'reference':{'years':[1994,2020],'method':'Daily model output minus the 1994-2020 monthly model climatology, linearly interpolated between month centres. No detrending.','PEA':'Native daily-mean strat200_pea: upper 200 m or shallower seabed. Side colours represent this column metric, not a depth-resolved PEA profile. Unwritten outer ghost diagnostics are padded from the nearest interior sampled column, with matching surface-edge padding.','revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sources':sources}}
    for key in records:
        patch['frames'][key]=pack_field(a.out,'frames-'+key+'.u16.gz',np.stack(records[key]),wet)
        patch['surface'][key]=pack_surface(a.out,'surface-'+key+'.u8.gz',np.stack(surfaces[key]),surf_wet)
    patch['frames']['pea_anom']['column_metric']=True
    patch['reference']['climatology_sha256']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(a.climatology.glob('month-*.npz'))}
    (a.out/'manifest-patch.json').write_text(json.dumps(patch,indent=2)+'\n')
    print('validated anomaly frames '+str(len(base['dates'])),flush=True)


if __name__=='__main__':main()
