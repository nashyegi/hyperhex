import { describe, expect, it } from "vitest";
import { gridDisk, latLngToCell } from "h3-js";
import { continuousSeparation, runRandom } from "@/lib/experiments";
import { Ledger, ORIGIN, sipp } from "@/lib/hyperhex";

describe("temporal reservation buffer", () => {
  const c = latLngToCell(ORIGIN.lat, ORIGIN.lng, 10);
  const [a, b] = gridDisk(c, 1).filter((x) => x !== c);

  it("blocks entering a node in the slot after another drone left it (buffer 1 only)", () => {
    for (const buffer of [0, 1]) {
      const ledger = new Ledger(buffer);
      ledger.reservePath("A", [
        { cell: c, layer: 0, t: 5 },
        { cell: a!, layer: 0, t: 6 },
      ]);
      const free = ledger.safeIntervals("B", `${c}|0`).some(([lo, hi]) => 6 >= lo && 6 <= hi);
      expect(free).toBe(buffer === 0);
    }
  });

  it("plans around buffered reservations", () => {
    const ledger = new Ledger(1);
    ledger.reservePath("A", [
      { cell: c, layer: 0, t: 0 },
      ...[1, 2, 3].map((t) => ({ cell: c, layer: 0, t })),
    ]);
    const p = sipp(ledger, "B", { cell: b!, layer: 0, t: 0 }, c, new Set(), { maxT: 30 });
    expect(p).not.toBeNull();
    // A holds (c, layer 0) over slots 0-3; with the buffer, B may not be there during slots -1..4
    expect(p!.some((x) => x.cell === c && x.layer === 0 && x.t <= 4)).toBe(false);
  });

  it("realistic setting keeps continuous-time separation above the stated guarantee", () => {
    const r10 = { diskRadius: 19, minOD: 13, departWindow: 15, excludeRadius: 4, res: 10 };
    for (const seed of [1000, 1001]) {
      let minH: number | null = null;
      const r = runRandom(
        "hyperhex",
        { ...r10, fleet: 72, seed },
        {
          closure: { at: 4, radius: 4 },
          engine: {
            slotSec: 8,
            bufferSlots: 1,
            maxWait: 15,
            maxExpansions: 60000,
            contingencyHorizon: 30,
          },
          inspect: (d) => (minH = continuousSeparation(d).minHorizontalWhenVerticalBelow),
        },
      );
      expect(r.conflicts).toBe(0);
      expect(minH!).toBeGreaterThanOrEqual(114.6); // guarantee 114.7 m (scripts/e7-bound.ts)
    }
  });
});
