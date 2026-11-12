#!/usr/bin/env python3
"""Export every QC-approved Argovis position for displayed WMO identities.

Uses the same cached monthly responses as export_argo_extension.py, without
thinning positions. No synthetic positions, dates or extrapolated tracks.
"""
import argparse,collections,datetime as dt,json,math,pathlib,re

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--cache',required=True);ap.add_argument('--profiles',required=True);ap.add_argument('--out',required=True);ap.add_argument('--filtered-profiles-out');args=ap.parse_args()
    profiles=json.loads(pathlib.Path(args.profiles).read_text());identities={p['id'].split('_')[0] for p in profiles['floats']}
    records={};counts=collections.Counter()
    for file in sorted(pathlib.Path(args.cache).glob('????-??.json')):
        for r in json.loads(file.read_text()):
            wmo=r['_id'].split('_')[0]
            if wmo not in identities:continue
            if r.get('geolocation_argoqc') not in (1,2) or r.get('timestamp_argoqc') not in (1,2):counts['rejected_qc']+=1;continue
            lon,lat=r['geolocation']['coordinates'];lon=lon%360;timestamp=r['timestamp']
            if not all(map(math.isfinite,[lon,lat])):continue
            if timestamp[:10]<'2021-01-01' or timestamp[:10]>'2025-06-30':continue
            cycle=r.get('cycle_number');assert cycle==int(re.match(r'\d+',r['_id'].split('_')[1])[0]),r['_id']
            point={'id':r['_id'],'time':timestamp,'lon':round(lon,6),'lat':round(lat,6)}
            if r['_id'] in records:assert records[r['_id']]==point
            records[r['_id']]=point
    if args.filtered_profiles_out:
        pairs=[(f,m) for f,m in zip(profiles['floats'],profiles['models']) if f['id'] in records]
        counts['model_profiles_removed_for_position_time_qc']=len(profiles['floats'])-len(pairs)
        identities={f['id'].split('_')[0] for f,m in pairs}
        records={key:p for key,p in records.items() if p['id'].split('_')[0] in identities}
        filtered={**profiles,'floats':[f for f,m in pairs],'models':[m for f,m in pairs]}
        pathlib.Path(args.filtered_profiles_out).write_text(json.dumps(filtered,separators=(',',':')))
    tracks=[];speed=[];gaps=[]
    for wmo in sorted(identities):
        points=sorted((p for p in records.values() if p['id'].split('_')[0]==wmo),key=lambda p:p['time'])
        assert points,wmo
        for a,b in zip(points,points[1:]):
            days=(dt.datetime.fromisoformat(b['time'].replace('Z','+00:00'))-dt.datetime.fromisoformat(a['time'].replace('Z','+00:00'))).total_seconds()/86400
            assert days>0,(wmo,a['id'],b['id'])
            lat1,lat2=map(math.radians,[a['lat'],b['lat']]);dl=math.radians(b['lon']-a['lon']);dy=lat2-lat1
            km=6371*2*math.asin(min(1,math.sqrt(math.sin(dy/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dl/2)**2)))
            speed.append({'wmo':wmo,'from':a['id'],'to':b['id'],'days':round(days,3),'km':round(km,2),'km_day':round(km/days,2)})
            gaps.append(days)
        tracks.append({'id':wmo,'points':points})
    payload={'version':1,'period':profiles['period'],'source':'Argovis v3 argo_core; every available position within requested domain, geolocation/time QC1 or2; grouped by WMO; no position thinning or invented points','tracks':tracks}
    pathlib.Path(args.out).write_text(json.dumps(payload,separators=(',',':')))
    print(json.dumps({'tracks':len(tracks),'positions':len(records),'qc':dict(counts),'largest_gaps_days':sorted(gaps,reverse=True)[:10],'fastest_segments_km_day':sorted(speed,key=lambda s:s['km_day'],reverse=True)[:10]},indent=2))

if __name__=='__main__':main()
