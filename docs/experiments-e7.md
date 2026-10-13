# E7: realistic resolution / slot length, reservation buffer and separation guarantee

## Engine parameters (`EngineConfig`, `src/lib/hyperhex.ts`)

`new Airspace(controller, { slotSec, maxT, maxExpansions, maxWait, bufferSlots, contingencyHorizon })`.
Defaults reproduce the original engine (4-s slots, horizon 90, 20,000 expansions, wait bound 30,
buffer 0, contingency horizon 60). The H3 resolution is carried by the cells, so scenarios choose it
(`RandomScenarioConfig.res`). One move (neighbour cell or adjacent layer) takes one slot, so cruise speed
is neighbour spacing / `slotSec`.

`bufferSlots = b` stores every node reservation [t_a, t_b] as [t_a - b, t_b + b]. With b = 1 no drone may
enter a node in the slot after another drone left it (or leave it in the slot before another arrives).

## Separation guarantee (`scripts/e7-bound.ts`)

Linear motion within a slot between cell centres (local equirectangular projection) and layer mid-heights
(75 / 115 / 155 m). The script enumerates every pair of one-slot moves the ledger admits around each cell
of the demand disk (same layer: all cells; all layer combinations: central cells), and reports the
minimum horizontal distance while the vertical gap is < 30 m:

| Resolution (disk radius) | Neighbour spacing (m) | b = 0 | b = 1 |
|---|---|---|---|
| 9 (7) | 348-364 | 88.8 m | 300.8 m |
| 10 (19) | 131-136 | 33.4 m | 114.7 m |
| 11 (49) | 50-52 | 12.7 m | 43.0 m |

With b = 1 the worst case is a drone holding at one cell while another passes between two of its neighbours:
the height of the smallest triangle of mutually adjacent cells, about (sqrt(3)/2) * s_min. Assumes exact
tracking of the reserved trajectory; take-off and landing are not modelled.

## Runs (`scripts/e7-realism.ts`, `scripts/e7-analyze.py`)

```
for s in r9-4s-b0 r9-4s-b1 r10-8s-b0 r10-8s-b1 r11-4s-b1; do
  bun run scripts/e7-realism.ts out/$s.jsonl $s 20
done
bun run scripts/e7-bound.ts > out/e7_bounds.jsonl
python3 scripts/e7-analyze.py out out/e7_bounds.jsonl out/r*.jsonl [--timing out/timing_*.jsonl]
```

Settings hold the physical scenario roughly constant (≈2.5 km demand disk, O/D ≥ ≈1.8 km apart, departures
over 120 s, closure of 0.5-0.9 km² at 32 s). Main realistic setting: `r10-8s-b1` (resolution 10, 8-s
slots, 16.4-17.0 m/s, buffer 1, disk 19, min O/D 13, closure radius 4, horizon 90 slots, wait bound 15,
60,000 expansions). `r9-4s-b0` reproduces the E2 results exactly.
