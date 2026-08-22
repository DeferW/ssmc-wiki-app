import { describe, expect, it } from "vitest";
import { activeInsertPlacements, areaAt, describeComponents, flattenOverlay, pointDisplayName, pointProbabilityDescriptions, spawnOptions } from "./overlay";
import type { MapOverlay, OverlayPoint } from "./types";

describe("map overlays", () => {
  it("shows only the selected insert and mirrors the game's integer offset", () => {
    const overlay: MapOverlay = {
      schemaVersion: 1,
      mapPath: "/Maps/test.yml",
      prototypes: {
        Insert: { name: "room", kind: "insert", components: { MapInsert: { variations: [{ spawn: "/Maps/room.yml", probability: 0.5, offset: "2,-1" }] } } },
        Loot: { name: "supplies", kind: "spawner", components: { RandomSpawner: { chance: 0.25, prototypes: ["Medkit", "Ammo"] } } },
      },
      occurrences: { Insert: [[10, 20, Math.PI / 2]], Loot: [[2, 3]] },
      insertMaps: { "/Maps/room.yml": { occurrences: { Loot: [[4, 0]] }, tiles: "inserts/room/tiles.json" } },
    };
    expect(flattenOverlay(overlay).some((point) => point.insertPath)).toBe(false);
    const points = flattenOverlay(overlay, { "map:Insert:0": "/Maps/room.yml" });
    expect(points.find((point) => point.key === "map:Loot:0")?.category).toBe("loot");
    const inserted = points.find((point) => point.insertPath);
    expect(inserted?.x).toBe(15);
    expect(inserted?.y).toBe(18);
    expect(inserted?.probability).toBe(0.5);
    expect(spawnOptions(points.find((point) => point.key === "map:Loot:0")!)).toEqual(["Ammo", "Medkit"]);
    expect(describeComponents(points.find((point) => point.key === "map:Loot:0")!)).toContain("Случайный спавнер · шанс 25% · 2 варианта");
    expect(activeInsertPlacements(overlay, points, { "map:Insert:0": "/Maps/room.yml" })).toEqual([{
      key: "map:Insert:0",
      path: "/Maps/room.yml",
      origin: { x: 11, y: 18 },
      tiles: "inserts/room/tiles.json",
      clearEntities: false,
      clearDecals: false,
      replaceAreas: false,
    }]);
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
      group: "misc-boundaries",
      x: 0,
      y: 0,
      rotation: 0,
    };

    expect(pointDisplayName(point)).toBe("Ограничитель транспорта");
    expect(pointDisplayName({ ...point, label: "Aurora Medical Clinic" })).toBe("Aurora Medical Clinic");
  });

  it("calculates grouped communication tower probability", () => {
    const tower: OverlayPoint = {
      key: "tower:1",
      prototypeId: "RMCSpawnerCommunicationsTowerOne",
      name: "static comms",
      category: "marker",
      group: "misc-other",
      x: 0,
      y: 0,
      rotation: 0,
      components: { CommunicationsTowerSpawner: { group: "tower-a" } },
    };

    expect(pointProbabilityDescriptions(tower, [tower, { ...tower, key: "tower:2" }])).toEqual([
      "Вероятность появления вышки: 50%",
    ]);
  });

  it("translates objective landmarks as intelligence markers", () => {
    const overlay: MapOverlay = {
      schemaVersion: 3,
      mapPath: "/Maps/test.yml",
      prototypes: {
        RMCSpawnerIntelClose: {
          name: "objective landmark close",
          kind: "spawner",
          components: { IntelSpawner: { chance: 0.35 } },
        },
      },
      occurrences: { RMCSpawnerIntelClose: [[1, 2]] },
      insertMaps: {},
    };
    const [point] = flattenOverlay(overlay);
    expect(pointDisplayName(point)).toBe("Случайные разведданные — ближняя зона");
    expect(point.category).toBe("loot");
    expect(point.group).toBe("loot-intel");
  });
});
