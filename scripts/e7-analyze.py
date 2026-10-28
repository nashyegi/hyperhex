#!/usr/bin/env python3
"""Summarise E7 (resolution / slot-length realism with reservation buffer).
Usage: e7-analyze.py OUTDIR BOUNDS.jsonl RESULTS.jsonl... [--timing TIMING.jsonl...]"""
import json, math, sys, os, statistics as st
from collections import defaultdict
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
args = sys.argv[1:]; outdir = args.pop(0); bounds = [json.loads(l) for l in open(args.pop(0))]
timing_files = args[args.index("--timing") + 1:] if "--timing" in args else []
files = args[: args.index("--timing")] if "--timing" in args else args
def ci(xs):
    n = len(xs); m = st.mean(xs)
    return (m, 0.0) if n < 2 else (m, {19: 2.093}.get(n - 1, 1.96) * st.stdev(xs) / math.sqrt(n))
meta, rows = {}, []
for f in files:
    for l in open(f):
        r = json.loads(l)
        if r["kind"] == "meta": meta[r["setting"]["id"]] = r
        else: rows.append(r)
timing = defaultdict(list)
for f in timing_files:
    sid = None
    for l in open(f):
        r = json.loads(l)
        if r["kind"] == "meta": sid = r["setting"]["id"]
        elif r["controller"] == "hyperhex": timing[(sid, r["fleet"])].append(r["admitMsPerDrone"])
B = {b["res"]: b for b in bounds}
def guarantee(sid):
    m = meta[sid]["setting"]; b = B[m["res"]]
    key = "buffer1" if m["engine"]["bufferSlots"] else "buffer0"
    return min(b["sameLayerAllCells"][key], b["allLayersCentralCells"][key])
g = defaultdict(list)
for r in rows: g[(r["setting"], r["controller"], r["fleet"])].append(r)
ORDER = ["r10-8s-b1", "r10-8s-b0", "r11-4s-b1", "r9-4s-b1", "r9-4s-b0"]
LABEL = {"r9-4s-b0": "Res 9, 4 s, no buffer (baseline)", "r9-4s-b1": "Res 9, 4 s, buffer 1",
         "r10-8s-b0": "Res 10, 8 s, no buffer", "r10-8s-b1": "Res 10, 8 s, buffer 1 (primary)", "r11-4s-b1": "Res 11, 4 s, buffer 1"}
summ = {}
for (sid, c, f), rs in g.items():
    sep = [r["sep"] for r in rs]
    mh = [s["minHorizontalWhenVerticalBelow"] for s in sep if s["minHorizontalWhenVerticalBelow"] is not None]
    summ[f"{sid}/{c}/{f}"] = {
        "runs": len(rs), "conflicts": ci([r["conflicts"] for r in rs]), "runsWithConflicts": sum(r["conflicts"] > 0 for r in rs),
        "arrivedPct": ci([100 * r["arrived"] / f for r in rs]), "groundHolds": ci([r["groundHolds"] for r in rs]),
        "delaySec": ci([r["delayPerArrivalSec"] for r in rs]), "ledger": ci([r["ledgerNodeIntervals"] for r in rs]),
        "ledgerPerDrone": st.mean(r["ledgerNodeIntervals"] / f for r in rs),
        "admitMs": ci([r["admitMsPerDrone"] for r in rs]) if c == "hyperhex" else None,
        "admitMsSequential": ci(timing[(sid, f)]) if timing.get((sid, f)) else None,
        "repairMs": ci([r["repairMsTotal"] for r in rs]) if c == "hyperhex" else None,
        "minH": min(mh) if mh else None, "medianMinH": st.median(mh) if mh else None,
        "los": {k: st.mean(s["losPairs"][k] for s in sep) for k in sep[0]["losPairs"]},
        "losMissed": {k: st.mean(s["losPairsMissedByDiscrete"][k] for s in sep) for k in sep[0]["losPairs"]},
        "cancelled": sum(r["cancelled"] for r in rs), "diverted": sum(r["diverted"] for r in rs),
        "evacuated": ci([r["evacuated"] for r in rs]), "unresolved": sum(r["unresolved"] for r in rs),
        "newClosureEntries": sum(r["dronesEnteringNoFlyExclInside"] for r in rs),
        "horizonSlots": max(r["horizonSlots"] for r in rs),
    }
info = {sid: {"spacing": meta[sid]["spacing"], "speedMps": meta[sid]["speedMps"], "guaranteeM": guarantee(sid),
              "setting": meta[sid]["setting"]} for sid in meta}
json.dump({"settings": info, "cells": summ}, open(os.path.join(outdir, "e7_summary.json"), "w"), indent=1)
# ---- tables
fmt = lambda m, d=2: f"{m[0]:.{d}f} ± {m[1]:.{d}f}"
T = ["| Setting | Spacing (m) | Speed (m/s) | Guaranteed horiz. sep. when vert. < 30 m (m) | Observed min (m), all runs |", "|---|---|---|---|---|"]
for sid in ORDER:
    if sid not in info: continue
    i = info[sid]; obs = min(summ[k]["minH"] for k in summ if k.startswith(sid + "/hyperhex/") and summ[k]["minH"] is not None)
    T.append(f"| {LABEL[sid]} | {i['spacing']['min']:.0f}–{i['spacing']['max']:.0f} | {i['speedMps']['min']:.1f}–{i['speedMps']['max']:.1f} | {i['guaranteeM']:.1f} | {obs:.1f} |")
M = ["", "| Setting | Drones | Controller | Conflicts / run | Arrived (%) | Ground holds / run | Delay / arrival (s) | Planning (ms / drone) | Ledger node intervals | Min horiz. sep. (m) | LoS pairs/run h<50 m | h<100 m |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
for sid in ORDER:
    for f in [12, 48, 96, 144]:
        for c in ["hyperhex", "geofence", "reactive"]:
            q = summ.get(f"{sid}/{c}/{f}")
            if not q: continue
            pm = q["admitMsSequential"] or q["admitMs"]
            M.append(f"| {sid} | {f} | {c} | {fmt(q['conflicts'])} | {fmt(q['arrivedPct'],1)} | {fmt(q['groundHolds'])} | {fmt(q['delaySec'])} | {fmt(pm,3) if pm else '–'} | {fmt(q['ledger'],0) if c=='hyperhex' else '–'} | {q['minH']:.0f} | {q['los']['h<50m,v<30m']:.2f} | {q['los']['h<100m,v<30m']:.2f} |")
open(os.path.join(outdir, "e7_table.md"), "w").write("\n".join(T + M) + "\n")
print("\n".join(T + M))
# ---- figure: 3 panels vs fleet for the primary realistic setting and sensitivity rows
fleets = sorted({r["fleet"] for r in rows})
fig, axs = plt.subplots(2, 2, figsize=(10, 7)); ax = axs.flatten()
sty = {"r10-8s-b1": ("#2563eb", "-"), "r10-8s-b0": ("#93c5fd", "--"), "r11-4s-b1": ("#16a34a", "-"), "r9-4s-b1": ("#f59e0b", "-"), "r9-4s-b0": ("#64748b", "--")}
for sid in ORDER:
    if sid not in info: continue
    col, ls = sty[sid]
    hh = [summ[f"{sid}/hyperhex/{f}"] for f in fleets]
    ax[0].plot(fleets, [q["arrivedPct"][0] for q in hh], ls, marker="o", ms=3, color=col, label=LABEL[sid])
    ax[1].plot(fleets, [q["delaySec"][0] for q in hh], ls, marker="o", ms=3, color=col)
    ax[2].plot(fleets, [q["minH"] for q in hh], ls, marker="o", ms=3, color=col)
    ax[2].axhline(info[sid]["guaranteeM"], color=col, lw=0.8, ls=":")
    ax[3].plot(fleets, [(q["admitMsSequential"] or q["admitMs"])[0] for q in hh], ls, marker="o", ms=3, color=col)
for sid, mk in [("r10-8s-b1", "s"), ("r9-4s-b0", "^")]:
    for c, col in [("geofence", "#dc2626"), ("reactive", "#7c3aed")]:
        if f"{sid}/{c}/12" in summ:
            ax[1].plot(fleets, [summ[f"{sid}/{c}/{f}"]["delaySec"][0] for f in fleets], ":", marker=mk, ms=3, color=col, label=f"{c} ({sid})")
ax[0].set_title("HyperHex arrived (%)", fontsize=9); ax[1].set_title("Delay per arriving drone (s)", fontsize=9); ax[1].set_yscale("log")
ax[2].set_title("HyperHex min horizontal sep. when\nvertical < 30 m (m); dotted = guarantee", fontsize=9); ax[3].set_title("HyperHex planning (ms / drone)", fontsize=9)
for a in ax: a.set_xlabel("Fleet size"); a.grid(alpha=0.3)
ax[0].legend(fontsize=7.5); ax[1].legend(fontsize=7)
fig.suptitle("Resolution / slot length / reservation buffer (20 seeds per point, closure mid-scenario; means)", fontsize=10)
fig.tight_layout(); fig.savefig(os.path.join(outdir, "fig_e7_realism.png"), dpi=200)
