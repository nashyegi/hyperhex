// Seeded experiment support for HyperHex (E2 density sweep, E5 timing/ledger scaling).
// Does not change engine behaviour: it builds scenarios from the exported engine API and,
// for HyperHex, replays Airspace.admitAll's coordinated admission with a clean timer.
import { latLngToCell, gridDisk, gridDistance, cellToLatLng } from "h3-js";
import {
  Airspace,
  sipp,
  findConflicts,
  stateAt,
  type RepairMode,
  LAYERS,
  LAYER_H,
  ORIGIN,
  RES,
  type Controller,
  type Drone,
  type EngineConfig,
} from "./hyperhex";

/** mulberry32: small, well-known 32-bit seeded PRNG (deterministic across JS runtimes). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RandomScenarioConfig = {
  fleet: number; // number of transit drones (no stack-demo drones are added)
  seed: number;
  diskRadius: number; // O/D cells drawn uniformly from the H3 disk of this radius around ORIGIN
  minOD: number; // minimum H3 grid distance between origin and destination
  departWindow: number; // departures uniform on integer slots [0, departWindow)
  excludeRadius: number; // O/D never drawn within this H3 distance of the closure centre (-1 = no exclusion)
  res?: number; // H3 resolution of the scenario (default RES = 9)
};
// excludeRadius 1 = the radius-1 closure footprint: a drone whose origin or destination is itself closed
// cannot be repaired by any controller, so the main sweep keeps O/D outside it (stress variant uses -1).
export const DEFAULT_RANDOM: Omit<RandomScenarioConfig, "fleet" | "seed"> = {
  diskRadius: 7,
  minOD: 5,
  departWindow: 30,
  excludeRadius: 1,
};

/** Seeded random demand: uniform O/D in the disk (rejection on minOD), uniform departure slot, uniform layer. */
export function randomDrones(cfg: RandomScenarioConfig): Drone[] {
  const rnd = mulberry32(cfg.seed);
  const center = latLngToCell(ORIGIN.lat, ORIGIN.lng, cfg.res ?? RES);
  const cells = gridDisk(center, cfg.diskRadius)
    .filter((c) => gridDistance(center, c) > cfg.excludeRadius)
    .sort(); // sort => order independent of h3-js internals
  const pick = () => cells[Math.floor(rnd() * cells.length)]!;
  const drones: Drone[] = [];
  for (let i = 0; i < cfg.fleet; i++) {
    let from = pick(),
      to = pick();
    while (gridDistance(from, to) < cfg.minOD) {
      from = pick();
      to = pick();
    }
    drones.push({
      id: `R-${String(i + 1).padStart(3, "0")}`,
      color: "#999",
      from,
      to,
      start: Math.floor(rnd() * cfg.departWindow),
      layer: Math.floor(rnd() * LAYERS.length),
      path: [],
      intent: [],
      replans: 0,
    });
  }
  return drones;
}

export type RunResult = {
  controller: Controller;
  fleet: number;
  seed: number;
  conflicts: number;
  voxelConflicts: number;
  swapConflicts: number;
  arrived: number;
  nonArrived: number;
  groundHolds: number;
  repairFailures: number;
  delaySlots: number;
  delayPerArrivalSec: number;
  replans: number;
  ledgerNodeIntervals: number;
  ledgerEdgeIntervals: number;
  admitMsPerDrone: number | null; // HyperHex only: coordinated SIPP calls at admission, excludes reference call
  repairMsTotal: number | null; // HyperHex only: coordinated SIPP calls during closure repair
  horizonSlots: number; // last slot of any stored trajectory
  noFlyIncursions: number; // stored states inside a closed cell at a slot after the closure time
  dronesEnteringNoFly: number; // distinct drones with >= 1 such state
  conflictsInvolvingFailedRepair: number; // conflicts where >= 1 party's coordinated repair failed
  // --- closure-handling metrics (E4) ---
  repairMode: RepairMode;
  fallback: boolean;
  insideAtActivation: number; // airborne drones inside a closed cell at the activation slot
  dronesEnteringNoFlyExclInside: number; // drones with a post-activation state in a closed cell that were NOT inside at activation
  stateSlotsInsideAfterActivation: number; // total post-activation slots spent inside closed cells (all drones)
  diverted: number; // contingency landings at an open cell (fallback)
  cancelled: number; // cancelled before departure (fallback)
  evacuated: number; // drones routed out of a closed cell
  unresolved: number; // no reservable exit/landing found (fallback last resort)
  disrupted: number; // drones whose post-activation trajectory changed
  // --- resolution / timing realism (E7) ---
  res: number;
  slotSec: number;
  bufferSlots: number;
};

export type RunOptions = {
  closure: { at: number; radius: number } | null;
  mode?: RepairMode; // HyperHex: "local" (default) or "global" full-fleet replan
  fallback?: boolean; // HyperHex: safe fallback + evacuation (default true = engine default)
  order?: AdmissionOrder; // admission (and repair) order; default "generated"
  inspect?: (drones: Drone[], air: Airspace) => void; // called after metrics, e.g. for separation checks
  engine?: Partial<EngineConfig>; // slot length, horizon, search budget, reservation buffer
};

/**
 * Admission order (E3). Planning is sequential, so order sets priority.
 *   generated: order produced by the demand generator (i.e. random w.r.t. geometry and time)
 *   fifo:      earliest scheduled departure first (ties: generated order)
 *   longest:   largest origin-destination grid distance first; shortest: smallest first
 *   random:<k>: seeded random permutation k
 */
export type AdmissionOrder = "generated" | "fifo" | "longest" | "shortest" | `random:${number}`;
export function applyOrder(drones: Drone[], order: AdmissionOrder, seed: number): Drone[] {
  const idx = drones.map((d, i) => ({ d, i, len: gridDistance(d.from, d.to) }));
  if (order === "fifo") idx.sort((a, b) => a.d.start - b.d.start || a.i - b.i);
  else if (order === "longest")
    idx.sort((a, b) => b.len - a.len || a.d.start - b.d.start || a.i - b.i);
  else if (order === "shortest")
    idx.sort((a, b) => a.len - b.len || a.d.start - b.d.start || a.i - b.i);
  else if (order.startsWith("random:")) {
    const rnd = mulberry32(seed * 7919 + Number(order.slice(7)) * 104729);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
  }
  return idx.map((x) => x.d);
}

/** Run one controller on one seeded scenario. */
export function runRandom(
  controller: Controller,
  cfg: RandomScenarioConfig,
  opt: RunOptions,
): RunResult {
  const drones = applyOrder(randomDrones(cfg), opt.order ?? "generated", cfg.seed);
  const center = latLngToCell(ORIGIN.lat, ORIGIN.lng, cfg.res ?? RES);
  const air = new Airspace(controller, opt.engine);
  let admitMs: number | null = null;
  if (controller === "hyperhex") {
    // Same coordinated admission as Airspace.admitAll (sequential, generated order, ground hold on failure),
    // minus the uncoordinated reference plan that admitAll computes only for its log message.
    admitMs = 0;
    for (const d of drones) {
      const s0 = { cell: d.from, layer: d.layer, t: d.start };
      const t0 = performance.now();
      const p = sipp(air.ledger, d.id, s0, d.to, air.noFly, air.cfg);
      admitMs += performance.now() - t0;
      if (!p) {
        air.log.push({
          t: d.start,
          kind: "fail",
          msg: `${d.id} no feasible 4D route — ground hold`,
        });
        continue;
      }
      d.path = p;
      air.ledger.reservePath(d.id, p);
    }
  } else {
    air.admitAll(drones);
  }
  air.planMs = 0; // from here planMs counts only repair planning (coordinated calls for HyperHex)
  const mode: RepairMode = opt.mode ?? "local";
  if (opt.fallback !== undefined) air.fallback = opt.fallback;
  const inside = new Set<string>();
  const before = new Map<string, string>();
  if (opt.closure) {
    const at = opt.closure.at;
    const closed = new Set(gridDisk(center, opt.closure.radius));
    for (const d of drones) {
      const cur = stateAt(d, at);
      if (cur && d.path[0]!.t < at && d.path[d.path.length - 1]!.t > at && closed.has(cur.cell))
        inside.add(d.id);
      before.set(d.id, JSON.stringify(d.path.filter((x) => x.t > at)));
    }
    air.injectNoFly(center, opt.closure.radius, drones, at, mode);
  }
  const m = air.metrics(drones);
  const cs = findConflicts(drones);
  opt.inspect?.(drones, air);
  let ledgerEdges = 0;
  for (const a of air.ledger.edges.values()) ledgerEdges += a.length;
  const groundHolds = air.log.filter(
    (l) => l.kind === "fail" && l.msg.includes("ground hold"),
  ).length;
  const repairFailures = air.log.filter(
    (l) => l.kind === "fail" && l.msg.includes("repair failed"),
  ).length;
  const failedIds = new Set(
    air.log
      .filter((l) => l.kind === "fail" && l.msg.includes("repair failed"))
      .map((l) => l.msg.split(" ")[0]!),
  );
  let incursions = 0;
  const entering = new Set<string>();
  if (opt.closure)
    for (const d of drones)
      for (const s of d.path)
        if (s.t > opt.closure.at && air.noFly.has(s.cell)) {
          incursions++;
          entering.add(d.id);
        }
  let slotsInside = 0;
  const enteringExcl = new Set<string>();
  if (opt.closure)
    for (const d of drones)
      for (const x of d.path)
        if (x.t > opt.closure.at && air.noFly.has(x.cell)) {
          slotsInside++;
          if (!inside.has(d.id)) enteringExcl.add(d.id);
        }
  const disrupted = opt.closure
    ? drones.filter(
        (d) => before.get(d.id) !== JSON.stringify(d.path.filter((x) => x.t > opt.closure!.at)),
      ).length
    : 0;
  let horizon = 0;
  for (const d of drones) for (const s of d.path) horizon = Math.max(horizon, s.t);
  return {
    controller,
    fleet: cfg.fleet,
    seed: cfg.seed,
    conflicts: m.conflicts,
    voxelConflicts: cs.filter((c) => c.type === "voxel").length,
    swapConflicts: cs.filter((c) => c.type === "swap").length,
    arrived: m.arrived,
    nonArrived: cfg.fleet - m.arrived,
    groundHolds,
    repairFailures,
    delaySlots: m.delay,
    delayPerArrivalSec: m.arrived ? (m.delay * air.cfg.slotSec) / m.arrived : 0,
    replans: m.replans,
    ledgerNodeIntervals: m.ledger,
    ledgerEdgeIntervals: ledgerEdges,
    admitMsPerDrone: admitMs === null ? null : admitMs / cfg.fleet,
    repairMsTotal: controller === "hyperhex" ? air.planMs : null,
    horizonSlots: horizon,
    noFlyIncursions: incursions,
    dronesEnteringNoFly: entering.size,
    conflictsInvolvingFailedRepair: cs.filter((c) => failedIds.has(c.a) || failedIds.has(c.b))
      .length,
    repairMode: mode,
    fallback: air.fallback,
    insideAtActivation: inside.size,
    dronesEnteringNoFlyExclInside: enteringExcl.size,
    stateSlotsInsideAfterActivation: slotsInside,
    diverted: m.diverted,
    cancelled: m.cancelled,
    evacuated: m.evacuated,
    unresolved: air.log.filter((l) => l.kind === "fail" && l.msg.includes("UNRESOLVED")).length,
    disrupted,
    res: cfg.res ?? RES,
    slotSec: air.cfg.slotSec,
    bufferSlots: air.cfg.bufferSlots,
  };
}

/** Equivalence check: clean-timed admission must yield exactly the paths Airspace.admitAll yields. */
export function admissionMatchesEngine(cfg: RandomScenarioConfig): boolean {
  const a = randomDrones(cfg),
    b = randomDrones(cfg);
  const airA = new Airspace("hyperhex");
  airA.admitAll(a);
  const airB = new Airspace("hyperhex");
  for (const d of b) {
    const p = sipp(
      airB.ledger,
      d.id,
      { cell: d.from, layer: d.layer, t: d.start },
      d.to,
      airB.noFly,
    );
    if (p) {
      d.path = p;
      airB.ledger.reservePath(d.id, p);
    }
  }
  return JSON.stringify(a.map((d) => d.path)) === JSON.stringify(b.map((d) => d.path));
}

// ---------------------------------------------------------------------------------------------
// E6: continuous-time separation check.
// Positions are linearly interpolated between consecutive slot states (the same motion the
// workbench renders): horizontal between H3 cell centres, vertical between layer mid-heights.
// A drone is present from its first to its last stored state (it leaves the airspace after
// arriving or landing). Horizontal distances use a local equirectangular projection.

export type SeparationResult = {
  samplesPerSlot: number;
  minHorizontalWhenVerticalBelow: number | null; // metres, over pairs with vertical gap < vThreshold
  minVerticalWhenHorizontalBelow: number | null; // metres, over pairs with horizontal gap < hTight
  losPairs: Record<string, number>; // "h<vThreshold" key -> unique drone pairs with a loss of separation
  losPairsMissedByDiscrete: Record<string, number>; // of those, pairs with no discrete voxel/swap conflict
  discretePairs: number; // exact discrete conflict pairs (voxel sharing or swap)
  detectorPairs: number; // unique pairs reported by the engine's findConflicts
  losPairsWithLayerChange: Record<string, number>; // of those, pairs where a drone changed layer at closest approach
};

const flyingOf = (drones: Drone[]) => drones.filter((d) => d.path.length > 0);

/** All drone pairs that share a voxel or swap nodes in the discrete model (see continuousSeparation). */
export function exactDiscretePairs(drones: Drone[]): Set<string> {
  const pairs = new Set<string>();
  const vox = new Map<string, string[]>();
  const moves = new Map<string, string[]>();
  for (const d of drones)
    d.path.forEach((x, i) => {
      if (x.cell === d.to && i !== d.path.length - 1) return; // mirrors findConflicts' destination rule
      const k = `${x.cell}|${x.layer}|${x.t}`;
      vox.set(k, [...(vox.get(k) ?? []), d.id]);
      const y = d.path[i + 1];
      if (y && (y.cell !== x.cell || y.layer !== x.layer)) {
        const mk = `${x.cell}|${x.layer}>${y.cell}|${y.layer}@${x.t}`;
        moves.set(mk, [...(moves.get(mk) ?? []), d.id]);
      }
    });
  for (const ids of vox.values())
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) pairs.add([ids[i], ids[j]].sort().join("|"));
  for (const [mk, ids] of moves) {
    const [from, rest] = mk.split(">");
    const [to, t] = rest!.split("@");
    for (const o of moves.get(`${to}>${from}@${t}`) ?? [])
      for (const id of ids) if (id !== o) pairs.add([id, o].sort().join("|"));
  }
  return pairs;
}

export function continuousSeparation(
  drones: Drone[],
  opts: {
    samplesPerSlot?: number;
    hThresholds?: number[];
    vThreshold?: number;
    hTight?: number;
  } = {},
): SeparationResult {
  const S = opts.samplesPerSlot ?? 8;
  const H = opts.hThresholds ?? [50, 100, 150, 200];
  const V = opts.vThreshold ?? 30;
  const hTight = opts.hTight ?? 50;
  const R = 6371008.8,
    rad = Math.PI / 180,
    k = Math.cos(ORIGIN.lat * rad);
  const xy = new Map<string, [number, number]>();
  const at = (cell: string) => {
    let v = xy.get(cell);
    if (!v) {
      const [la, ln] = cellToLatLng(cell);
      v = [(ln - ORIGIN.lng) * rad * R * k, (la - ORIGIN.lat) * rad * R];
      xy.set(cell, v);
    }
    return v;
  };
  const z = (l: number) => (LAYERS[l] ?? 0) + LAYER_H / 2;
  const flying = flyingOf(drones);
  let tMin = Infinity,
    tMax = -Infinity;
  for (const d of flying) {
    tMin = Math.min(tMin, d.path[0]!.t);
    tMax = Math.max(tMax, d.path[d.path.length - 1]!.t);
  }
  // Exact discrete pairs: every pair sharing a (cell, layer, slot) voxel or swapping nodes (horizontal or
  // vertical) between consecutive slots. findConflicts reports each shared voxel only against its first
  // occupant and only horizontal swaps, so it can under-count pairs; this set does not.
  const discretePairs = exactDiscretePairs(flyingOf(drones));
  const los = H.map(() => new Set<string>());
  const losLayer = H.map(() => new Set<string>());
  let minH: number | null = null,
    minV: number | null = null;
  for (let step = tMin * S; step <= tMax * S; step++) {
    const tau = step / S;
    const pos: { id: string; x: number; y: number; z: number; climbing: boolean }[] = [];
    for (const d of flying) {
      const p0 = d.path[0]!,
        pn = d.path[d.path.length - 1]!;
      if (tau < p0.t || tau > pn.t) continue;
      const i = Math.min(Math.floor(tau) - p0.t, d.path.length - 1);
      const a = d.path[i]!,
        b = d.path[Math.min(i + 1, d.path.length - 1)]!;
      const f = b === a ? 0 : tau - a.t;
      const [ax, ay] = at(a.cell),
        [bx, by] = at(b.cell);
      pos.push({
        id: d.id,
        x: ax + (bx - ax) * f,
        y: ay + (by - ay) * f,
        z: z(a.layer) + (z(b.layer) - z(a.layer)) * f,
        climbing: a.layer !== b.layer && f > 0,
      });
    }
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const A = pos[i]!,
          B = pos[j]!;
        const dz = Math.abs(A.z - B.z);
        const dh = Math.hypot(A.x - B.x, A.y - B.y);
        if (dz < V && (minH === null || dh < minH)) minH = dh;
        if (dh < hTight && (minV === null || dz < minV)) minV = dz;
        if (dz < V)
          H.forEach((h, q) => {
            if (dh < h) {
              const key = [A.id, B.id].sort().join("|");
              los[q]!.add(key);
              if (A.climbing || B.climbing) losLayer[q]!.add(key);
            }
          });
      }
  }
  const rec = (f: (q: number) => number) =>
    Object.fromEntries(H.map((h, q) => [`h<${h}m,v<${V}m`, f(q)]));
  return {
    samplesPerSlot: S,
    minHorizontalWhenVerticalBelow: minH,
    minVerticalWhenHorizontalBelow: minV,
    losPairs: rec((q) => los[q]!.size),
    losPairsMissedByDiscrete: rec((q) => [...los[q]!].filter((p) => !discretePairs.has(p)).length),
    discretePairs: discretePairs.size,
    detectorPairs: new Set(findConflicts(drones).map((c) => [c.a, c.b].sort().join("|"))).size,
    losPairsWithLayerChange: rec((q) => losLayer[q]!.size),
  };
}
