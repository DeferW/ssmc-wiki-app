import { describe, expect, it } from "vitest";
import { isRoofTier, roofTier, roofTierBands } from "./areaSupport";
import type { InsertPlacement, MapOverlay } from "./types";

const ALL = 0b1_1111_1111;
const without = (...bits: number[]) => bits.reduce((mask, bit) => mask & ~(1 << bit), ALL);

function overlay(): MapOverlay {
  return {
    schemaVersion: 6,
    mapPath: "/Maps/test.yml",
    prototypes: {},
    occurrences: {},
    insertMaps: {
      "/Maps/room.yml": {
        occurrences: {},
        areas: { types: [["Bunker", "Bunker", without(7, 0, 4)]], rows: [[0, 0, 1, 0]] },
      },
    },
    areas: {
      types: [["Sky", "Sky", ALL], ["Hall", "Hall", without(2)], ["Hangar", "Hangar", without(0)]],
      // y=0: 0..1 sky, 2..3 hall, 4 hangar; y=1: 0..1 hall
      rows: [[0, 0, 2, 0, 2, 2, 1, 4, 1, 2], [1, 0, 2, 1]],
    },
  };
}

const insert = (replaceAreas: boolean): InsertPlacement => ({
  key: "anchor", path: "/Maps/room.yml", origin: { x: 1, y: 0 }, tiles: "", clearEntities: false, clearDecals: false, replaceAreas,
});

describe("roof tiers", () => {
  it("names each tier after the strongest support it blocks", () => {
    expect(roofTier(ALL)).toBe(0);
    expect(roofTier(without(5))).toBe(1);
    expect(roofTier(without(5, 8))).toBe(2);
    expect(roofTier(without(0))).toBe(3);
    expect(roofTier(without(7))).toBe(4);
  });

  it("merges neighbouring tiles of one tier into runs and leaves open sky empty", () => {
    const bands = roofTierBands(overlay(), []);
    expect(bands.map((band) => band.runs)).toEqual([
      [[2, 0, 2], [0, 1, 2]],
      [],
      [[4, 0, 1]],
      [],
    ]);
    expect(bands.map((band) => band.tiles)).toEqual([4, 0, 1, 0]);
  });

  it("lets a selected insert replace areas only when the game does", () => {
    expect(roofTierBands(overlay(), [insert(false)])[3].runs).toEqual([]);
    expect(roofTierBands(overlay(), [insert(true)])[3].runs).toEqual([[1, 0, 1]]);
  });

  it("accepts only known persisted tiers", () => {
    expect(isRoofTier(4)).toBe(true);
    expect(isRoofTier(0)).toBe(false);
    expect(isRoofTier("1")).toBe(false);
  });
});
