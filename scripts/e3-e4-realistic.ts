// E3 (admission order) and E4 (closure stress) at an E7 setting (default: realistic r10-8s-b1).
// Physical scales are mapped from the resolution-9 studies: closure radii 1/2/3 rings at res 9
// (~0.53 / 0.89 / 1.25 km footprint radius) -> 4/6/9 rings at res 10; activation slots 4/12/20 of 4 s
// (16 / 48 / 80 s) -> 2/6/10 slots of 8 s.
// Usage: bun run scripts/e3-e4-realistic.ts out.jsonl e3|e4 [setting] [seeds] [fleet filter] [radius filter] [seed start]
// Env METHODS=a,b restricts E4 to those methods. Rows are appended to out.jsonl as they finish (checkpointing).
import { appendFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runRandom, type AdmissionOrder } from "../src/lib/experiments";
import { SETTINGS } from "./e7-realism";

const out = process.argv[2] ?? "e3e4.jsonl";
const which = process.argv[3] ?? "e3";
const st = SETTINGS.find((s) => s.id === (process.argv[4] ?? "r10-8s-b1"));
if (!st) throw new Error("unknown setting");
const SEEDS = Number(process.argv[5] ?? (which === "e3" ? 20 : 10));
const fleetFilter = process.argv[6] ? process.argv[6].split(",").map(Number) : null;
const radiusFilter = process.argv[7] ? process.argv[7].split(",").map(Number) : null;
const seedStart = Number(process.argv[8] ?? 0); // first seed index (to split runs across processes)
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
const RADII = st.res === 10 ? [4, 6, 9] : [1, 2, 3];
const ACTIVATION = st.res === 10 ? [2, 6, 10] : [4, 12, 20];
const METHODS = [
  { name: "legacy", controller: "hyperhex", mode: "local", fallback: false },
  { name: "local+fallback", controller: "hyperhex", mode: "local", fallback: true },
  { name: "global+fallback", controller: "hyperhex", mode: "global", fallback: true },
  { name: "geofence", controller: "geofence", mode: "local", fallback: true },
  { name: "reactive", controller: "reactive", mode: "local", fallback: true },
] as const;
let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD").toString().trim();
} catch {
  // not a git checkout
}
const fleetsE3 = (fleetFilter ?? [48, 96, 144]).filter((f) => [48, 96, 144].includes(f));
const fleetsE4 = (fleetFilter ?? [48, 96]).filter((f) => [48, 96].includes(f));
const radii = radiusFilter ?? RADII;
const methodFilter = process.env.METHODS?.split(",") ?? null;
const lines = [
  JSON.stringify({
    kind: "meta",
    which,
    setting: st,
    commit,
    dirty: (() => {
      try {
        return execSync("git status --porcelain").toString().trim().length > 0;
      } catch {
        return null;
      }
    })(),
    runtime: `bun ${typeof Bun !== "undefined" ? Bun.version : "?"}`,
    seeds: Array.from({ length: SEEDS }, (_, s) => (which === "e3" ? 1000 : 2000) + s),
    orders: ORDERS,
    radii: RADII,
    activation: ACTIVATION,
    fleets: which === "e3" ? fleetsE3 : [48, 96],
    policies: ["outside", "anywhere"],
    date: new Date().toISOString(),
  }),
];
writeFileSync(out, lines[0] + "\n");
let written = 1;
const flush = () => {
  appendFileSync(
    out,
    lines
      .slice(written)
      .map((l) => l + "\n")
      .join(""),
  );
  written = lines.length;
};
if (which === "e3") {
  for (const fleet of fleetsE3)
    for (let s = 0; s < SEEDS; s++)
      for (const order of ORDERS) {
        const r = runRandom(
          "hyperhex",
          { ...st.scenario, fleet, seed: 1000 + s },
          { closure: st.closure, order, engine: st.engine },
        );
        lines.push(JSON.stringify({ kind: "e3", order, ...r }));
        flush();
      }
} else {
  for (const fleet of fleetsE4)
    for (const radius of radii)
      for (const at of ACTIVATION)
        for (const policy of ["outside", "anywhere"] as const)
          for (let s = seedStart; s < seedStart + SEEDS; s++) {
            const cfg = {
              ...st.scenario,
              fleet,
              seed: 2000 + s,
              excludeRadius: policy === "outside" ? radius : -1,
            };
            for (const m of METHODS) {
              if (methodFilter && !methodFilter.includes(m.name)) continue;
              const r = runRandom(m.controller, cfg, {
                closure: { at, radius },
                mode: m.mode,
                fallback: m.fallback,
                engine: st.engine,
              });
              lines.push(JSON.stringify({ kind: "run", method: m.name, radius, at, policy, ...r }));
            }
            flush();
            process.stderr.write(".");
          }
}
flush();
console.error(`\nwrote ${lines.length} lines to ${out}`);
