import { describe, expect, it } from "vitest";
import { liftLabels, MAX_ZONES, parseZones, requireFireZoneCatalog, serializeZones, tileRegion, toggleZone, zoneTemplates, type FireZoneCatalog, type ZoneShape } from "./fireZones";

const catalog: FireZoneCatalog = {
  schemaVersion: 1,
  gameCommit: "024d853a",
  mortars: [{ id: "RMCMortarKit", name: "Переносной комплект для миномета M402", minRange: 15, maxRange: 65 }],
  orbitalWarheads: [
    { id: "HE", name: "Орбитальная боеголовка (фугасная)", explosionId: "HEBoom", parts: [{ shape: "circle", radius: 2.887 }, { shape: "circle", radius: 17.542 }] },
    { id: "Cluster", name: "Орбитальная боеголовка (кластерная)", explosionId: "ClusterBoom", parts: [{ shape: "scatter", spread: 12, radius: 3.961, count: 225 }] },
  ],
  roofs: [
    { id: "HiveCoreXeno", name: "Ядро улья", radius: 11.848, blocks: ["CAS", "OB"] },
    { id: "HivePylonXeno", name: "Пилон улья", radius: 8.463, blocks: ["CAS"] },
  ],
};

describe("fire zones", () => {
  it("turns catalog entries into palette templates with readable labels", () => {
    const templates = zoneTemplates(catalog);
    expect(templates.map((template) => template.label)).toEqual(["Миномёт M402", "OB · фугасная", "OB · кластерная", "Ядро улья", "Пилон улья"]);
    expect(templates[0].shapes.map((shape) => shape.radius)).toEqual([65, 15]);
    // Larger parts are drawn first so the small blast stays visible on top.
    expect(templates[1].shapes.map((shape) => shape.radius)).toEqual([17.542, 2.887]);
    expect(templates[2].shapes.map((shape) => shape.radius)).toEqual([15.961, 12]);
    expect(templates[4].details).toContain("Орбитальный удар проходит");
    expect(templates[3].details).not.toContain("Орбитальный удар проходит");
  });

  it("round-trips zones through the URL and drops unknown or broken tokens", () => {
    const ids = new Set(["HE", "HiveCoreXeno"]);
    const zones = [{ templateId: "HE", tile: { x: 12, y: -40 } }, { templateId: "HiveCoreXeno", tile: { x: 0, y: 3 } }];
    expect(parseZones(serializeZones(zones), ids)).toEqual(zones);
    expect(parseZones(["Nuke:1:1", "HE:1", "HE:a:b", "HE:4:5"], ids)).toEqual([{ templateId: "HE", tile: { x: 4, y: 5 } }]);
  });

  it("removes a zone when the same template is placed on the same tile again", () => {
    const placed = toggleZone([], "HE", { x: 1, y: 2 });
    expect(placed).toHaveLength(1);
    // Another type on the same tile is added last, so it is drawn on top.
    expect(toggleZone(placed, "Cluster", { x: 1, y: 2 }).map((zone) => zone.templateId)).toEqual(["HE", "Cluster"]);
    expect(toggleZone(placed, "HE", { x: 1, y: 2 })).toEqual([]);
  });

  it("stops adding at the limit but still allows removal", () => {
    const full = Array.from({ length: MAX_ZONES }, (_, x) => ({ templateId: "HE", tile: { x, y: 0 } }));
    expect(toggleZone(full, "HE", { x: 99, y: 0 })).toBe(full);
    expect(toggleZone(full, "HE", { x: 0, y: 0 })).toHaveLength(MAX_ZONES - 1);
    expect(parseZones(serializeZones([...full, { templateId: "HE", tile: { x: 99, y: 0 } }]), new Set(["HE"]))).toHaveLength(MAX_ZONES);
  });

  it("lifts labels that would overlap earlier ones and leaves free labels in place", () => {
    const box = (x: number, y: number) => ({ x, y, width: 100, height: 18 });
    // Second label overlaps the first, third overlaps both, fourth is far away.
    expect(liftLabels([box(0, 100), box(30, 100), box(60, 100), box(400, 100)])).toEqual([0, 21, 42, 0]);
  });

  it("rejects an unsupported catalog version", () => {
    expect(() => requireFireZoneCatalog({ ...catalog, schemaVersion: 2 })).toThrow("неподдерживаемый формат");
    expect(requireFireZoneCatalog(catalog)).toBe(catalog);
  });

  describe("tile regions", () => {
    const shape = (extra: Partial<ZoneShape>): ZoneShape => ({ shape: "circle", radius: 1, fill: "", stroke: "", ...extra });
    const tiles = (region: ReturnType<typeof tileRegion>) => region.runs.reduce((sum, run) => sum + run[2], 0);

    it("keeps tiles whose centres are inside the shape", () => {
      // Radius 1 reaches the four neighbours but not the diagonals (1.41).
      expect(tiles(tileRegion(shape({}), { x: 0, y: 0 }))).toBe(5);
      expect(tiles(tileRegion(shape({ radius: 1.5 }), { x: 0, y: 0 }))).toBe(9);
      expect(tiles(tileRegion(shape({ shape: "diamond", radius: 2 }), { x: 0, y: 0 }))).toBe(13);
    });

    it("splits the mortar into a ring and an open dead zone without overlap", () => {
      const ring = tileRegion(shape({ radius: 3, minRadius: 2 }), { x: 0, y: 0 });
      const dead = tileRegion(shape({ radius: 2, open: true }), { x: 0, y: 0 });
      const all = tileRegion(shape({ radius: 3 }), { x: 0, y: 0 });
      expect(tiles(ring) + tiles(dead)).toBe(tiles(all));
      expect(dead.runs.some(([x, y, length]) => y === 0 && x <= 2 && x + length > 2)).toBe(false);
    });

    it("traces the outline along tile borders as merged straight segments", () => {
      const single = tileRegion(shape({ radius: 0.4 }), { x: 5, y: -3 });
      expect(single.runs).toEqual([[5, -3, 1]]);
      expect(single.edges).toHaveLength(4);
      // A 3×3 square merges its twelve unit borders into four sides.
      expect(tileRegion(shape({ radius: 1.5 }), { x: 0, y: 0 }).edges).toEqual(expect.arrayContaining([[-1, -1, 2, -1], [-1, 2, 2, 2]]));
      expect(tileRegion(shape({ radius: 1.5 }), { x: 0, y: 0 }).edges).toHaveLength(4);
    });
  });
});
