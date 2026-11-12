#!/usr/bin/env python3
"""Read only the sparse surface probes needed to identify an archived trajectory."""
import argparse
import json
from pathlib import Path
import numpy as np
from netCDF4 import Dataset
p = argparse.ArgumentParser()
p.add_argument('--probes', required=True)
p.add_argument('files', nargs='+')
a = p.parse_args()
probes = json.loads(Path(a.probes).read_text())
for path in a.files:
    try:
        with Dataset(path) as d:
            values = np.asarray(d['temp'][0, -1])[probes['j'], probes['i']]
            print(json.dumps({'file': path, 'temp': values.tolist()}), flush=True)
    except Exception as e:
        print(json.dumps({'file': path, 'error': str(e)}), flush=True)
