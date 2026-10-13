# E2/E5: seeded density sweep and admission-cost scaling

Harness added on top of commit `55da324` without changing engine behaviour.

- `src/lib/experiments.ts`: seeded random demand (mulberry32 PRNG) and a per-run metric collector.
- `scripts/e2-e5.ts`: batch runner. `bun run scripts/e2-e5.ts <out.jsonl> <seeds> <timingReps> <excludeRadius>`
- `scripts/e2-e5-analyze.py`: mean ± 95% CI (Student t, n-1 df, across seeds), tables and figures (needs matplotlib).

Reproduce the reported runs:

```sh
bun run scripts/e2-e5.ts e2_e5_results.jsonl 20 5 1             # main sweep + E5 timing
bun run scripts/e2-e5.ts e2_stress_od_in_closure.jsonl 10 0 -1  # stress variant
python3 scripts/e2-e5-analyze.py e2_e5_results.jsonl . e2
```

## Scenario assumptions

| Item | Value |
| --- | --- |
| Seeds | 1000 … 1000+S-1 (S = 20 main, 10 stress) |
| Fleet sizes | 12, 24, 36, 48, 72, 96, 144 transit drones; no stack-demo drones |
| O/D cells | uniform over the H3 res-9 disk of radius 7 around the origin (169 cells), minus cells within distance 1 of the centre (main sweep); rejection-sampled until grid distance ≥ 5 |
| Departure | uniform integer slot in [0, 30) |
| Initial layer | uniform over the three layers |
| Closure | centre cell + radius-1 ring (7 cells), injected at slot 8, persistent |
| Admission order | generated order (sequential prioritised planning) |

Excluding O/D from the closure footprint is deliberate: a mission whose origin or destination is closed cannot be repaired by any controller. The stress variant (`excludeRadius = -1`) keeps such missions and exposes the engine's failed-repair behaviour.

## Timing (E5)

`Airspace.admitAll` also runs an uncoordinated reference plan for each HyperHex drone, used only for a log message, so its `planMs` overstates cost. The harness reproduces HyperHex admission with only the coordinated `sipp` call timed. `admissionMatchesEngine` checks that it yields byte-identical paths to `admitAll` (fleet 12/72/144 × 3 seeds). Each (fleet, seed) admission is repeated 5× after a 3-run warm-up; the median is reported. Timings depend on hardware and runtime.

## Metric notes

- `dronesEnteringNoFly`: drones with a stored state in a closed cell after the closure slot. In the main sweep every such HyperHex drone was already inside the closure at slot 8; the engine's repair condition skips these drones (documented limitation).
- `conflictsInvolvingFailedRepair`: conflicts in which at least one drone's coordinated repair failed. On failure the engine has already released that drone's future reservations but keeps its old path.
