import { describe, expect, it } from "vitest";
import { activeInsertPlacements, areaAt, describeComponents, effectiveInsertProbability, flattenOverlay, pointDisplayName, pointProbabilityDescriptions, pointsOnSameTile, restoreInsertSelections, serializeInsertSelections, spawnOptions } from "./overlay";
import type { MapOverlay, OverlayPoint } from "./types";

describe("map overlays", () => {
  it("returns every marker occupying the same game tile", () => {
    const marker = (key: string, x: number, y: number): OverlayPoint => ({
      key,
      prototypeId: key,
      name: key,
      category: "insert",
      group: "misc-other",
      x,
      y,
      rotation: 0,
    });
    const points = [marker("raid", 95.5, 63.5), marker("panic", 95.5, 63.5), marker("south", 3.5, 110.5)];

    expect(pointsOnSameTile(points, points[0]).map((point) => point.key)).toEqual(["raid", "panic"]);
  });

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

  it("replaces markers only on occupied tiles of an active insert", () => {
    const overlay: MapOverlay = {
      schemaVersion: 4,
      mapPath: "/Maps/test.yml",
      prototypes: {
        Insert: { name: "room", kind: "insert", components: { MapInsert: { clearEntities: true, variations: [{ spawn: "/Maps/room.yml" }] } } },
        Base: { name: "base", kind: "spawner", components: { RandomSpawner: {} } },
        Added: { name: "added", kind: "spawner", components: { RandomSpawner: {} } },
      },
      occurrences: { Insert: [[10.5, 20.5]], Base: [[10.5, 20.5], [11.5, 20.5]] },
      insertMaps: {
        "/Maps/room.yml": {
          occurrences: { Added: [[0.5, 0.5]] },
          footprint: { rows: [[0, 0, 1]] },
        },
      },
    };

    const points = flattenOverlay(overlay, { "map:Insert:0": "/Maps/room.yml" });

    expect(points.filter((point) => point.prototypeId === "Base").map((point) => point.x)).toEqual([11.5]);
    expect(points.some((point) => point.prototypeId === "Added" && point.x === 10.5)).toBe(true);
    expect(points.some((point) => point.prototypeId === "Insert")).toBe(true);
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

  it("keeps plain editor markers in the service group", () => {
    const overlay: MapOverlay = {
      schemaVersion: 4,
      mapPath: "/Maps/test.yml",
      prototypes: {
        RMCBlockerVehicle: { name: "vehicle blocker", kind: "marker" },
      },
      occurrences: { RMCBlockerVehicle: [[1.5, 2.5]] },
      insertMaps: {},
    };

    expect(flattenOverlay(overlay)[0].group).toBe("misc-other");
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

  it("classifies survivor SpawnPoint prototypes as spawn markers", () => {
    const overlay: MapOverlay = {
      schemaVersion: 4,
      mapPath: "/Maps/test.yml",
      prototypes: {
        RMCSpawnPointSurvivor: {
          name: "survivor",
          kind: "spawner",
          components: { SpawnPoint: { job_id: "CMSurvivor" } },
        },
      },
      occurrences: { RMCSpawnPointSurvivor: [[1.5, 2.5]] },
      insertMaps: {},
    };

    const [point] = flattenOverlay(overlay);
    expect(point.category).toBe("spawn");
    expect(pointDisplayName(point)).toBe("Точка появления выжившего");
  });

  it("does not mistake the Operator role name for a rat marker", () => {
    const overlay: MapOverlay = {
      schemaVersion: 6,
      mapPath: "/Maps/test.yml",
      prototypes: {
        CMSpawnPointSmartGunOperator: {
          name: "smart gun operator",
          kind: "spawner",
          components: { SpawnPoint: { job_id: "CMSmartGunOperator" } },
        },
      },
      occurrences: { CMSpawnPointSmartGunOperator: [[1.5, 2.5]] },
      insertMaps: {},
    };

    const [point] = flattenOverlay(overlay);
    expect(point.category).toBe("spawn");
    expect(point.group).toBe("misc-spawns");
  });

  it("puts the AEGIS crate spawner into supplies instead of service markers", () => {
    const overlay: MapOverlay = {
      schemaVersion: 6,
      mapPath: "/Maps/test.yml",
      prototypes: {
        RMCAegisSpawner: {
          name: "AEGIS crate spawner",
          kind: "spawner",
          components: { AegisSpawner: {} },
        },
      },
      occurrences: { RMCAegisSpawner: [[1.5, 2.5]] },
      insertMaps: {},
    };

    const [point] = flattenOverlay(overlay);
    expect(point.category).toBe("loot");
    expect(point.group).toBe("loot-supplies");
  });

  it("uses the map scenario chance for conditional inserts", () => {
    expect(effectiveInsertProbability(1, "clfsmugglers", {
      nightmareScenarios: [{ scenarioName: "none", scenarioProbability: 1 }],
    })).toBe(0);
    expect(effectiveInsertProbability(1, "clfsmugglers", {
      nightmareScenarios: [
        { scenarioName: "clfsmugglers", scenarioProbability: 0.1 },
        { scenarioName: "none", scenarioProbability: 0.9 },
      ],
    })).toBe(0.1);
  });

  it("round-trips selected inserts through share URL tokens", () => {
    const overlay: MapOverlay = {
      schemaVersion: 4,
      mapPath: "/Maps/test.yml",
      prototypes: {
        Insert: {
          name: "room",
          kind: "insert",
          components: { MapInsert: { variations: [{ spawn: "/Maps/base.yml" }, { spawn: "/Maps/alt.yml" }] } },
        },
      },
      occurrences: { Insert: [[10.5, 20.5]] },
      insertMaps: {
        "/Maps/base.yml": { occurrences: {} },
        "/Maps/alt.yml": { occurrences: {} },
      },
    };
    const active = { "map:Insert:0": "/Maps/alt.yml" };
    const tokens = serializeInsertSelections(flattenOverlay(overlay, active), active);

    expect(tokens).toEqual(["map:Insert:0|1"]);
    expect(restoreInsertSelections(overlay, tokens)).toEqual(active);
  });
});
