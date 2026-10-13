// E2/E5 batch runner. Usage: bun run scripts/e2-e5.ts [outfile.jsonl] [seeds] [timingReps] [excludeRadius]
// excludeRadius defaults to 1; pass -1 for the stress variant. Writes one JSON line per (controller, fleet, seed) run; timing lines are tagged kind:"timing".
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runRandom, admissionMatchesEngine, DEFAULT_RANDOM } from "../src/lib/experiments";
import { CONTROLLERS } from "../src/lib/hyperhex";

const out = process.argv[2] ?? "e2_e5_results.jsonl";
const SEEDS = Number(process.argv[3] ?? 10);
const REPS = Number(process.argv[4] ?? 5);
const EXCLUDE = Number(process.argv[5] ?? DEFAULT_RANDOM.excludeRadius); // -1 = stress variant (O/D may lie in the closure)
const SCEN = { ...DEFAULT_RANDOM, excludeRadius: EXCLUDE };
const FLEETS = [12, 24, 36, 48, 72, 96, 144];
const CLOSURE = { at: 8, radius: 1 };
const lines: string[] = [];
let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD").toString().trim();
} catch {
  // not a git checkout: leave commit as "unknown"
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
    platform: `${process.platform}-${process.arch}`,
    seeds: Array.from({ length: SEEDS }, (_, s) => 1000 + s),
    fleets: FLEETS,
    closure: CLOSURE,
    scenario: SCEN,
    timingReps: REPS,
    date: new Date().toISOString(),
  }),
);

// Equivalence check of the clean-timed admission against the engine's own admitAll.
for (const f of [12, 72, 144])
  for (let s = 0; s < 3; s++)
    if (!admissionMatchesEngine({ ...SCEN, fleet: f, seed: 1000 + s }))
      throw new Error(`admission mismatch fleet=${f} seed=${1000 + s}`);
lines.push(
  JSON.stringify({
    kind: "check",
    admissionMatchesEngine: true,
    cases: "fleet {12,72,144} x seeds {1000,1001,1002}",
  }),
);

// Warm-up (JIT) before any timed run.
for (let w = 0; w < 3; w++)
  runRandom("hyperhex", { ...SCEN, fleet: 48, seed: 1 + w }, { closure: CLOSURE });

for (const fleet of FLEETS)
  for (let s = 0; s < SEEDS; s++)
    for (const c of CONTROLLERS) {
      const seed = 1000 + s;
      const r = runRandom(c.id, { ...SCEN, fleet, seed }, { closure: CLOSURE });
      lines.push(JSON.stringify({ kind: "run", ...r }));
      if (c.id === "hyperhex") {
        // E5: repeat HyperHex admission REPS times; report the median ms/drone for this (fleet, seed).
        const t: number[] = [];
        if (REPS > 0) {
          for (let k = 0; k < REPS; k++)
            t.push(
              runRandom("hyperhex", { ...SCEN, fleet, seed }, { closure: null }).admitMsPerDrone!,
            );
          t.sort((a, b) => a - b);
          lines.push(
            JSON.stringify({
              kind: "timing",
              fleet,
              seed,
              reps: REPS,
              medianAdmitMsPerDrone: t[Math.floor(t.length / 2)],
              all: t,
            }),
          );
        }
      }
      process.stderr.write(`.`);
    }
writeFileSync(out, lines.join("\n") + "\n");
console.error(`\nwrote ${lines.length} lines to ${out}`);
