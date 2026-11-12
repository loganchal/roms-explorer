#!/usr/bin/env python3
"""One column/year for a stratification-budget methods demonstration.
Run under Slurm. Online PEA rates are retained; daily-mean state profiles are
for orientation only and are not used to reconstruct tracer process budgets.
"""
import argparse,json,subprocess
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
from netCDF4 import Dataset,num2date

TERMS=['hadv','vadv','hdif','heat','fw','mix','nudg','dilut','geom','tlres','slres','eos']
p=argparse.ArgumentParser();p.add_argument('--outputs',type=Path,required=True);p.add_argument('--grid',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
with Dataset(a.grid) as g:
 lon=np.asarray(g['lon_rho'][:]);lat=np.asarray(g['lat_rho'][:]);h=np.asarray(g['h'][:]);wet=np.asarray(g['mask_rho'][:])==1
 dist=((lon-170)*np.cos(np.deg2rad(-40)))**2+(lat+40)**2
 dist[~wet|(h<200)]=np.inf;j,i=np.unravel_index(dist.argmin(),dist.shape)
result={'title':'Online stratification budget construction','period':'July 2008–June 2009','selection':'Nearest wet column deeper than 200 m to 170°E 40°S.','location':{'lon':float(lon[j,i]),'lat':float(lat[j,i]),'h':float(h[j,i])},'revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'days':[],'terms':{},'sources':[],'state_profile_note':'Daily-mean T and S snapshots, not process tendencies. Attribution uses archived online PEA diagnostics.','units':{'pea':'J m⁻³','rate':'W m⁻³'},'anomaly_note':'Departure from 1 July 2008; not a climatological anomaly.'}
for month in ['200807','200808','200809','200810','200811','200812','200901','200902','200903','200904','200905','200906']:
 dp=a.outputs/('nz5km_dia_'+month+'.nc');ap=a.outputs/('nz5km_avg_'+month+'.nc')
 print('Reading',month,flush=True)
 with Dataset(dp) as d, Dataset(ap) as avg:
  clock=d['ocean_time'];times=num2date(clock[:],clock.units,calendar=getattr(clock,'calendar','standard'));at=avg['ocean_time'];avgtimes=num2date(at[:],at.units,calendar=getattr(at,'calendar','standard'))
  values={k:np.ma.filled(d['strat200_pea_'+k][:,j,i],np.nan).astype(float) for k in TERMS+['start','end','rate','close']}
  for k in TERMS:
   if k not in result['terms']:result['terms'][k]={'long_name':getattr(d['strat200_pea_'+k],'long_name',''),'units':getattr(d['strat200_pea_'+k],'units','')}
  sr=np.asarray(avg['s_rho'][:]);cs=np.asarray(avg['Cs_r'][:]);hc=float(avg['hc'][...]);depth=float(h[j,i]);transform=int(avg['Vtransform'][...])
  if transform!=2:raise ValueError('Unsupported vertical transform')
  for n,t in enumerate(times):
   date=t.strftime('%Y-%m-%d');idx=next(q for q,v in enumerate(avgtimes) if v.strftime('%Y-%m-%d')==date)
   zeta=float(avg['zeta'][idx,j,i]);z0=(hc*sr+depth*cs)/(hc+depth);z=zeta+(zeta+depth)*z0
   use=z>=-250
   day={'date':date,'seconds':86400,'pea_start':float(values['start'][n]),'pea_end':float(values['end'][n]),'rate':float(values['rate'][n]),'closure':float(values['close'][n]),'rates':{k:float(values[k][n]) for k in TERMS},'depth':(-z[use]).round(3).tolist(),'temp':np.asarray(avg['temp'][idx,:,j,i])[use].round(5).tolist(),'salt':np.asarray(avg['salt'][idx,:,j,i])[use].round(5).tolist()}
   if not all(np.isfinite(day[k]) for k in ['pea_start','pea_end','rate','closure']):raise ValueError('Invalid diagnostics')
   result['days'].append(day)
 result['sources'] += [{'file':x.name,'bytes':x.stat().st_size} for x in [dp,ap]]
days=result['days'];rates=np.array([[d['rates'][k] for k in TERMS] for d in days]);actual=np.array([d['rate'] for d in days]);delta=np.array([d['pea_end']-d['pea_start'] for d in days]);closures=np.array([d['closure'] for d in days])
result['validation']={'n_days':len(days),'max_rate_sum_error':float(np.max(abs(rates.sum(axis=1)-actual))),'max_daily_change_error':float(np.max(abs(delta-actual*86400))),'max_state_boundary_gap':float(max(abs(days[n]['pea_start']-days[n-1]['pea_end']) for n in range(1,len(days)))),'max_archived_closure':float(abs(closures).max())}
if len(days)!=365:raise ValueError('Unexpected day count')
if [d['date'] for d in days] != [(datetime(2008,7,1)+timedelta(days=n)).strftime('%Y-%m-%d') for n in range(365)]:raise ValueError('Non-consecutive dates')
result['validation']['final_accumulated_reconstruction_error']=float(days[0]['pea_start']+sum(sum(d['rates'].values())*d['seconds'] for d in days)-days[-1]['pea_end'])
# Do not release a misleading decomposition if any process is missing/duplicated.
if result['validation']['max_rate_sum_error']>max(1e-8,abs(actual).max()*.001):raise ValueError(result['validation'])
a.out.mkdir(parents=True,exist_ok=False);(a.out/'season.json').write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n');print(json.dumps(result['validation']),flush=True)
