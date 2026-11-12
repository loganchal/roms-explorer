#!/usr/bin/env python3
"""Small NZ locator derived from the explorer's existing native land mask."""
import base64,json,re
from pathlib import Path
import numpy as np
import contourpy

root=Path(__file__).resolve().parents[1]
source=(root/'scene_data.js').read_text()
def array(name):
 text=re.search(r'const '+name+r' = "([^"]+)"',source).group(1)
 return np.frombuffer(base64.b64decode(text),dtype='<f4')
ny=int(re.search(r'const GRID_NY = (\d+)',source).group(1));nx=int(re.search(r'const GRID_NX = (\d+)',source).group(1))
lon=array('LON_RHO_B64').reshape(ny,nx)[0];lat=array('LAT_RHO_B64').reshape(ny,nx)[:,0];land=1-array('MASK_RHO_B64').reshape(ny,nx)
width,height=160,160
xmin,xmax,ymin,ymax=164,180,-48,-33
cos=np.cos(np.deg2rad(-41));scale=min((width-16)/((xmax-xmin)*cos),(height-16)/(ymax-ymin))
ox=(width-(xmax-xmin)*cos*scale)/2;oy=(height-(ymax-ymin)*scale)/2
x=lambda v: ox+(v-xmin)*cos*scale
y=lambda v: oy+(ymax-v)*scale
contours=contourpy.contour_generator(x=lon,y=lat,z=land).lines(.5)
paths=[]
for c in contours:
 if len(c)<8 or np.max(c[:,0])<xmin or np.min(c[:,0])>xmax or np.max(c[:,1])<ymin or np.min(c[:,1])>ymax:continue
 if not np.allclose(c[0],c[-1]):continue
 paths.append('M'+'L'.join(f'{x(a):.2f},{y(b):.2f}' for a,b in c)+'Z')
d=json.loads((root/'data/methods-demo/season.json').read_text())['location'];px,py=x(d['lon']),y(d['lat'])
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">Study site near New Zealand</title><desc id="desc">The marked offshore column is at {abs(d['lat']):.2f} degrees south, {d['lon']:.2f} degrees east, west of the lower North Island.</desc>
<defs><clipPath id="extent"><rect width="160" height="160"/></clipPath></defs>
<g clip-path="url(#extent)" fill="#d6dacf" stroke="#a6afa2" stroke-width=".6" stroke-linejoin="round">
{''.join('<path d="'+p+'"/>' for p in paths)}
</g>
<circle cx="{px:.2f}" cy="{py:.2f}" r="6" fill="#f7f4e9"/>
<circle cx="{px:.2f}" cy="{py:.2f}" r="3" fill="#ad5b3c"/>
</svg>'''
(root/'data/methods-demo/locator.svg').write_text(svg)
print(len(paths),'land polygons;',len(svg),'bytes; marker',px,py)
