#!/usr/bin/env python3
"""Guard the public snapshot against accidental republishing of withheld inputs."""
import json,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'scene_data.js').read_text()
assert not re.search(r'\b(?:const|let|var)\s+(?:TIDE\w*|RIVERS)\s*=',s),'Supplied tide or legacy river arrays returned'
r=json.loads((ROOT/'data/river-sources-current.json').read_text())
assert len(r['sources'])==42
for x in r['sources']:
 assert not any(k in x for k in ['transport','transport_signed','discharge'])
 assert all(k in x for k in ['lon','lat','face','vshape'])
 assert abs(sum(x['vshape'])-1)<1e-6
for file in ['assembly_scene.js','scene_core.js','dig_rivers.js']:
 s=(ROOT/file).read_text()
 assert not re.search(r'\br\.transport\b|radiusFor\(r\.transport\)',s),file
assert "r['river_transport']" not in (ROOT/'tools/export_current_river_sources.py').read_text()
p=json.loads((ROOT/'data/public-tide-example.json').read_text())
assert p['source']=='NOAA CO-OPS' and p['station']=='9414290' and p['units']=='metres'
assert p['source_url'].startswith('https://api.tidesandcurrents.noaa.gov/')
assert len(p['constituents'])==10
for c in p['constituents']:
 assert c['amplitude']>0 and 0<=c['phase']<360 and abs(c['period']*c['speed']-360)<1e-8
prov=json.loads((ROOT/'data/river-sources-current.provenance.json').read_text())
assert prov['sha256']==hashlib.sha256((ROOT/'data/river-sources-current.json').read_bytes()).hexdigest()
print('Public forcing checks passed: no supplied tide arrays or river discharge; 42 uniform-marker sources; 10 public NOAA example constituents.')
