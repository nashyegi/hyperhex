# E4: closure stress test, safe fallback and evacuation

## Engine change (src/lib/hyperhex.ts)

`Airspace.injectNoFly(center, radius, drones, now, mode = "local")` now routes HyperHex closures through
`repairCoordinated` when `Airspace.fallback` is true (default):

1. Affected drones: airborne inside a closed cell at activation, or with any planned state in a closed cell
   at or after activation. In `"global"` mode every active drone is affected (full-fleet release and replan).
2. Each affected drone releases its reservations from the replanning slot on.
3. Not yet departed: replan origin → destination. If impossible, or origin/destination closed, the mission is
   cancelled on the ground.
4. Airborne inside the closure: evacuate along the earliest reservable path to any open cell (closed cells may be
   traversed only for this exit).
5. Replan to the destination with SIPP against the ledger.
6. If that fails or the destination is closed: contingency landing at the earliest reachable open cell on the lowest
   layer (time-expanded BFS through free voxels and edges, 60-slot horizon).
7. All new paths are reserved. If nothing is found within the horizon the drone is logged UNRESOLVED (never observed).

`contingencySearch` is exported. `Metrics` gains `diverted`, `cancelled` and `evacuated`. `fallback = false`
reproduces the behaviour at commit 55da324.

## Experiment

`bun run scripts/e4.ts e4_results.jsonl 10` then `python3 scripts/e4-analyze.py e4_results.jsonl .`

Grid: closure radius {1,2,3} × activation slot {4,12,20} × endpoint policy {outside the closure, anywhere} ×
fleet {48, 96} × seeds 2000–2009, for methods legacy / local+fallback / global+fallback / geofence / reactive.
Demand generator as in E2 (departures uniform on [0,30)).

Metrics: conflicts (engine detector), arrivals, diverted, cancelled, inside-at-activation and evacuated,
drones newly entering the closure after activation (excluding those already inside), disrupted drones
(post-activation trajectory changed), and repair planning time.
