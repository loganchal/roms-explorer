#!/usr/bin/env python3
"""Validate native showcase source faces against the exact browser grid.

Input metadata is the three native river arrays exported from forcing_showcase.npz.
No nearest-coast snapping: ROMS u sources span rho(i-1,j) / rho(i,j),
v sources span rho(i,j-1) / rho(i,j). Their midpoint is the rendered mask edge.
"""
import argparse, array, base64, hashlib, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--metadata',required=True);p.add_argument('--scene-data',required=True);p.add_argument('--out',required=True);args=p.parse_args()
scene=Path(args.scene_data).read_text();native=json.loads(Path(args.metadata).read_text())
if 'faces' in native:
    native={key:[face[column] for face in native['faces']] for key,column in [('river_Xposition','i'),('river_Eposition','j'),('river_direction','direction')]}
def floats(name):
    values=array.array('f');values.frombytes(base64.b64decode(re.search(r'const '+name+r' = "(.*?)";',scene)[1]));return values
lon,lat,mask=floats('LON_RHO_B64'),floats('LAT_RHO_B64'),floats('MASK_RHO_B64')
nx=int(re.search(r'const GRID_NX = (\d+)',scene)[1]);ny=int(re.search(r'const GRID_NY = (\d+)',scene)[1]);rivers=json.loads(re.search(r'const RIVERS = (.*?);',scene,re.S)[1]);faces=[]
assert len(rivers)==len(native['river_direction'])==len(native['river_Xposition'])==len(native['river_Eposition'])
for n,r in enumerate(rivers):
    i,j,d=[int(native[key][n]) for key in ('river_Xposition','river_Eposition','river_direction')];assert d in (0,1)
    k=j*nx+i;neighbor=k-1 if d==0 else k-nx
    assert 0<i<nx and 0<j<ny
    assert lon[k]==r['lon'] and lat[k]==r['lat'],f'Source order/grid mismatch at {n}'
    assert mask[k]!=mask[neighbor],f'Not a coastal source face: {n}'
    faces.append(dict(i=i,j=j,direction=d,lon=(lon[k]+lon[neighbor])/2,lat=(lat[k]+lat[neighbor])/2))
output=dict(source='Extension_Run/logs/forcing_showcase.npz',variables=['river_Xposition','river_Eposition','river_direction'],convention='zero-based rho-grid source indices; u face between i-1 and i, v face between j-1 and j',original_coordinates='Original RIVERS lon/lat are preserved in scene_data.js; face coordinates here are their native staggered coastal attachment.',count=len(faces),metadata_sha256=hashlib.sha256(json.dumps(native,sort_keys=True,separators=(',',':')).encode()).hexdigest(),faces=faces)
Path(args.out).write_text(json.dumps(output,separators=(',',':'))+'\n');print(f'PASS: {len(faces)} exact index/order matches; {len(faces)} wet/dry native faces; original payload preserved')
