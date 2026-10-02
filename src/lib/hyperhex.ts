// HyperHex 4D reservation engine: (H3 cell, altitude layer, time slot) voxels.
import { latLngToCell, gridDisk, gridDistance, cellToLatLng } from "h3-js";

export const RES = 9;
export const LAYERS: number[] & { [i: number]: number } = [60, 100, 140] as any; // floor altitude (m) per layer
export const LAYER_H = 30;
export const SLOT_SEC = 4;
export const MAX_T = 120;
export const ORIGIN = { lat: 37.7793, lng: -122.4193 };

export type State = { cell: string; layer: number; t: number };
export type Drone = {
  id: string;
  color: string;
  from: string;
  to: string;
  start: number;
  path: State[];
  replans: number;
};
export type LogEntry = { t: number; kind: "plan" | "conflict" | "replan" | "nofly" | "fail"; msg: string };

const key = (c: string, l: number, t: number) => `${c}|${l}|${t}`;

export class Airspace {
  table = new Map<string, string>(); // voxel -> drone id
  noFly = new Set<string>();
  log: LogEntry[] = [];

  reserve(d: Drone) {
    for (const s of d.path) this.table.set(key(s.cell, s.layer, s.t), d.id);
    // hold destination briefly after landing slot
  }
  release(d: Drone, fromT: number) {
    for (const s of d.path) if (s.t >= fromT && this.table.get(key(s.cell, s.layer, s.t)) === d.id) this.table.delete(key(s.cell, s.layer, s.t));
  }
  owner(c: string, l: number, t: number) {
    return this.table.get(key(c, l, t));
  }

  // A* over 4D voxels. constrained=false ignores other reservations (used to reveal conflicts).
  plan(id: string, start: State, goal: string, constrained = true): State[] | null {
    const h = (c: string) => gridDistance(c, goal);
    const open: { s: State; g: number; f: number }[] = [{ s: start, g: 0, f: h(start.cell) }];
    const came = new Map<string, State | null>([[key(start.cell, start.layer, start.t), null]]);
    const free = (c: string, l: number, t: number) => {
      if (this.noFly.has(c)) return false;
      if (!constrained) return true;
      const o = this.table.get(key(c, l, t));
      return !o || o === id;
    };
    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const { s, g } = open.shift()!;
      if (s.cell === goal) {
        const out: State[] = [];
        let cur: State | null | undefined = s;
        while (cur) { out.unshift(cur); cur = came.get(key(cur.cell, cur.layer, cur.t)); }
        return out;
      }
      if (s.t >= start.t + MAX_T) continue;
      const t = s.t + 1;
      const next: State[] = [];
      for (const n of gridDisk(s.cell, 1)) next.push({ cell: n, layer: s.layer, t }); // includes wait
      if (s.layer > 0) next.push({ cell: s.cell, layer: s.layer - 1, t });
      if (s.layer < LAYERS.length - 1) next.push({ cell: s.cell, layer: s.layer + 1, t });
      for (const n of next) {
        const k = key(n.cell, n.layer, n.t);
        if (came.has(k) || !free(n.cell, n.layer, n.t)) continue;
        // swap-conflict check: someone moving into our cell from theirs
        if (constrained && n.cell !== s.cell) {
          const o = this.table.get(key(s.cell, s.layer, t));
          if (o && o !== id && this.table.get(key(n.cell, n.layer, s.t)) === o) continue;
        }
        came.set(k, s);
        const cost = n.cell === s.cell && n.layer === s.layer ? 1.2 : n.layer !== s.layer ? 1.5 : 1;
        open.push({ s: n, g: g + cost, f: g + cost + h(n.cell) });
      }
    }
    return null;
  }

  conflictsOf(id: string, path: State[]) {
    const seen = new Set<string>();
    const out: { t: number; with: string }[] = [];
    for (const s of path) {
      const o = this.table.get(key(s.cell, s.layer, s.t));
      if (o && o !== id && !seen.has(o)) { seen.add(o); out.push({ t: s.t, with: o }); }
    }
    return out;
  }

  // Plan with conflict reveal: show the naive path's conflicts, then the deconflicted one.
  admit(d: Drone, now: number, startState?: State) {
    const s0 = startState ?? { cell: d.from, layer: 1, t: d.start };
    const naive = this.plan(d.id, s0, d.to, false);
    if (naive) for (const c of this.conflictsOf(d.id, naive))
      this.log.push({ t: now, kind: "conflict", msg: `${d.id} shortest path collides with ${c.with} at slot ${c.t}` });
    const p = this.plan(d.id, s0, d.to, true);
    if (!p) { this.log.push({ t: now, kind: "fail", msg: `${d.id} no feasible 4D route — holding` }); return false; }
    d.path = startState ? [...d.path.filter((s) => s.t < startState.t), ...p] : p;
    this.reserve(d);
    const extra = naive ? p.length - naive.length : 0;
    this.log.push({ t: now, kind: startState ? "replan" : "plan", msg: `${d.id} ${startState ? "replanned" : "reserved"} ${p.length} voxels${extra > 0 ? ` (+${extra} slots to deconflict)` : ""}` });
    return true;
  }

  stateAt(d: Drone, t: number): State | null {
    if (!d.path.length || t < d.path[0].t) return null;
    let last = d.path[0];
    for (const s of d.path) { if (s.t > t) break; last = s; }
    return last;
  }

  injectNoFly(center: string, radius: number, drones: Drone[], now: number) {
    for (const c of gridDisk(center, radius)) this.noFly.add(c);
    this.log.push({ t: now, kind: "nofly", msg: `TFR activated: ${gridDisk(center, radius).length} cells closed` });
    for (const d of drones) {
      const future = d.path.filter((s) => s.t > now);
      if (!future.some((s) => this.noFly.has(s.cell))) continue;
      const cur = this.stateAt(d, now) ?? d.path[0];
      if (this.noFly.has(cur.cell)) continue; // already inside — let it exit
      this.release(d, now + 1);
      d.replans++;
      this.admit(d, now, { cell: cur.cell, layer: cur.layer, t: Math.max(now, cur.t) });
    }
  }
}

const COLORS = ["#f59e0b", "#22d3ee", "#a3e635", "#f472b6", "#fb7185", "#c084fc", "#facc15", "#34d399"];

export function buildScenario() {
  const center = latLngToCell(ORIGIN.lat, ORIGIN.lng, RES);
  const ring = gridDisk(center, 6).filter((c) => gridDistance(center, c) === 6);
  const n = ring.length;
  const drones: Drone[] = [];
  const pairs = [[0, n / 2], [n / 4, (3 * n) / 4], [n / 8, (5 * n) / 8], [(3 * n) / 8, (7 * n) / 8], [n / 2 + 2, 2], [(3 * n) / 4 + 3, n / 4 + 3], [n / 6, (2 * n) / 3], [(5 * n) / 6, n / 3]];
  (pairs as [number, number][]).forEach(([a, b], i) => {
    drones.push({ id: `UAV-${String(i + 1).padStart(2, "0")}`, color: COLORS[i], from: ring[Math.floor(a) % n], to: ring[Math.floor(b) % n], start: 0, path: [], replans: 0 });
  });
  const air = new Airspace();
  for (const d of drones) air.admit(d, 0);
  return { air, drones, center };
}

export const cellCenter = (c: string) => { const [lat, lng] = cellToLatLng(c); return { lat, lng }; };
