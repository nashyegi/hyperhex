// E4 closure stress test. Usage: bun run scripts/e4.ts [out.jsonl] [seeds]
// Grid: closure radius {1,2,3} x activation slot {4,12,20} x endpoint policy {outside, anywhere}
//       x fleet {48,96} x seeds, for HyperHex methods:
//   legacy  = local repair, no fallback (behaviour at commit 55da324)
//   local   = local repair + evacuation + safe fallback (new default)
//   global  = full-fleet release and replan + evacuation + safe fallback
// plus the two baselines (static geofence, reactive) for reference.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runRandom, DEFAULT_RANDOM } from "../src/lib/experiments";

const out = process.argv[2] ?? "e4_results.jsonl";
const SEEDS = Number(process.argv[3] ?? 10);
const RADII = [1, 2, 3];
const ACTIVATION = [4, 12, 20];
const FLEETS = [48, 96];
const POLICIES = ["outside", "anywhere"] as const;
const METHODS = [
  { name: "legacy", controller: "hyperhex", mode: "local", fallback: false },
  { name: "local+fallback", controller: "hyperhex", mode: "local", fallback: true },
  { name: "global+fallback", controller: "hyperhex", mode: "global", fallback: true },
  { name: "geofence", controller: "geofence", mode: "local", fallback: true },
  { name: "reactive", controller: "reactive", mode: "local", fallback: true },
] as const;
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
    seeds: Array.from({ length: SEEDS }, (_, s) => 2000 + s),
    radii: RADII,
    activation: ACTIVATION,
    fleets: FLEETS,
    policies: POLICIES,
    scenario: DEFAULT_RANDOM,
    date: new Date().toISOString(),
  }),
);
for (const fleet of FLEETS)
  for (const radius of RADII)
    for (const at of ACTIVATION)
      for (const policy of POLICIES)
        for (let s = 0; s < SEEDS; s++) {
          const seed = 2000 + s;
          const cfg = {
            ...DEFAULT_RANDOM,
            fleet,
            seed,
            excludeRadius: policy === "outside" ? radius : -1,
          };
          for (const m of METHODS) {
            const r = runRandom(m.controller, cfg, {
              closure: { at, radius },
              mode: m.mode,
              fallback: m.fallback,
            });
            lines.push(JSON.stringify({ kind: "run", method: m.name, radius, at, policy, ...r }));
          }
          process.stderr.write(".");
        }
writeFileSync(out, lines.join("\n") + "\n");
console.error(`\nwrote ${lines.length} lines to ${out}`);
