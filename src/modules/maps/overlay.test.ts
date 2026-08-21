import { describe, expect, it } from "vitest";
import { areaAt, flattenOverlay, pointDisplayName, spawnOptions } from "./overlay";
import type { MapOverlay, OverlayPoint } from "./types";

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

  it("reads compact area runs at tile coordinates", () => {
    const overlay: MapOverlay = {
      schemaVersion: 2,
      mapPath: "/Maps/test.yml",
      prototypes: {},
      occurrences: {},
      insertMaps: {},
      areas: {
        types: [["RMCAreaMedical", "Medical", 129]],
        rows: [[-2, 10, 3, 0]],
      },
    };

    expect(areaAt(overlay, { x: 11.9, y: -1.1 })).toEqual({
      prototypeId: "RMCAreaMedical",
      name: "Medical",
      supportMask: 129,
    });
    expect(areaAt(overlay, { x: 13, y: -1.1 })).toBeUndefined();
  });

  it("translates technical markers but keeps map labels unchanged", () => {
    const point: OverlayPoint = {
      key: "marker",
      prototypeId: "RMCBlockerVehicle",
      name: "vehicle blocker",
      category: "marker",
      x: 0,
      y: 0,
      rotation: 0,
    };

    expect(pointDisplayName(point)).toBe("Ограничитель транспорта");
    expect(pointDisplayName({ ...point, label: "Aurora Medical Clinic" })).toBe("Aurora Medical Clinic");
  });
});
