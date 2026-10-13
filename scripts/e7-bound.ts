// E7: worst-case continuous-time separation implied by the discrete reservation rules on the real
// H3 geometry (local equirectangular projection, linear motion within a slot, layer mid-heights
// 75/115/155 m). Enumerates every one-slot move pair of two drones near each cell of the demand disk
// that the ledger admits (distinct nodes at both slot boundaries, no swap, and with bufferSlots = 1
// no entry into a node the other drone occupied in the previous slot), and reports the minimum
// horizontal distance while the vertical gap is below 30 m.
// Usage: bun run scripts/e7-bound.ts
import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { LAYERS, LAYER_H, ORIGIN } from "../src/lib/hyperhex";

const R = 6371008.8,
  rad = Math.PI / 180,
  k = Math.cos(ORIGIN.lat * rad);
const cache = new Map<string, [number, number]>();
const P = (c: string) => {
  let v = cache.get(c);
  if (!v) {
    const [la, ln] = cellToLatLng(c);
    v = [(ln - ORIGIN.lng) * rad * R * k, (la - ORIGIN.lat) * rad * R];
    cache.set(c, v);
  }
  return v;
};
const Z = (l: number) => LAYERS[l]! + LAYER_H / 2;
type S = { c: string; l: number };
const succ = (s: S): S[] => {
  const out = gridDisk(s.c, 1).map((c) => ({ c, l: s.l })); // includes hold
  if (s.l > 0) out.push({ c: s.c, l: s.l - 1 });
  if (s.l < LAYERS.length - 1) out.push({ c: s.c, l: s.l + 1 });
  return out;
};
const same = (a: S, b: S) => a.c === b.c && a.l === b.l;
const STEPS = 200;

function bound(res: number, radius: number, layered: boolean) {
  const c0 = latLngToCell(ORIGIN.lat, ORIGIN.lng, res);
  let b0 = Infinity,
    b1 = Infinity;
  const cells = gridDisk(c0, radius);
  const layers = layered ? [0, 1, 2] : [1];
  for (const a of cells)
    for (const la of layers) {
      const A0 = { c: a, l: la };
      for (const A1 of succ(A0))
        for (const b of gridDisk(a, 2))
          for (const lb of layers) {
            const B0 = { c: b, l: lb };
            if (same(A0, B0)) continue;
            for (const B1 of succ(B0)) {
              if (!layered && (A1.l !== 1 || B1.l !== 1)) continue;
              if (same(A1, B1) || (same(A1, B0) && same(B1, A0))) continue;
              const pa0 = P(A0.c),
                pa1 = P(A1.c),
                pb0 = P(B0.c),
                pb1 = P(B1.c);
              let m = Infinity;
              for (let i = 0; i <= STEPS; i++) {
                const t = i / STEPS;
                const dz = Math.abs(
                  Z(A0.l) + (Z(A1.l) - Z(A0.l)) * t - Z(B0.l) - (Z(B1.l) - Z(B0.l)) * t,
                );
                if (dz >= 30) continue;
                const dx = pa0[0] + (pa1[0] - pa0[0]) * t - pb0[0] - (pb1[0] - pb0[0]) * t;
                const dy = pa0[1] + (pa1[1] - pa0[1]) * t - pb0[1] - (pb1[1] - pb0[1]) * t;
                m = Math.min(m, Math.hypot(dx, dy));
              }
              b0 = Math.min(b0, m);
              if (!same(B1, A0) && !same(A1, B0)) b1 = Math.min(b1, m);
            }
          }
    }
  return { b0, b1 };
}

for (const [res, radius] of [
  [9, 7],
  [10, 19],
  [11, 49],
] as const) {
  const h = bound(res, radius, false); // all cells, same layer
  const v = bound(res, Math.min(radius, 4), true); // central cells, all layer combinations
  console.log(
    JSON.stringify({
      res,
      radius,
      sameLayerAllCells: { buffer0: h.b0, buffer1: h.b1 },
      allLayersCentralCells: { buffer0: v.b0, buffer1: v.b1 },
    }),
  );
}
