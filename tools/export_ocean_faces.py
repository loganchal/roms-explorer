#!/usr/bin/env python3
"""Export compact, depth-resolved model faces for the web explorer.

Run through Slurm against the original initial-state and daily-average files.
Frame dates come from the existing explorer timeline. Along-edge sampling can
be reduced while retaining every native sigma level and both edge endpoints.
"""
import argparse
from datetime import datetime
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from netCDF4 import Dataset, num2date


SIDES = ("north", "south", "east", "west")
FIELDS = ("temp", "salt", "speed")


def pad_to_rho(values, size):
    """Use the explorer export's existing edge-replicated velocity average."""
    values = np.ma.filled(np.ma.masked_invalid(values), 0)
    values = np.where(np.abs(values) > 1e30, 0, values)
    if values.shape[-1] == size:
        return values.astype("f4")
    if values.shape[-1] != size - 1:
        raise ValueError("Unexpected staggered velocity dimension")
    out = np.empty(values.shape[:-1] + (size,), dtype="f4")
    out[..., 0], out[..., -1] = values[..., 0], values[..., -1]
    out[..., 1:-1] = (values[..., :-1] + values[..., 1:]) * 0.5
    return out


def edge(variable, time, side):
    prefix = (time, slice(None)) if variable.ndim == 4 else (time,)
    if side == "north":
        return variable[prefix + (-1, slice(None))]
    if side == "south":
        return variable[prefix + (0, slice(None))]
    if side == "east":
        return variable[prefix + (slice(None), -1)]
    return variable[prefix + (slice(None), 0)]


def edge_indices(ny, nx, stride):
    def samples(n):
        return sorted(set(range(0, n, stride)) | {n - 1})
    return {side: samples(nx if side in ("north", "south") else ny) for side in SIDES}


def grid_edges(values, indices):
    full = (values[-1, :], values[0, :], values[:, -1], values[:, 0])
    return np.concatenate([line[indices[side]] for side, line in zip(SIDES, full)])


def read_fields(dataset, time, indices, ny, nx):
    result = {}
    for name in ("temp", "salt"):
        result[name] = np.concatenate([
            np.ma.filled(edge(dataset[name], time, side), np.nan)[..., indices[side]]
            for side in SIDES
        ], axis=-1).astype("f4")
    speeds = []
    for side in SIDES:
        n = nx if side in ("north", "south") else ny
        u = pad_to_rho(edge(dataset["u"], time, side), n)
        v = pad_to_rho(edge(dataset["v"], time, side), n)
        speeds.append(np.hypot(u, v)[..., indices[side]])
    result["speed"] = np.concatenate(speeds, axis=-1).astype("f4")
    result["zeta"] = np.concatenate([
        np.ma.filled(edge(dataset["zeta"], time, side), 0)[indices[side]]
        for side in SIDES
    ]).astype("f4")
    return result


def write_array(folder, name, values, dtype):
    payload = np.asarray(values, dtype=dtype).tobytes()
    packed = gzip.compress(payload, compresslevel=6, mtime=0)
    (folder / name).write_bytes(packed)
    return {"file": name, "dtype": dtype, "shape": list(np.shape(values)),
            "bytes": len(packed), "sha256": hashlib.sha256(packed).hexdigest()}


def pack_field(folder, name, values, wet):
    selected = values[..., wet].astype("f8")
    if not np.isfinite(selected).all() or (np.abs(selected) > 1e30).any():
        raise ValueError("Invalid wet-cell values in " + name)
    lo, hi = float(selected.min()), float(selected.max())
    scale = (hi - lo) / 65535 if hi > lo else 1
    quantized = np.zeros(values.shape, dtype="<u2")
    quantized[..., wet] = np.rint((selected - lo) / scale).astype("<u2")
    restored = quantized[..., wet].astype("f8") * scale + lo
    error = float(np.max(np.abs(restored - selected)))
    if error > scale * 0.501 + 1e-7:
        raise ValueError("Quantization verification failed")
    info = write_array(folder, name, quantized, "<u2")
    info.update({"minimum": lo, "maximum": hi, "scale": scale, "max_error": error})
    return info


def pack_surface(folder, name, values, wet):
    selected = values[:, wet].astype("f8")
    lo, hi = np.nanpercentile(selected, [1, 99]).tolist()
    scale = (hi - lo) / 255 if hi > lo else 1
    quantized = np.zeros(values.shape, dtype="u1")
    quantized[:, wet] = np.rint(np.clip((selected - lo) / scale, 0, 255)).astype("u1")
    inside = (selected >= lo) & (selected <= hi)
    errors = np.abs(quantized[:, wet].astype("f8") * scale + lo - selected)
    error = float(errors[inside].max())
    if error > scale * .501 + 1e-7:
        raise ValueError("Surface quantization verification failed")
    info = write_array(folder, name, quantized, "u1")
    info.update({"minimum":lo, "maximum":hi, "scale":scale, "max_error":error,
                 "clipped_fraction":float(1 - inside.mean())})
    return info


def file_receipt(path):
    stat = path.stat()
    return {"file": path.name, "bytes": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--grid", type=Path, required=True)
    parser.add_argument("--initial", type=Path, required=True)
    parser.add_argument("--outputs", type=Path, required=True)
    parser.add_argument("--dates", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--stride", type=int, default=4)
    parser.add_argument("--probes", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    dates = json.loads(args.dates.read_text())
    with Dataset(args.grid) as grid:
        mask = np.asarray(grid["mask_rho"][:], dtype="u1")
        h = np.asarray(grid["h"][:], dtype="<f4")
    ny, nx = mask.shape
    native = edge_indices(ny, nx, 1)
    sampled = edge_indices(ny, nx, args.stride)
    manifest = {
        "version": 1, "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "ny": ny, "nx": nx, "dates": dates, "sides": list(SIDES),
        "initial_indices": native, "frame_indices": sampled,
        "grid_depth_sha256": hashlib.sha256(h.tobytes()).hexdigest(),
        "sources": [file_receipt(args.grid), file_receipt(args.initial)],
        "velocity_method": "Edge-replicated adjacent average of staggered u/v, then speed magnitude.",
    }
    with Dataset(args.initial) as initial:
        values = read_fields(initial, 0, native, ny, nx)
        manifest["s_rho"] = np.asarray(initial["s_rho"][:]).tolist()
        manifest["Cs_r"] = np.asarray(initial["Cs_r"][:]).tolist()
        manifest["hc"] = float(initial["hc"][...])
    wet = grid_edges(mask, native).astype(bool)
    manifest["initial"] = {name: pack_field(args.out, "initial-" + name + ".u16.gz", values[name], wet) for name in FIELDS}

    probes = json.loads(args.probes.read_text())
    checks = {"temp": [], "salt": [], "zeta": []}
    records = {name: [] for name in (*FIELDS, "zeta")}
    surfaces = {name: [] for name in (*FIELDS, "zeta")}
    grouped = {}
    for text in dates:
        date = datetime.strptime(text, "%d %b %Y")
        grouped.setdefault(date.strftime("%Y%m"), []).append(date)
    for month, chosen in grouped.items():
        path = args.outputs / ("nz5km_avg_" + month + ".nc")
        with Dataset(path) as dataset:
            manifest["sources"].append(file_receipt(path))
            for date in chosen:
                time = date.day - 1
                clock = dataset["ocean_time"]
                actual = num2date(clock[time], clock.units, calendar=getattr(clock, "calendar", "standard"))
                if (actual.year, actual.month, actual.day) != (date.year, date.month, date.day):
                    raise ValueError("Model output and explorer dates disagree")
                for name in checks:
                    surface = dataset[name][time, -1] if name != "zeta" else dataset[name][time]
                    surface = np.asarray(surface, dtype="f4")
                    checks[name].append(surface[probes["j"], probes["i"]])
                    surfaces[name].append(surface[np.ix_(sampled["east"], sampled["north"])])
                u = pad_to_rho(dataset["u"][time, -1], nx)
                v = pad_to_rho(dataset["v"][time, -1].T, ny).T
                surfaces["speed"].append(np.hypot(u,v)[np.ix_(sampled["east"], sampled["north"])])
                values = read_fields(dataset, time, sampled, ny, nx)
                for name in records:
                    records[name].append(values[name])
        print("exported " + month, flush=True)
    wet = grid_edges(mask, sampled).astype(bool)
    manifest["frames"] = {
        name: pack_field(args.out, "frames-" + name + ".u16.gz", np.stack(records[name]), wet)
        for name in FIELDS
    }
    surface_mask = mask[np.ix_(sampled["east"], sampled["north"])].astype(bool)
    manifest["surface"] = {
        name: pack_surface(args.out, "surface-" + name + ".u8.gz", np.stack(surfaces[name]), surface_mask)
        for name in surfaces
    }
    manifest["zeta"] = write_array(args.out, "frames-zeta.f32.gz", np.stack(records["zeta"]), "<f4")
    np.savez_compressed(args.out / "surface-probes.npz", **{key: np.stack(value) for key, value in checks.items()})
    manifest["vertical_method"] = "ROMS Vtransform=2, native sigma levels, per-frame free surface."
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("validated " + str(len(dates)) + " frames", flush=True)


if __name__ == "__main__":
    main()
