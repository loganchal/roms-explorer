#!/usr/bin/env python3
"""Fetch Argo float profiles in the NZ domain for a given month, from Argovis.

Direct fetch for the roms_explorer visualization — deliberately independent
of this repo's CORA/MATLAB validation pipeline (analysis/argo_buoyancy/,
analysis/validation/profiles/core/process_cora.m), which builds a derived model-matchup
product rather than quick float positions + profiles for display.

Argovis v3 API (https://argovis-api.colorado.edu): polygon query handles the
antimeridian-crossing NZ domain correctly (161-185 deg E wraps through 180).
Guest key is rate-limited but sufficient for a one-off monthly pull.

    .venv/bin/python fetch_argo_floats.py 2020-07 \
        --out data/argo_floats_202007.json
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

API = "https://argovis-api.colorado.edu/argo"
NZ_POLYGON = [[161, -52], [185, -52], [185, -31], [161, -31], [161, -52]]
N_LEVELS_OUT = 40  # decimated levels per profile for compact display


def month_bounds(ym):
    year, month = (int(x) for x in ym.split("-"))
    start = f"{year:04d}-{month:02d}-01T00:00:00Z"
    if month == 12:
        end = f"{year+1:04d}-01-01T00:00:00Z"
    else:
        end = f"{year:04d}-{month+1:02d}-01T00:00:00Z"
    return start, end


def fetch(start, end, retries=3):
    params = {
        "startDate": start,
        "endDate": end,
        "polygon": json.dumps(NZ_POLYGON, separators=(",", ":")),
        "data": "temperature,salinity,pressure,"
                "temperature_argoqc,salinity_argoqc,pressure_argoqc",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"x-argokey": "guest"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"retry after error: {e}", file=sys.stderr)
            time.sleep(3)


def decimate(values, n_out):
    if len(values) <= n_out:
        return values
    step = len(values) / n_out
    return [values[int(i * step)] for i in range(n_out)]


# Argo QC convention: 1=good, 2=probably good, 3=probably bad, 4=bad,
# 5=changed, 9=missing -- matches the qc<=2 threshold used throughout this
# repo's CORA matchups (analysis/validation/profiles/core/compute_*_cora_matchup.m).
QC_GOOD_MAX = 2


def apply_qc(pres, temp, salt, pres_qc, temp_qc, salt_qc):
    """Drop a level entirely if its pressure (depth) QC is bad -- nothing at
    that level can be trusted without a depth. Otherwise null out
    temperature/salinity independently wherever THEIR OWN flag is bad,
    keeping the level for whichever variable still has good data."""
    def ok(qc_list, i):
        if not qc_list:
            return True  # no QC array returned -- nothing to filter on
        q = qc_list[i]
        return q is not None and q <= QC_GOOD_MAX

    out_p, out_t, out_s = [], [], []
    for i in range(len(pres)):
        if not ok(pres_qc, i):
            continue
        out_p.append(pres[i])
        out_t.append(temp[i] if ok(temp_qc, i) else None)
        if salt is not None:
            out_s.append(salt[i] if ok(salt_qc, i) else None)
    return out_p, out_t, (out_s if salt is not None else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("month", help="YYYY-MM")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    start, end = month_bounds(args.month)
    print(f"querying Argovis {start} .. {end}")
    records = fetch(start, end)
    print(f"{len(records)} profiles returned")

    floats = []
    n_levels_before = n_levels_after = n_temp_nulled = n_salt_nulled = 0
    for r in records:
        info = r.get("data_info")
        data = r.get("data")
        if not info or not data:
            continue
        keys = info[0]
        by_key = dict(zip(keys, data))
        pres = by_key.get("pressure")
        temp = by_key.get("temperature")
        salt = by_key.get("salinity")
        if not pres or not temp:
            continue

        n_levels_before += len(pres)
        pres, temp, salt = apply_qc(
            pres, temp, salt,
            by_key.get("pressure_argoqc"), by_key.get("temperature_argoqc"),
            by_key.get("salinity_argoqc"))
        n_levels_after += len(pres)
        n_temp_nulled += sum(1 for v in temp if v is None)
        n_salt_nulled += sum(1 for v in (salt or []) if v is None)
        if not pres or all(v is None for v in temp):
            continue  # nothing survived QC

        lon, lat = r["geolocation"]["coordinates"]
        # Argovis reports lon in -180..180; the ROMS grid spans 161-185 (it
        # crosses the antimeridian as positive values past 180, never
        # negative) -- wrap so floats east of the dateline land in-domain.
        if lon < 0:
            lon += 360
        floats.append({
            "id": r["_id"],
            "lon": lon,
            "lat": lat,
            "time": r["timestamp"],
            "pressure": decimate(pres, N_LEVELS_OUT),
            "temperature": decimate(temp, N_LEVELS_OUT),
            "salinity": decimate(salt, N_LEVELS_OUT) if salt else None,
        })

    print(f"QC (flag <= {QC_GOOD_MAX}): dropped {n_levels_before - n_levels_after} levels for bad pressure, "
          f"nulled {n_temp_nulled} temperature / {n_salt_nulled} salinity readings")
    print(f"{len(floats)} profiles with usable T(/S) data")
    with open(args.out, "w") as f:
        json.dump({"month": args.month, "source": "Argovis v3 API, argo_core",
                    "n_levels_decimated": N_LEVELS_OUT, "floats": floats}, f)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
