#!/usr/bin/env python3
"""Summarise E3 (admission-order sensitivity) and E6 (continuous-time separation) results."""
import json, math, sys, os, statistics as st
from collections import defaultdict
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
src, outdir = sys.argv[1], sys.argv[2]
rows = [json.loads(l) for l in open(src)]
T95 = {2: 12.706, 5: 2.571, 10: 2.228, 20: 2.086}
def ci(xs):
    n = len(xs); m = st.mean(xs)
    if n < 2: return m, 0.0
    t = {19: 2.093, 9: 2.262, 4: 2.776}.get(n - 1, 1.96)
    return m, t * st.stdev(xs) / math.sqrt(n)
summ = {"e3": {}, "e6": {}}
# ---------- E3 ----------
e3 = [r for r in rows if r["kind"] == "e3"]
orders = ["generated", "fifo", "longest", "shortest", "random"]
label = {"generated": "Generated (request order)", "fifo": "FIFO by departure", "longest": "Longest-first", "shortest": "Shortest-first", "random": "Random (5 perms)"}
g = defaultdict(list)
for r in e3:
    o = "random" if r["order"].startswith("random") else r["order"]
    g[(r["fleet"], o)].append(r)
fleets = sorted({r["fleet"] for r in e3})
md = ["| Fleet | Admission order | Runs | Arrived % (mean ± CI) | Ground holds / run | Delay / arriving drone (s) | Conflicts |", "|---|---|---|---|---|---|---|"]
for f in fleets:
    for o in orders:
        rs = g[(f, o)]
        arr = [100 * r["arrived"] / f for r in rs]; gh = [r["groundHolds"] for r in rs]; dl = [r["delayPerArrivalSec"] for r in rs]
        a, b, c = ci(arr), ci(gh), ci(dl)
        summ["e3"][f"{f}/{o}"] = {"runs": len(rs), "arrivedPct": a, "groundHolds": b, "delaySec": c, "conflicts": sum(r["conflicts"] for r in rs),
                                  "groundHoldsRange": [min(gh), max(gh)], "unresolved": sum(r["unresolved"] for r in rs)}
        md.append(f"| {f} | {label[o]} | {len(rs)} | {a[0]:.1f} ± {a[1]:.1f} | {b[0]:.2f} ± {b[1]:.2f} | {c[0]:.2f} ± {c[1]:.2f} | {sum(r['conflicts'] for r in rs)} |")
# within-seed spread across the 9 orders (same demand)
sp = ["", "| Fleet | Within-seed range across 9 orders, mean over 20 seeds: arrived (drones) | ground holds | delay/arrival (s) | Seeds where best order ≠ generated (by arrivals) |", "|---|---|---|---|---|"]
bys = defaultdict(list)
for r in e3: bys[(r["fleet"], r["seed"])].append(r)
for f in fleets:
    ra, rg, rd, nb = [], [], [], 0
    for (ff, s), rs in bys.items():
        if ff != f: continue
        A = [r["arrived"] for r in rs]; ra.append(max(A) - min(A)); rg.append(max(r["groundHolds"] for r in rs) - min(r["groundHolds"] for r in rs))
        rd.append(max(r["delayPerArrivalSec"] for r in rs) - min(r["delayPerArrivalSec"] for r in rs))
        gen = [r for r in rs if r["order"] == "generated"][0]["arrived"]; nb += max(A) > gen
    summ["e3"][f"{f}/withinSeedRange"] = {"arrived": st.mean(ra), "arrivedMax": max(ra), "groundHolds": st.mean(rg), "delaySec": st.mean(rd), "seedsBestNotGenerated": nb}
    sp.append(f"| {f} | {st.mean(ra):.1f} (max {max(ra)}) | {st.mean(rg):.1f} | {st.mean(rd):.2f} | {nb}/20 |")
open(os.path.join(outdir, "e3_table.md"), "w").write("\n".join(md + sp) + "\n")
fig, axs = plt.subplots(1, 3, figsize=(12, 3.6))
cols = {"generated": "#64748b", "fifo": "#2563eb", "longest": "#dc2626", "shortest": "#16a34a", "random": "#f59e0b"}
for k, (key, ttl) in enumerate([("arrivedPct", "Arrived (%)"), ("groundHolds", "Ground holds per run"), ("delaySec", "Delay per arriving drone (s)")]):
    for j, o in enumerate(orders):
        xs = [i + (j - 2) * 0.15 for i in range(len(fleets))]
        m = [summ["e3"][f"{f}/{o}"][key][0] for f in fleets]; e = [summ["e3"][f"{f}/{o}"][key][1] for f in fleets]
        axs[k].errorbar(xs, m, yerr=e, fmt="o", ms=4, capsize=2, color=cols[o], label=label[o])
    axs[k].set_xticks(range(len(fleets))); axs[k].set_xticklabels([str(f) for f in fleets]); axs[k].set_xlabel("Fleet size"); axs[k].set_title(ttl, fontsize=10); axs[k].grid(alpha=0.3)
axs[0].legend(fontsize=7)
meta = next((r for r in rows if r["kind"] == "meta"), {})
setting = meta.get("setting", {}).get("id", "res 9, 4-s slots, closure r=1 at slot 8")
fig.suptitle(f"Admission-order sensitivity (HyperHex, local repair + fallback; {setting}; 20 seeds, mean ± 95% CI)", fontsize=9.5)
fig.tight_layout(); fig.savefig(os.path.join(outdir, "fig_e3_order.png"), dpi=200)
# ---------- E6 ----------
e6 = [r for r in rows if r["kind"] == "e6"]
if not e6:  # E3-only input (e.g. scripts/e3-e4-realistic.ts)
    json.dump(summ, open(os.path.join(outdir, "e3_e6_summary.json"), "w"), indent=1)
    print("\n".join(md + sp))
    sys.exit(0)
TH = ["h<50m,v<30m", "h<100m,v<30m", "h<150m,v<30m", "h<200m,v<30m"]
g6 = defaultdict(list)
for r in e6: g6[(r["controller"], r["fleet"])].append(r)
ctrls = ["hyperhex", "geofence", "reactive"]; f6 = sorted({r["fleet"] for r in e6})
md6 = ["| Controller | Fleet | Min horiz. sep. with vert. < 30 m (m), min over seeds [median] | Min vert. sep. with horiz. < 50 m (m) | LoS pairs/run h<50 | h<100 | h<150 | h<200 | of which missed by discrete check (h<150 / h<200) | Exact discrete conflict pairs/run | Pairs reported by findConflicts/run |",
       "|---|---|---|---|---|---|---|---|---|---|---|"]
for c in ctrls:
    for f in f6:
        rs = g6[(c, f)]; S = [r["sep"] for r in rs]
        mh = [s["minHorizontalWhenVerticalBelow"] for s in S]; mv = [s["minVerticalWhenHorizontalBelow"] for s in S]
        los = {t: st.mean(s["losPairs"][t] for s in S) for t in TH}; miss = {t: st.mean(s["losPairsMissedByDiscrete"][t] for s in S) for t in TH}
        lc = {t: sum(s["losPairsWithLayerChange"][t] for s in S) for t in TH}; tot = {t: sum(s["losPairs"][t] for s in S) for t in TH}
        runsWithLos = {t: sum(1 for s in S if s["losPairs"][t] > 0) for t in TH}
        dp = st.mean(s["discretePairs"] for s in S); de = st.mean(s["detectorPairs"] for s in S)
        fin = lambda xs: [x for x in xs if x is not None and x < 1e9]
        summ["e6"][f"{c}/{f}"] = {"runs": len(rs), "minH": min(fin(mh), default=None), "medianH": st.median(fin(mh)) if fin(mh) else None,
            "minV": min(fin(mv), default=None), "losPerRun": los, "missedPerRun": miss, "layerChangeTotal": lc, "losTotal": tot, "runsWithLos": runsWithLos,
            "discretePairsPerRun": dp, "detectorPairsPerRun": de, "conflicts": sum(r["conflicts"] for r in rs)}
        if f not in (12, 48, 96, 144): continue
        q = summ["e6"][f"{c}/{f}"]
        fmt = lambda x: "–" if x is None else f"{x:.0f}"
        md6.append(f"| {c} | {f} | {fmt(q['minH'])} [{fmt(q['medianH'])}] | {fmt(q['minV'])} | {los[TH[0]]:.2f} | {los[TH[1]]:.2f} | {los[TH[2]]:.2f} | {los[TH[3]]:.2f} | {miss[TH[2]]:.2f} / {miss[TH[3]]:.2f} | {dp:.2f} | {de:.2f} |")
open(os.path.join(outdir, "e6_table.md"), "w").write("\n".join(md6) + "\n")
fig, axs = plt.subplots(1, 2, figsize=(11, 3.8))
for c, col in zip(ctrls, ["#2563eb", "#dc2626", "#64748b"]):
    axs[0].plot(f6, [summ["e6"][f"{c}/{f}"]["minH"] for f in f6], "o-", color=col, label=f"{c} (min over 20 seeds)")
    axs[0].plot(f6, [summ["e6"][f"{c}/{f}"]["medianH"] for f in f6], "o--", color=col, alpha=0.5, label=f"{c} (median of per-run min)")
for y in (50, 100, 150, 200): axs[0].axhline(y, color="k", lw=0.5, ls=":")
axs[0].set_xlabel("Fleet size"); axs[0].set_ylabel("Min horizontal separation (m)\nwhile vertical < 30 m"); axs[0].set_ylim(-10, 360); axs[0].legend(fontsize=6.5); axs[0].grid(alpha=0.3)
for t, col in zip(TH, ["#16a34a", "#2563eb", "#f59e0b", "#dc2626"]):
    axs[1].plot(f6, [summ["e6"][f"hyperhex/{f}"]["losPerRun"][t] for f in f6], "o-", color=col, label=f"HyperHex, {t}")
axs[1].set_xlabel("Fleet size"); axs[1].set_ylabel("Continuous-time LoS pairs per run"); axs[1].legend(fontsize=7); axs[1].grid(alpha=0.3)
axs[1].set_title("HyperHex: none below 100 m; all pairs below 150/200 m fall between slots\n(not visible to the discrete check)", fontsize=9)
fig.suptitle("Continuous-time separation (linear interpolation, 8 samples/slot, layer midpoints 75/115/155 m)", fontsize=9.5)
fig.tight_layout(); fig.savefig(os.path.join(outdir, "fig_e6_separation.png"), dpi=200)
json.dump(summ, open(os.path.join(outdir, "e3_e6_summary.json"), "w"), indent=1)
print("\n".join(md + sp)); print(); print("\n".join(md6))
