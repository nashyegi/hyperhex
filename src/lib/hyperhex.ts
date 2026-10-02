// HyperHex 4D reservation engine.
// Voxel = (H3 cell, altitude layer, time slot). Principles:
//   Generate geography lazily · Store contention, not emptiness ·
//   Search safe intervals, not every moment · Repair locally, not globally.
import { latLngToCell, gridDisk, gridDistance, cellToLatLng } from "h3-js";

export const RES = 9;
export const LAYERS = [60, 100, 140];
export const alt = (l: number) => LAYERS[l] ?? 0;
export const LAYER_H = 30;
export const SLOT_SEC = 4;
export const MAX_T = 90;
export const ORIGIN = { lat: 37.7793, lng: -122.4193 };
const INF = Number.POSITIVE_INFINITY;

export type Controller = "hyperhex" | "geofence" | "reactive";
export const CONTROLLERS: { id: Controller; name: string; blurb: string }[] = [
  { id: "hyperhex", name: "HyperHex", blurb: "Strategic 4D reservations (SIPP + interval ledger) with local repair." },
  { id: "geofence", name: "Static geofence", blurb: "Avoids no-fly zones only. No coordination between aircraft." },
  { id: "reactive", name: "Reactive", blurb: "Shortest path, then hover when the next voxel is busy. No reservations." },
];

export type State = { cell: string; layer: number; t: number; i?: number };
export type Drone = {
  id: string; color: string; from: string; to: string; start: number; layer: number;
  path: State[];      // executed / reserved trajectory, one state per slot
  intent: State[];    // reactive only: desired route (untimed order)
  replans: number;
};
export type LogEntry = { t: number; kind: "plan" | "conflict" | "replan" | "nofly" | "fail" | "hold"; msg: string };
type Interval = { a: number; b: number; owner: string };

const nodeKey = (c: string, l: number) => `${c}|${l}`;
const edgeKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);

/** Sparse interval ledger: only contended resources are stored. */
export class Ledger {
  nodes = new Map<string, Interval[]>();
  edges = new Map<string, Interval[]>();
  private add(m: Map<string, Interval[]>, k: string, iv: Interval) {
    const arr = m.get(k) ?? [];
    arr.push(iv); arr.sort((x, y) => x.a - y.a); m.set(k, arr);
  }
  reservePath(id: string, path: State[]) {
    let i = 0;
    while (i < path.length) {
      const s = path[i]!; let j = i;
      while (j + 1 < path.length && path[j + 1]!.cell === s.cell && path[j + 1]!.layer === s.layer) j++;
      this.add(this.nodes, nodeKey(s.cell, s.layer), { a: s.t, b: path[j]!.t, owner: id });
      if (j + 1 < path.length) {
        const n = path[j + 1]!;
        this.add(this.edges, edgeKey(nodeKey(path[j]!.cell, path[j]!.layer), nodeKey(n.cell, n.layer)), { a: path[j]!.t, b: path[j]!.t, owner: id });
      }
      i = j + 1;
    }
  }
  /** Release everything `id` holds at or after time `from` (truncating intervals). */
  release(id: string, from: number) {
    for (const m of [this.nodes, this.edges]) for (const [k, arr] of m) {
      const out: Interval[] = [];
      for (const iv of arr) {
        if (iv.owner !== id || iv.b < from) out.push(iv);
        else if (iv.a < from) out.push({ ...iv, b: from - 1 });
      }
      if (out.length) m.set(k, out); else m.delete(k);
    }
  }
  safeIntervals(id: string, node: string): [number, number][] {
    const busy = (this.nodes.get(node) ?? []).filter((iv) => iv.owner !== id);
    const out: [number, number][] = []; let cur = 0;
    for (const iv of busy) { if (iv.a > cur) out.push([cur, iv.a - 1]); cur = Math.max(cur, iv.b + 1); }
    out.push([cur, INF]);
    return out;
  }
  edgeFree(id: string, a: string, b: string, t: number) {
    return !(this.edges.get(edgeKey(a, b)) ?? []).some((iv) => iv.owner !== id && t >= iv.a && t <= iv.b);
  }
  get size() { let n = 0; for (const a of this.nodes.values()) n += a.length; return n; }
}

/** Safe Interval Path Planning over the lazy 4D hex graph. */
export function sipp(ledger: Ledger | null, id: string, start: State, goal: string, noFly: Set<string>): State[] | null {
  const safe = (c: string, l: number): [number, number][] => (ledger ? ledger.safeIntervals(id, nodeKey(c, l)) : [[0, INF]]);
  const edgeOk = (a: State, b: { cell: string; layer: number }, t: number) =>
    !ledger || ledger.edgeFree(id, nodeKey(a.cell, a.layer), nodeKey(b.cell, b.layer), t);
  const h = (c: string) => gridDistance(c, goal);
  const s0 = safe(start.cell, start.layer).findIndex(([a, b]) => start.t >= a && start.t <= b);
  if (s0 < 0) return null;
  type Node = { cell: string; layer: number; iv: number; g: number; f: number; parent: Node | null; depart: number };
  const best = new Map<string, number>();
  const open: Node[] = [{ cell: start.cell, layer: start.layer, iv: s0, g: start.t, f: start.t + h(start.cell), parent: null, depart: 0 }];
  best.set(`${start.cell}|${start.layer}|${s0}`, start.t);
  let expansions = 0;
  while (open.length && expansions < 20000) {
    open.sort((x, y) => x.f - y.f || y.g - x.g);
    const n = open.shift()!; expansions++;
    if (n.cell === goal) {
      const chain: Node[] = []; for (let c: Node | null = n; c; c = c.parent) chain.unshift(c);
      const out: State[] = [];
      for (let k = 0; k < chain.length; k++) {
        const c = chain[k]!, nx = chain[k + 1];
        const until = nx ? nx.depart : c.g;
        for (let t = c.g; t <= until; t++) out.push({ cell: c.cell, layer: c.layer, t });
      }
      return out;
    }
    if (n.g > start.t + MAX_T) continue;
    const ivEnd = safe(n.cell, n.layer)[n.iv]![1];
    const nbrs: { cell: string; layer: number; cost: number }[] = [];
    for (const c of gridDisk(n.cell, 1)) if (c !== n.cell && !noFly.has(c)) nbrs.push({ cell: c, layer: n.layer, cost: 0 });
    if (n.layer > 0) nbrs.push({ cell: n.cell, layer: n.layer - 1, cost: 0.4 });
    if (n.layer < LAYERS.length - 1) nbrs.push({ cell: n.cell, layer: n.layer + 1, cost: 0.4 });
    for (const m of nbrs) {
      safe(m.cell, m.layer).forEach(([a, b], j) => {
        const lo = Math.max(n.g, a - 1), hi = Math.min(ivEnd, b - 1, n.g + 30);
        for (let d = lo; d <= hi; d++) {
          if (!edgeOk(n, m, d)) continue;
          const arr = d + 1, k = `${m.cell}|${m.layer}|${j}`;
          if (arr < (best.get(k) ?? INF)) {
            best.set(k, arr);
            open.push({ cell: m.cell, layer: m.layer, iv: j, g: arr, f: arr + m.cost + h(m.cell), parent: n, depart: d });
          }
          break;
        }
      });
    }
  }
  return null;
}

/** Reactive controller: execute intents slot-by-slot, hovering when blocked. */
function simulateReactive(drones: Drone[], from: number, log: LogEntry[]) {
  for (const d of drones) d.path = d.path.filter((s) => s.t <= from);
  const waits: Record<string, number> = {};
  for (let t = from; t < from + MAX_T * 2; t++) {
    const occ = new Map<string, string>();
    const live = drones.filter((d) => { const l = d.path[d.path.length - 1]; return l && l.t === t && l.cell !== d.to; });
    for (const d of live) { const l = d.path[d.path.length - 1]!; occ.set(nodeKey(l.cell, l.layer), d.id); }
    const claimed = new Set<string>();
    for (const d of drones) if (!d.path.length && d.start === t + 1) { /* launches handled below */ }
    for (const d of live) {
      const cur = d.path[d.path.length - 1]!; const nx = d.intent[(cur.i ?? 0) + 1];
      if (!nx) continue;
      const k = nodeKey(nx.cell, nx.layer), o = occ.get(k);
      const blocked = claimed.has(k) || (o && o !== d.id);
      if (blocked && (waits[d.id] ?? 0) < 5) {
        waits[d.id] = (waits[d.id] ?? 0) + 1;
        if (waits[d.id] === 1) log.push({ t, kind: "hold", msg: `${d.id} hovering — ${o ?? "traffic"} ahead` });
        claimed.add(nodeKey(cur.cell, cur.layer));
        d.path.push({ ...cur, t: t + 1 });
      } else {
        if (blocked) log.push({ t, kind: "conflict", msg: `${d.id} forced through after 5 holds` });
        waits[d.id] = 0; claimed.add(k);
        d.path.push({ cell: nx.cell, layer: nx.layer, t: t + 1, i: (cur.i ?? 0) + 1 });
      }
    }
    for (const d of drones) if (!d.path.length && d.start === t + 1) d.path.push({ ...d.intent[0]!, t: t + 1, i: 0 });
    if (t === from) for (const d of drones) if (!d.path.length && d.start === t) d.path.push({ ...d.intent[0]!, t, i: 0 });
  }
}

export type Metrics = { conflicts: number; delay: number; replans: number; arrived: number; ledger: number; planMs: number };

export class Airspace {
  ledger = new Ledger();
  noFly = new Set<string>();
  log: LogEntry[] = [];
  planMs = 0;
  constructor(public controller: Controller) {}

  private plan(d: Drone, s0: State, coordinated: boolean) {
    const t0 = performance.now();
    const p = sipp(coordinated ? this.ledger : null, d.id, s0, d.to, this.noFly);
    this.planMs += performance.now() - t0;
    return p;
  }

  admitAll(drones: Drone[]) {
    for (const d of drones) {
      const s0 = { cell: d.from, layer: d.layer, t: d.start };
      if (this.controller === "hyperhex") {
        const naive = this.plan(d, s0, false);
        const p = this.plan(d, s0, true);
        if (!p) { this.log.push({ t: d.start, kind: "fail", msg: `${d.id} no feasible 4D route — ground hold` }); continue; }
        d.path = p; this.ledger.reservePath(d.id, p);
        const extra = naive ? p.length - naive.length : 0;
        this.log.push({ t: d.start, kind: "plan", msg: `${d.id} reserved ${p.length} slots on L${d.layer}${extra > 0 ? ` (+${extra} to deconflict)` : ""}` });
      } else {
        const p = this.plan(d, s0, false) ?? [s0];
        if (this.controller === "geofence") { d.path = p; this.log.push({ t: d.start, kind: "plan", msg: `${d.id} filed ${p.length}-slot route (no coordination)` }); }
        else d.intent = p.map((s, i) => ({ ...s, i }));
      }
    }
    if (this.controller === "reactive") { for (const d of drones) d.path = []; simulateReactive(drones, 0, this.log); }
    this.logConflicts(drones, 0);
  }

  injectNoFly(center: string, radius: number, drones: Drone[], now: number) {
    const cells = gridDisk(center, radius);
    cells.forEach((c) => this.noFly.add(c));
    this.log.push({ t: now, kind: "nofly", msg: `TFR activated: ${cells.length} cells closed` });
    for (const d of drones) {
      const route = this.controller === "reactive" ? d.intent : d.path;
      const cur = stateAt(d, now) ?? (d.path[0] ? null : { ...route[0]!, t: d.start });
      if (!cur || cur.cell === d.to) continue;
      const ahead = this.controller === "reactive" ? route.slice((cur.i ?? 0) + 1) : route.filter((s) => s.t > now);
      if (!ahead.some((s) => this.noFly.has(s.cell)) || this.noFly.has(cur.cell)) continue;
      d.replans++;
      const s0 = { cell: cur.cell, layer: cur.layer, t: Math.max(now, cur.t) };
      if (this.controller === "hyperhex") {
        this.ledger.release(d.id, s0.t); // local repair: only this aircraft's future voxels
        const p = this.plan(d, s0, true);
        if (!p) { this.log.push({ t: now, kind: "fail", msg: `${d.id} repair failed — holding` }); continue; }
        d.path = [...d.path.filter((s) => s.t < s0.t), ...p];
        this.ledger.reservePath(d.id, p);
      } else {
        const p = this.plan(d, s0, false); if (!p) continue;
        if (this.controller === "geofence") d.path = [...d.path.filter((s) => s.t < s0.t), ...p];
        else { const i = cur.i ?? 0; d.intent = [...d.intent.slice(0, i), ...p.map((s, k) => ({ ...s, i: i + k }))]; }
      }
      this.log.push({ t: now, kind: "replan", msg: `${d.id} rerouted around TFR` });
    }
    if (this.controller === "reactive") simulateReactive(drones, now, this.log);
    this.logConflicts(drones, now);
  }

  conflicts(drones: Drone[]) { return findConflicts(drones); }
  private logConflicts(drones: Drone[], from: number) {
    this.log = this.log.filter((l) => !(l.kind === "conflict" && l.msg.includes("loss of separation") && l.t >= from));
    for (const c of findConflicts(drones)) if (c.t >= from)
      this.log.push({ t: c.t, kind: "conflict", msg: `loss of separation ${c.a} × ${c.b} (${c.type})` });
    this.log.sort((x, y) => x.t - y.t);
  }

  metrics(drones: Drone[]): Metrics {
    let delay = 0, arrived = 0;
    for (const d of drones) {
      const last = d.path[d.path.length - 1];
      if (!last || last.cell !== d.to) continue;
      arrived++; delay += last.t - d.start - gridDistance(d.from, d.to);
    }
    return { conflicts: findConflicts(drones).length, delay, replans: drones.reduce((s, d) => s + d.replans, 0), arrived, ledger: this.ledger.size, planMs: this.planMs };
  }
}

export type Conflict = { t: number; a: string; b: string; cell: string; layer: number; type: "voxel" | "swap" };
export function findConflicts(drones: Drone[]): Conflict[] {
  const at = new Map<string, string>(), out: Conflict[] = [];
  const pos = (d: Drone, t: number) => d.path.find((s) => s.t === t);
  for (const d of drones) for (const s of d.path) {
    if (s.cell === d.to && s !== d.path[d.path.length - 1]) continue;
    const k = `${s.cell}|${s.layer}|${s.t}`, o = at.get(k);
    if (o && o !== d.id) out.push({ t: s.t, a: o, b: d.id, cell: s.cell, layer: s.layer, type: "voxel" }); else at.set(k, d.id);
  }
  for (let i = 0; i < drones.length; i++) for (let j = i + 1; j < drones.length; j++) {
    const A = drones[i]!, B = drones[j]!;
    for (const s of A.path) {
      const b0 = pos(B, s.t), a1 = pos(A, s.t + 1), b1 = pos(B, s.t + 1);
      if (b0 && a1 && b1 && a1.cell === b0.cell && b1.cell === s.cell && a1.layer === b0.layer && b1.layer === s.layer && s.cell !== b0.cell)
        out.push({ t: s.t, a: A.id, b: B.id, cell: s.cell, layer: s.layer, type: "swap" });
    }
  }
  return out;
}

export function stateAt(d: Drone, t: number): State | null {
  if (!d.path.length || t < d.path[0]!.t) return null;
  let last = d.path[0]!;
  for (const s of d.path) { if (s.t > t) break; last = s; }
  return last;
}

const COLORS = ["#f59e0b", "#22d3ee", "#a3e635", "#f472b6", "#fb7185", "#c084fc", "#facc15", "#34d399", "#60a5fa", "#fdba74", "#5eead4", "#e879f9"];
export const cellCenter = (c: string) => { const [lat, lng] = cellToLatLng(c); return { lat, lng }; };

export function buildScenario(controller: Controller = "hyperhex") {
  const center = latLngToCell(ORIGIN.lat, ORIGIN.lng, RES);
  const ring = gridDisk(center, 6).filter((c) => gridDistance(center, c) === 6);
  const n = ring.length;
  const drones: Drone[] = [];
  for (let i = 0; i < 12; i++) {
    const a = Math.floor((i * n) / 12 + (i % 3)) % n, b = (a + Math.floor(n / 2) + ((i * 5) % 7) - 3 + n) % n;
    const pa = cellCenter(ring[a]!), pb = cellCenter(ring[b]!);
    const bearing = (Math.atan2(pb.lng - pa.lng, pb.lat - pa.lat) * 180) / Math.PI + 180; // 0..360
    drones.push({ id: `UAV-${String(i + 1).padStart(2, "0")}`, color: COLORS[i]!, from: ring[a]!, to: ring[b]!, start: Math.floor(i * 1.5),
      layer: Math.floor(bearing / 120) % LAYERS.length, path: [], intent: [], replans: 0 });
  }
  const air = new Airspace(controller);
  air.admitAll(drones);
  return { air, drones, center };
}

/** Headless run of the same scenario with a TFR at `tfrAt`, for controller comparison. */
export function benchmark(tfrAt = 8): Record<Controller, Metrics> {
  const out = {} as Record<Controller, Metrics>;
  for (const c of CONTROLLERS) {
    const s = buildScenario(c.id);
    s.air.injectNoFly(s.center, 1, s.drones, tfrAt);
    out[c.id] = s.air.metrics(s.drones);
  }
  return out;
}
