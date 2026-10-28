import { describe, expect, it } from "vitest";
import { runRandom, DEFAULT_RANDOM } from "@/lib/experiments";
import { buildScenario } from "@/lib/hyperhex";

describe("HyperHex closure handling with safe fallback", () => {
  it("keeps the built-in 12-drone benchmark unchanged", () => {
    const s = buildScenario("hyperhex", 12, { id: "default", label: "Default", res: 9, engine: { slotSec: 4, bufferSlots: 0 } });
    s.air.injectNoFly(s.center, 1, s.drones, 8);
    const m = s.air.metrics(s.drones);
    expect({
      conflicts: m.conflicts,
      delay: m.delay,
      arrived: m.arrived,
      ledger: m.ledger,
    }).toEqual({
      conflicts: 0,
      delay: 3,
      arrived: 15,
      ledger: 195,
    });
  });

  for (const mode of ["local", "global"] as const)
    it(`${mode}: no conflicts and no new closure entries when endpoints may lie in the closure`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const r = runRandom(
          "hyperhex",
          { ...DEFAULT_RANDOM, fleet: 48, seed, excludeRadius: -1 },
          { closure: { at: 10, radius: 2 }, mode, fallback: true },
        );
        expect(r.conflicts).toBe(0);
        expect(r.dronesEnteringNoFlyExclInside).toBe(0);
        expect(r.evacuated).toBe(r.insideAtActivation);
        expect(r.unresolved).toBe(0);
      }
    });

  it("resolves a drone boxed in at its evacuation exit with a combined exit-and-land search", () => {
    // E4 case at the realistic setting (res 10, 8-s slots, one-slot buffer): 96 drones, seed 2004,
    // 9-ring closure at slot 10. The two-stage evacuate-then-land plan used to leave one drone unresolved.
    const r = runRandom(
      "hyperhex",
      {
        ...DEFAULT_RANDOM,
        res: 10,
        diskRadius: 19,
        minOD: 13,
        departWindow: 15,
        excludeRadius: 9,
        fleet: 96,
        seed: 2004,
      },
      {
        closure: { at: 10, radius: 9 },
        mode: "local",
        fallback: true,
        engine: {
          slotSec: 8,
          bufferSlots: 1,
          maxT: 90,
          maxWait: 15,
          maxExpansions: 60000,
          contingencyHorizon: 30,
        },
      },
    );
    expect({ unresolved: r.unresolved, conflicts: r.conflicts, diverted: r.diverted }).toEqual({
      unresolved: 0,
      conflicts: 0,
      diverted: 1,
    });
  });
});
