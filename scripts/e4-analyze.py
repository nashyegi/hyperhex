#!/usr/bin/env python3
"""Summarise E4 closure stress test: mean ± 95% CI over seeds per (method, fleet, radius, activation, policy).
Usage: python3 scripts/e4-analyze.py e4_results.jsonl outdir"""
import json, sys, math, statistics as st, os, collections
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
T975={1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,19:2.093,29:2.045,59:2.001,89:1.987,179:1.973}
def ci(xs):
    n=len(xs); m=st.mean(xs)
    return (m,0.0) if n<2 else (m, T975.get(n-1,1.96)*st.stdev(xs)/math.sqrt(n))
src,outdir=sys.argv[1],sys.argv[2]
L=[json.loads(l) for l in open(src)]; meta=L[0]; R=[x for x in L if x["kind"]=="run"]
M=["legacy","local+fallback","global+fallback","geofence","reactive"]
K={"conflicts":lambda r:r["conflicts"],"pct_arrived":lambda r:100*r["arrived"]/r["fleet"],
   "diverted":lambda r:r["diverted"],"cancelled":lambda r:r["cancelled"],"ground_holds":lambda r:r["groundHolds"],
   "inside":lambda r:r["insideAtActivation"],"evacuated":lambda r:r["evacuated"],
   "entering_excl_inside":lambda r:r["dronesEnteringNoFlyExclInside"],"repair_failures":lambda r:r["repairFailures"],
   "unresolved":lambda r:r["unresolved"],"disrupted":lambda r:r["disrupted"],
   "repair_ms":lambda r:r["repairMsTotal"] or 0,"delay_per_arrival_s":lambda r:r["delayPerArrivalSec"],
   "zero_conflict":lambda r:1 if r["conflicts"]==0 else 0,
   "slots_inside":lambda r:r["stateSlotsInsideAfterActivation"]}
def summ(sel):
    out={}
    for k,f in K.items(): m,h=ci([f(r) for r in sel]); out[k]=[round(m,3),round(h,3)]
    out["n"]=len(sel); out["max_conflicts"]=max(r["conflicts"] for r in sel)
    out["runs_with_conflict"]=sum(1 for r in sel if r["conflicts"]>0)
    return out
groups=collections.defaultdict(list)
for r in R: groups[(r["method"],r["policy"])].append(r)
pooled={f"{m}|{p}":summ(groups[(m,p)]) for m in M for p in ["outside","anywhere"]}
detail=collections.defaultdict(list)
for r in R: detail[(r["method"],r["policy"],r["fleet"],r["radius"],r["at"])].append(r)
det=[{"method":k[0],"policy":k[1],"fleet":k[2],"radius":k[3],"at":k[4],**summ(v)} for k,v in sorted(detail.items())]
json.dump({"meta":meta,"pooled":pooled,"detail":det},open(os.path.join(outdir,"e4_summary.json"),"w"),indent=1)
f=lambda v,d=2:f"{v[0]:.{d}f} ± {v[1]:.{d}f}"
md=["| Endpoints | Method | Conflicts/run | Runs with conflicts | Arrived (%) | Diverted | Cancelled | Inside at activation → evacuated | New closure entries | Drone-slots inside closure after activation | Disrupted drones | Repair time (ms) |","|---|---|---|---|---|---|---|---|---|---|---|---|"]
for p in ["outside","anywhere"]:
  for m in M:
    s=pooled[f"{m}|{p}"]
    md.append(f"| {p} | {m} | {f(s['conflicts'])} | {s['runs_with_conflict']}/{s['n']} | {f(s['pct_arrived'],1)} | {f(s['diverted'])} | {f(s['cancelled'])} | {s['inside'][0]:.2f} → {s['evacuated'][0]:.2f} | {f(s['entering_excl_inside'])} | {f(s['slots_inside'],1)} | {f(s['disrupted'],1)} | {f(s['repair_ms'],1) if m in M[:3] else '–'} |")
open(os.path.join(outdir,"e4_table.md"),"w").write("\n".join(md)+"\n"); print("\n".join(md))
# Figure: by radius (pooled over activation, fleet) for anywhere policy; conflicts, new entries, disrupted, repair ms
fig,ax=plt.subplots(1,4,figsize=(15,3.6)); sty={"legacy":"x:","local+fallback":"o-","global+fallback":"s--","geofence":"d-.","reactive":"^:"}
for m in M:
  for i,(k,lab) in enumerate([("conflicts","Conflicts per run"),("entering_excl_inside","Drones newly entering closure"),("disrupted","Drones with changed plans"),("repair_ms","Repair planning time (ms)")]):
    if k=="repair_ms" and m not in M[:3]: continue
    ys=[summ([r for r in R if r["method"]==m and r["policy"]=="anywhere" and r["radius"]==rad])[k] for rad in meta["radii"]]
    ax[i].errorbar(meta["radii"],[y[0] for y in ys],yerr=[y[1] for y in ys],fmt=sty[m],capsize=3,label=m); ax[i].set_ylabel(lab)
for a in ax: a.set_xlabel("Closure radius (H3 rings)"); a.set_xticks(meta["radii"]); a.grid(alpha=.3)
ax[3].set_yscale("log"); ax[0].legend(fontsize=7)
fig.suptitle(f"Closure stress (endpoints may lie in closure): pooled over activation slots {meta['activation']} and fleets {meta['fleets']}, {len(meta['seeds'])} seeds each; mean ± 95% CI",fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(outdir,"fig_e4_closure.png"),dpi=200)
# Figure 2: by activation slot, arrivals and disruption, local vs global (outside policy)
fig,ax=plt.subplots(1,2,figsize=(9,3.4))
for m in ["local+fallback","global+fallback"]:
  for i,(k,lab) in enumerate([("disrupted","Drones with changed plans"),("pct_arrived","Arrived (%)")]):
    ys=[summ([r for r in R if r["method"]==m and r["policy"]=="outside" and r["at"]==a])[k] for a in meta["activation"]]
    ax[i].errorbar(meta["activation"],[y[0] for y in ys],yerr=[y[1] for y in ys],fmt=sty[m],capsize=3,label=m); ax[i].set_ylabel(lab)
for a in ax: a.set_xlabel("Activation slot"); a.grid(alpha=.3)
ax[0].legend(fontsize=8); fig.suptitle("Local repair vs full-fleet replan (endpoints outside closure; pooled over radius and fleet)",fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(outdir,"fig_e4_local_vs_global.png"),dpi=200)
