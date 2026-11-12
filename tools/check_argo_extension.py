#!/usr/bin/env python3
"""Check delivered multi-year observation/model alignment and measured depths."""
import collections,json,pathlib,sys
p=json.loads(pathlib.Path(sys.argv[1]).read_text());fs=p['floats'];ms=p['models']
assert p['period']=={'start':'2021-01-01','end':'2025-06-30'}
assert len(fs)==len(ms) and len(fs)>2000
assert len({f['id'] for f in fs})==len(fs)
assert len({f['id'].split('_')[0] for f in fs})>150
assert len({f['time'][:7] for f in fs})==54
assert min(f['time'] for f in fs)[:7]=='2021-01'
assert max(f['time'] for f in fs)[:7]=='2025-06'
for f,m in zip(fs,ms):
    assert f['id']==m['id']
    n=len(f['pressure']);assert n>=10
    assert len(f['temperature'])==len(f['salinity'])==n
    assert all(b>a for a,b in zip(f['pressure'],f['pressure'][1:]))
    assert len(m['z'])==len(m['temp'])==len(m['salt'])
    assert all(b>a for a,b in zip(m['z'],m['z'][1:]))
    for key in ['tempAtObs','saltAtObs','sigAtObs','obsSig']:
        assert len(m[key])==n and all(v is not None for v in m[key])
print(f"PASS: {len(fs)} profiles, {len({f['id'].split('_')[0] for f in fs})} floats, 54 months; all measured/model depths and aligned fields valid")
