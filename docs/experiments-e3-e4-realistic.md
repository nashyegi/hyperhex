# E3 and E4 at the realistic setting (r10-8s-b1)

Setting: H3 resolution 10, 8-s slots, one-slot reservation buffer (guaranteed horizontal separation
114.7 m between airborne drones within 30 m vertically; see `experiments-e7.md`). Physical scales
match the resolution-9 studies (`experiments-e3-e6.md`, `experiments-e4.md`), which are kept as
sensitivity results.

```bash
# E3: 3 fleets x 20 seeds x 9 admission orders = 540 runs
bun run scripts/e3-e4-realistic.ts e3_r10.jsonl e3 r10-8s-b1 20
python3 scripts/e3-e6-analyze.py e3_r10.jsonl out/          # E3-only input is supported
# E4: radii 4/6/9 rings x activation slots 2/6/10 x endpoints {outside, anywhere} x fleets 48/96
#     x 10 seeds x 5 methods = 1,800 runs. Split across processes with [fleet] [radius] [seed start];
#     rows are appended as they finish (checkpointing). METHODS=a,b restricts the methods.
bun run scripts/e3-e4-realistic.ts e4_r10.jsonl e4 r10-8s-b1 10
python3 scripts/e4-analyze.py e4_r10.jsonl out/
```

## E3 (540 runs, all conflict-free)

| Fleet 144 | Arrived % | Ground holds | Delay / arrival (s) |
|---|---|---|---|
| Request order | 96.7 ± 0.9 | 4.75 ± 1.17 | 7.11 ± 0.61 |
| FIFO by departure | 94.5 ± 0.8 | 7.95 ± 1.11 | 6.93 ± 0.60 |
| Longest first | 97.0 ± 0.6 | 4.25 ± 0.93 | 7.33 ± 0.65 |
| Shortest first | 96.7 ± 0.6 | 4.80 ± 0.85 | 6.71 ± 0.55 |
| Random (5 perms) | 97.0 ± 0.3 | 4.29 ± 0.39 | 6.96 ± 0.24 |

FIFO is worst; the other rules overlap. Within-seed range across the 9 orders: 5.8 arrivals on
average (max 9) at 144 drones. At resolution 9, shortest-first was the best rule and the range was
7.0 (max 12).

## E4 (1,800 runs), endpoints allowed inside the closure (180 runs per row)

| Method | Conflicts / run | Runs with conflicts | Arrived % | Cancelled / diverted | New closure entries | Repair (ms / run) |
|---|---|---|---|---|---|---|
| legacy | 0.58 ± 0.16 | 58/180 | 98.8 ± 0.2 | 0 / 0 | 12.5 ± 1.3 | 21439 ± 2031 |
| local + fallback | 0 | 0/180 | 80.5 ± 1.7 | 10.1 / 2.9 | 0 | 77 ± 8 |
| global + fallback | 0 | 0/180 | 80.3 ± 1.7 | 10.3 / 2.9 | 0 | 94 ± 9 |
| static geofence | 37.5 ± 4.1 | 180/180 | 100.0 | – | 12.7 ± 1.3 | – |
| reactive | 20.8 ± 2.4 | 180/180 | 93.9 ± 0.4 | – | 12.4 ± 1.3 | – |

All 720 fallback runs: zero conflicts, zero new closure entries, zero unresolved drones. Repair
times were measured with 12 processes on 8 vCPUs (indicative only).

### Combined exit-and-land search

One run (local + fallback, endpoints outside, 96 drones, seed 2004, 9-ring closure at slot 10)
initially left a drone unresolved: after a one-slot evacuation it was boxed in at its exit cell by
buffered reservations. When the two-stage evacuate-then-land plan fails, `repairCoordinated` now runs
`contingencySearch(..., "exit+land")` from the drone's position inside the closure (closed cells
may be crossed; the target is layer 0 of an open cell). Rerunning all 720 fallback runs changed only
that run (`src/test/closure-fallback.test.ts` covers it).
