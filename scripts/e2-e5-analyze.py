#!/usr/bin/env python3
"""Summarise E2/E5 jsonl: mean ± 95% CI (Student t, n-1 df, across seeds) per controller × fleet; draw figures.
Usage: python3 scripts/e2-e5-analyze.py results.jsonl outdir [prefix]"""
import json, sys, math, statistics as st, os
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
T975 = {1:12.706,2:4.303,3:3.182,4:2.776,5:2.571,6:2.447,7:2.365,8:2.306,9:2.262,10:2.228,11:2.201,12:2.179,13:2.160,14:2.145,15:2.131,16:2.120,17:2.110,18:2.101,19:2.093,20:2.086,29:2.045}
def ci(xs):
    n=len(xs); m=st.mean(xs)
    if n<2: return m,0.0
    return m, T975.get(n-1,1.96)*st.stdev(xs)/math.sqrt(n)
src, outdir = sys.argv[1], sys.argv[2]; prefix = sys.argv[3] if len(sys.argv)>3 else "e2"
L=[json.loads(l) for l in open(src)]
meta=next(x for x in L if x["kind"]=="meta"); runs=[x for x in L if x["kind"]=="run"]; tim=[x for x in L if x["kind"]=="timing"]
fleets=sorted({r["fleet"] for r in runs}); ctrls=["hyperhex","geofence","reactive"]
NAME={"hyperhex":"HyperHex","geofence":"Static geofence","reactive":"Reactive"}
def g(c,f,key): return [key(r) for r in runs if r["controller"]==c and r["fleet"]==f]
metrics={
 "conflicts":lambda r:r["conflicts"],
 "pct_arrived":lambda r:100*r["arrived"]/r["fleet"],
 "non_arrived":lambda r:r["nonArrived"],
 "ground_holds":lambda r:r["groundHolds"],
 "repair_failures":lambda r:r["repairFailures"],
 "delay_per_arrival_s":lambda r:r["delayPerArrivalSec"],
 "nofly_drones":lambda r:r["dronesEnteringNoFly"],
 "conflicts_with_failed_repair":lambda r:r["conflictsInvolvingFailedRepair"],
 "ledger_nodes":lambda r:r["ledgerNodeIntervals"],
 "ledger_edges":lambda r:r["ledgerEdgeIntervals"],
 "entering_excl_inside":lambda r:r.get("dronesEnteringNoFlyExclInside",0),
 "inside_at_activation":lambda r:r.get("insideAtActivation",0),
 "evacuated":lambda r:r.get("evacuated",0),
 "diverted":lambda r:r.get("diverted",0),
 "cancelled":lambda r:r.get("cancelled",0),
 "unresolved":lambda r:r.get("unresolved",0),
}
summary=[]
for c in ctrls:
  for f in fleets:
    row={"controller":c,"fleet":f,"n_seeds":len(g(c,f,lambda r:1))}
    for k,fn in metrics.items(): m,h=ci(g(c,f,fn)); row[k]=[round(m,3),round(h,3)]
    if c=="hyperhex":
      ts=[t["medianAdmitMsPerDrone"] for t in tim if t["fleet"]==f]
      if ts: m,h=ci(ts); row["admit_ms_per_drone"]=[round(m,4),round(h,4)]
      rm,rh=ci(g(c,f,lambda r:r["repairMsTotal"])); row["repair_ms_total"]=[round(rm,2),round(rh,2)]
      hz=g(c,f,lambda r:r["horizonSlots"]); row["max_horizon_slots"]=max(hz)
      row["zero_conflict_runs"]=sum(1 for x in g(c,f,lambda r:r["conflicts"]) if x==0)
    summary.append(row)
json.dump({"meta":meta,"summary":summary},open(os.path.join(outdir,f"{prefix}_summary.json"),"w"),indent=1)
# markdown table
fmt=lambda v,d=1: f"{v[0]:.{d}f} ± {v[1]:.{d}f}"
md=["| Drones | Controller | Conflicts | Arrived (%) | Non-arrivals (ground holds) | Delay / arrival (s) | Drones entering closure | Ledger node intervals |","|---|---|---|---|---|---|---|---|"]
for f in fleets:
  for c in ctrls:
    r=next(x for x in summary if x["controller"]==c and x["fleet"]==f)
    md.append(f"| {f if c=='hyperhex' else ''} | {NAME[c]} | {fmt(r['conflicts'],2)} | {fmt(r['pct_arrived'])} | {fmt(r['non_arrived'],2)} ({r['ground_holds'][0]:.2f}) | {fmt(r['delay_per_arrival_s'],2)} | {fmt(r['nofly_drones'],2)} | {fmt(r['ledger_nodes'],0) if c=='hyperhex' else '–'} |")
open(os.path.join(outdir,f"{prefix}_table.md"),"w").write("\n".join(md)+"\n")
# figures
sty={"hyperhex":"o-","geofence":"s--","reactive":"^:"}
fig,ax=plt.subplots(1,3,figsize=(12.5,3.6))
for c in ctrls:
  for a,k,lab in [(ax[0],"conflicts","Discrete conflicts per run"),(ax[1],"pct_arrived","Arrived (% of fleet)"),(ax[2],"delay_per_arrival_s","Mean delay per arrival (s)")]:
    ys=[next(x for x in summary if x["controller"]==c and x["fleet"]==f)[k] for f in fleets]
    a.errorbar(fleets,[y[0] for y in ys],yerr=[y[1] for y in ys],fmt=sty[c],capsize=3,label=NAME[c]); a.set_ylabel(lab)
for a in ax: a.set_xlabel("Drones (random O/D)"); a.grid(alpha=.3)
ax[0].legend(fontsize=8)
fig.suptitle(f"E2 seeded density sweep: {len(meta['seeds'])} seeds/point, mean ± 95% CI, radius-1 closure at slot 8, commit {meta['commit'][:7]}",fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(outdir,f"fig_{prefix}_density.png"),dpi=200)
if tim:
  fig,ax=plt.subplots(1,2,figsize=(9,3.4)); hh=[x for x in summary if x["controller"]=="hyperhex"]
  ax[0].errorbar(fleets,[x["admit_ms_per_drone"][0] for x in hh],yerr=[x["admit_ms_per_drone"][1] for x in hh],fmt="o-",capsize=3)
  ax[0].set_ylabel("Coordinated planning time (ms / drone)"); ax[0].set_ylim(bottom=0)
  ax[1].errorbar(fleets,[x["ledger_nodes"][0] for x in hh],yerr=[x["ledger_nodes"][1] for x in hh],fmt="o-",capsize=3,label="node intervals")
  ax[1].errorbar(fleets,[x["ledger_edges"][0] for x in hh],yerr=[x["ledger_edges"][1] for x in hh],fmt="s--",capsize=3,label="edge intervals")
  ax[1].set_ylabel("Ledger entries"); ax[1].legend(fontsize=8)
  for a in ax: a.set_xlabel("Drones"); a.grid(alpha=.3)
  fig.suptitle(f"E5 HyperHex admission cost and ledger size ({meta['runtime']}, {meta['platform']}; median of {meta['timingReps']} reps per seed, mean ± 95% CI over seeds)",fontsize=8.5)
  fig.tight_layout(); fig.savefig(os.path.join(outdir,f"fig_e5_scaling.png"),dpi=200)
print("\n".join(md))
