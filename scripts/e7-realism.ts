// E7: resolution / slot-length realism with a temporal reservation buffer.
// Re-runs the E2 density sweep (all three controllers, closure mid-scenario) and the E6
// continuous-time separation check at several (H3 resolution, slot length, buffer) settings.
// Usage: bun run scripts/e7-realism.ts out.jsonl <setting-id> [seeds] [fleets comma-separated]
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { cellToLatLng, greatCircleDistance, gridDisk, latLngToCell } from "h3-js";
import {
  runRandom,
  continuousSeparation,
  type RandomScenarioConfig,
  type SeparationResult,
} from "../src/lib/experiments";
import { CONTROLLERS, ORIGIN, type Controller, type EngineConfig } from "../src/lib/hyperhex";

export type Setting = {
  id: string;
  res: number;
  scenario: Omit<RandomScenarioConfig, "fleet" | "seed">;
  closure: { at: number; radius: number };
  engine: Partial<EngineConfig> & { slotSec: number; bufferSlots: number };
  controllers: Controller[];
};

// Physical scenario held (approximately) constant across resolutions: ~2.5 km demand disk,
// O/D >= ~1.8 km apart, departures over 120 s, closure of ~0.5-0.9 km^2 activated at 32 s.
// H3 aperture 7: one resolution step scales linear cell size by ~1/sqrt(7) = 0.378.
const R9 = { diskRadius: 7, minOD: 5, departWindow: 30, excludeRadius: 1, res: 9 };
const R10 = { diskRadius: 19, minOD: 13, departWindow: 15, excludeRadius: 4, res: 10 };
const R11 = { diskRadius: 49, minOD: 35, departWindow: 30, excludeRadius: 10, res: 11 };
const ALL: Controller[] = CONTROLLERS.map((c) => c.id);
export const SETTINGS: Setting[] = [
  {
    id: "r9-4s-b0",
    res: 9,
    scenario: R9,
    closure: { at: 8, radius: 1 },
    engine: { slotSec: 4, bufferSlots: 0 },
    controllers: ALL,
  },
  {
    id: "r9-4s-b1",
    res: 9,
    scenario: R9,
    closure: { at: 8, radius: 1 },
    engine: { slotSec: 4, bufferSlots: 1 },
    controllers: ["hyperhex"],
  },
  {
    id: "r10-8s-b0",
    res: 10,
    scenario: R10,
    closure: { at: 4, radius: 4 },
    engine: {
      slotSec: 8,
      bufferSlots: 0,
      maxT: 90,
      maxWait: 15,
      maxExpansions: 60000,
      contingencyHorizon: 30,
    },
    controllers: ["hyperhex"],
  },
  {
    id: "r10-8s-b1",
    res: 10,
    scenario: R10,
    closure: { at: 4, radius: 4 },
    engine: {
      slotSec: 8,
      bufferSlots: 1,
      maxT: 90,
      maxWait: 15,
      maxExpansions: 60000,
      contingencyHorizon: 30,
    },
    controllers: ALL,
  },
  {
    id: "r11-4s-b1",
    res: 11,
    scenario: R11,
    closure: { at: 8, radius: 10 },
    engine: {
      slotSec: 4,
      bufferSlots: 1,
      maxT: 240,
      maxWait: 30,
      maxExpansions: 150000,
      contingencyHorizon: 60,
    },
    controllers: ["hyperhex"],
  },
];

/** Neighbour-centre spacing (m) over the demand disk: min / mean / max. */
export function spacing(res: number, radius: number) {
  const c = latLngToCell(ORIGIN.lat, ORIGIN.lng, res);
  let lo = Infinity,
    hi = 0,
    sum = 0,
    n = 0;
  for (const x of gridDisk(c, radius))
    for (const y of gridDisk(x, 1)) {
      if (y === x) continue;
      const d = greatCircleDistance(cellToLatLng(x), cellToLatLng(y), "m");
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
      sum += d;
      n++;
    }
  return { min: lo, mean: sum / n, max: hi };
}

if (import.meta.main) {
  const out = process.argv[2] ?? "e7_results.jsonl";
  const st = SETTINGS.find((s) => s.id === process.argv[3]);
  if (!st)
    throw new Error(`unknown setting; choose one of ${SETTINGS.map((s) => s.id).join(", ")}`);
  const SEEDS = Number(process.argv[4] ?? 20);
  const FLEETS = (process.argv[5] ?? "12,24,36,48,72,96,144").split(",").map(Number);
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD").toString().trim();
  } catch {
    // not a git checkout
  }
  const sp = spacing(st.res, st.scenario.diskRadius);
  const lines = [
    JSON.stringify({
      kind: "meta",
      setting: st,
      commit,
      note: "engine = commit + combined research patch (uncommitted)",
      runtime: `bun ${typeof Bun !== "undefined" ? Bun.version : "?"}`,
      seeds: Array.from({ length: SEEDS }, (_, s) => 1000 + s),
      fleets: FLEETS,
      spacing: sp,
      speedMps: { min: sp.min / st.engine.slotSec, max: sp.max / st.engine.slotSec },
      date: new Date().toISOString(),
    }),
  ];
  const H = [25, 50, 100, 150, 200];
  for (const fleet of FLEETS)
    for (let s = 0; s < SEEDS; s++)
      for (const c of st.controllers) {
        let sep: SeparationResult | null = null;
        const r = runRandom(
          c,
          { ...st.scenario, fleet, seed: 1000 + s },
          {
            closure: st.closure,
            engine: st.engine,
            inspect: (drones) =>
              (sep = continuousSeparation(drones, { hThresholds: H, hTight: 25 })),
          },
        );
        lines.push(JSON.stringify({ kind: "e7", setting: st.id, ...r, sep }));
      }
  writeFileSync(out, lines.join("\n") + "\n");
  console.error(`wrote ${lines.length} lines to ${out}`);
}
