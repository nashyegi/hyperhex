// Export the three-drone stack from the built-in 15-drone scenario for scripts/figures/fig2_stack.py.
// Usage: bun run scripts/figures/fig2-data.ts out.json
import { writeFileSync } from "node:fs";
import { cellToBoundary, cellToLatLng, gridDisk } from "h3-js";
import { buildScenario, findStacks, ORIGIN } from "../../src/lib/hyperhex";

const out = process.argv[2] ?? "fig2.json";
const s = buildScenario("hyperhex", 12);
s.air.injectNoFly(s.center, 1, s.drones, 8);
const stacks = findStacks(s.drones);
const st = stacks.find((x) => x.members.length === 3);
if (!st) throw new Error("no three-drone stack found");

const R = 6371008.8;
const rad = Math.PI / 180;
const k = Math.cos(ORIGIN.lat * rad);
const P = ([la, ln]: number[]) => [(ln! - ORIGIN.lng) * rad * R * k, (la! - ORIGIN.lat) * rad * R];
const c0 = P(cellToLatLng(st.cell));
const rel = (ll: number[]) => {
  const p = P(ll);
  return [p[0]! - c0[0]!, p[1]! - c0[1]!];
};
const cells = gridDisk(st.cell, 1).map((c) => ({
  cell: c,
  center: c === st.cell,
  boundary: cellToBoundary(c).map(rel),
}));
const tracks = st.members.map((m) => {
  const d = s.drones.find((x) => x.id === m.id)!;
  return {
    id: m.id,
    layer: m.layer,
    color: m.color,
    pts: d.path
      .filter((p) => Math.abs(p.t - st.t) <= 2)
      .map((p) => ({ t: p.t, layer: p.layer, xy: rel(cellToLatLng(p.cell)) })),
  };
});
writeFileSync(
  out,
  JSON.stringify({ t: st.t, cell: st.cell, cells, tracks, nStacks: stacks.length }),
);
console.log(
  `slot ${st.t}, cell ${st.cell}: ${st.members.map((m) => `${m.id}@L${m.layer}`).join(" ")}`,
);
