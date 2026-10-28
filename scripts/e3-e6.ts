// E3 admission-order sensitivity and E6 continuous-time separation check.
// Usage: bun run scripts/e3-e6.ts [out.jsonl] [seeds]
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  runRandom,
  continuousSeparation,
  DEFAULT_RANDOM,
  type AdmissionOrder,
  type SeparationResult,
} from "../src/lib/experiments";
import { CONTROLLERS } from "../src/lib/hyperhex";

const out = process.argv[2] ?? "e3_e6_results.jsonl";
const SEEDS = Number(process.argv[3] ?? 20);
const CLOSURE = { at: 8, radius: 1 };
const ORDERS: AdmissionOrder[] = [
  "generated",
  "fifo",
  "longest",
  "shortest",
  "random:1",
  "random:2",
  "random:3",
  "random:4",
  "random:5",
];
const E3_FLEETS = [48, 96, 144];
const E6_FLEETS = [12, 24, 36, 48, 72, 96, 144];
const lines: string[] = [];
let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD").toString().trim();
} catch {
  // not a git checkout
}
lines.push(
  JSON.stringify({
    kind: "meta",
    commit,
    dirty: (() => {
      try {
        return execSync("git status --porcelain").toString().trim().length > 0;
      } catch {
        return null;
      }
    })(),
    runtime: `bun ${typeof Bun !== "undefined" ? Bun.version : "?"}`,
    seeds: Array.from({ length: SEEDS }, (_, s) => 1000 + s),
    closure: CLOSURE,
    scenario: DEFAULT_RANDOM,
    orders: ORDERS,
    e3Fleets: E3_FLEETS,
    e6Fleets: E6_FLEETS,
    e6: { samplesPerSlot: 8, hThresholds: [50, 100, 150, 200], vThreshold: 30, hTight: 50 },
    date: new Date().toISOString(),
  }),
);
// E3: HyperHex with local repair + fallback, same demand (seed) under each admission order.
for (const fleet of E3_FLEETS)
  for (let s = 0; s < SEEDS; s++)
    for (const order of ORDERS) {
      const r = runRandom(
        "hyperhex",
        { ...DEFAULT_RANDOM, fleet, seed: 1000 + s },
        { closure: CLOSURE, order },
      );
      lines.push(JSON.stringify({ kind: "e3", order, ...r }));
    }
process.stderr.write("E3 done\n");
// E6: continuous separation on the E2 main-sweep scenarios, all three controllers.
for (const fleet of E6_FLEETS)
  for (let s = 0; s < SEEDS; s++)
    for (const c of CONTROLLERS) {
      let sep: SeparationResult | null = null;
      const r = runRandom(
        c.id,
        { ...DEFAULT_RANDOM, fleet, seed: 1000 + s },
        { closure: CLOSURE, inspect: (drones) => (sep = continuousSeparation(drones)) },
      );
      lines.push(
        JSON.stringify({
          kind: "e6",
          controller: c.id,
          fleet,
          seed: 1000 + s,
          conflicts: r.conflicts,
          sep,
        }),
      );
    }
writeFileSync(out, lines.join("\n") + "\n");
console.error(`wrote ${lines.length} lines to ${out}`);
