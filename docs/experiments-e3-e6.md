# E3 admission order and E6 continuous-time separation

Run (from the repository root, Bun 1.4.2):

```
bun run scripts/e3-e6.ts out/e3_e6_results.jsonl
python3 scripts/e3-e6-analyze.py out/e3_e6_results.jsonl out/
```

Demand and closure are the E2 settings: seeds 1000-1019, disk radius 7, min OD distance 5,
departures uniform on [0, 30), endpoints outside the closure, radius-1 closure at slot 8.

## E3: admission order (HyperHex, local repair + fallback)

Orders (`applyOrder` in `src/lib/experiments.ts`): `generated` (request order), `fifo` (departure slot),
`longest` / `shortest` (H3 grid distance, ties by departure then request index), and `random:1..5`
(seeded Fisher-Yates). Fleets 48, 96, 144; 540 runs. The `generated` rows reproduce E2 exactly.

## E6: continuous-time separation (`continuousSeparation`)

- Horizontal position: linear between consecutive cell centres (local equirectangular projection).
- Altitude: layer base + 15 m (75 / 115 / 155 m); layer changes interpolated linearly within the slot.
- 8 samples per slot. Loss of separation (LoS) at threshold H: horizontal < H and vertical < 30 m.
  H in {50, 100, 150, 200} m is a sensitivity range, not a standard.
- Each LoS pair is compared with an exact discrete pair set (all voxel sharers, horizontal swaps,
  vertical swaps). `findConflicts` attributes a shared voxel only to its first occupant, so it slightly
  undercounts distinct pairs for the baselines; HyperHex has zero under both.

Key limitation: on one layer, the discrete rules allow a drone to enter a cell in the slot in which
another leaves it toward a neighbour 60 degrees away, so mid-slot spacing can fall to half the neighbour
spacing (174 m at resolution 9; ~25 m at resolution 11). Pairs closer than that occurred only during
layer changes (min 131 m). At resolution 9 one cell per 4-s slot implies 87-91 m/s.

## Figures

- `scripts/figures/fig1_architecture.py out.png`: architecture diagram.
- `bun run scripts/figures/fig2-data.ts fig2.json && python3 scripts/figures/fig2_stack.py fig2.json out.png`:
  headless matplotlib rendering of the three-drone stack (substitute for a CesiumJS screenshot).
