import { describe, expect, it } from "vitest";
import { flattenOverlay, spawnOptions } from "./overlay";
import type { MapOverlay } from "./types";

describe("map overlays", () => {
  it("classifies loot and rotates insert contents using renderer radians", () => {
    const overlay: MapOverlay = {
      schemaVersion: 1,
      mapPath: "/Maps/test.yml",
      prototypes: {
        Insert: { name: "room", kind: "insert", components: { MapInsert: { variations: [{ spawn: "/Maps/room.yml", probability: 0.5 }] } } },
        Loot: { name: "supplies", kind: "spawner", components: { RandomSpawner: { chance: 0.25, prototypes: ["Medkit", "Ammo"] } } },
      },
      occurrences: { Insert: [[10, 20, Math.PI / 2]], Loot: [[2, 3]] },
      insertMaps: { "/Maps/room.yml": { occurrences: { Loot: [[4, 0]] } } },
    };
    const points = flattenOverlay(overlay);
    expect(points.find((point) => point.key === "map:Loot:0")?.category).toBe("loot");
    const inserted = points.find((point) => point.insertPath);
    expect(inserted?.x).toBeCloseTo(10);
    expect(inserted?.y).toBeCloseTo(24);
    expect(inserted?.probability).toBe(0.5);
    expect(spawnOptions(points.find((point) => point.key === "map:Loot:0")!)).toEqual(["Ammo", "Medkit"]);
  });
});
