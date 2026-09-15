import { describe, expect, it } from "vitest";
import { activeInsertPlacements, flattenOverlay, previewMapPoints } from "./overlay";
import type { MapOverlay, MapStaticItemCatalog } from "./types";

const overlay: MapOverlay = {
  schemaVersion: 6, mapPath: "/map.yml",
  prototypes: {
    Insert: { name: "Оружейная", kind: "insert", components: { MapInsert: {
      clearEntities: true, variations: [{ spawn: "/a.yml" }, { spawn: "/b.yml" }],
    } } },
    Loot: { name: "Лут", kind: "spawner", components: { RandomSpawner: {} } },
  },
  occurrences: { Insert: [[10.5, 20.5]], Loot: [[10.5, 20.5], [12.5, 20.5]] },
  itemOccurrences: { Item: [[10.5, 20.5]] },
  objectOccurrences: { Object: [[10.5, 20.5]] },
  objectPrototypes: { Object: { name: "Объект", group: "machines" } },
  insertMaps: Object.fromEntries(["a", "b"].map((name) => [`/${name}.yml`, {
    occurrences: { Loot: [[0.5, 0.5]] }, itemOccurrences: { Item: [[0.5, 0.5]] },
    objectOccurrences: { Object: [[0.5, 0.5]] }, footprint: { rows: [[0, 0, 1]] },
    tiles: `${name}/tiles.json`,
  }])),
};
const catalog: MapStaticItemCatalog = {
  schemaVersion: 1, gameCommit: "test", source: "test",
  items: { Item: { id: "Item", name: "Предмет", category: "Другое" } },
  publicCatalog: { itemIds: ["Item"], categories: {} }, counts: { items: 1 },
};

describe("insert marker previews", () => {
  it("keeps all three kinds in unselected variants, with unique stable keys", () => {
    const points = previewMapPoints(overlay, catalog, {});
    expect(points.filter((p) => p.insertPath)).toHaveLength(6);
    for (const point of points.filter((p) => p.insertPath)) {
      expect(point.parentInsert).toEqual({ name: "Оружейная", probability: 1 });
      expect(point.probability).toBeUndefined();
      expect(point.nightmareScenario).toBeUndefined();
      if (point.category === "item") expect(point.item).toEqual(catalog.items.Item);
      if (point.category === "object") expect(point.object).toEqual(overlay.objectPrototypes!.Object);
      if (point.category === "loot") expect(point.components).toEqual(overlay.prototypes.Loot.components);
    }
    expect(points.filter((p) => p.insertPath).every((p) => p.inactive)).toBe(true);
    expect(new Set(points.map((p) => p.key)).size).toBe(points.length);
    expect(previewMapPoints(overlay, catalog, { "map:Insert:0": "/a.yml" }).map((p) => p.key)).toEqual(points.map((p) => p.key));
  });
  it.each(["a", "b"])("activates %s and dims replaced base entities only inside its footprint", (name) => {
    const points = previewMapPoints(overlay, catalog, { "map:Insert:0": `/${name}.yml` });
    expect(points.filter((p) => p.insertPath === `/${name}.yml`).every((p) => !p.inactive)).toBe(true);
    expect(points.filter((p) => p.insertPath && p.insertPath !== `/${name}.yml`).every((p) => p.inactive)).toBe(true);
    expect(points.filter((p) => !p.insertPath && p.category !== "insert" && p.x === 10.5).every((p) => p.inactive)).toBe(true);
    expect(points.find((p) => p.x === 12.5)?.inactive).toBe(false);
    expect(previewMapPoints(overlay, catalog, {}).filter((p) => !p.insertPath).every((p) => !p.inactive)).toBe(true);
  });
  it("preserves nested anchor URL keys and does not render a child of an inactive variant", () => {
    const nested = structuredClone(overlay);
    nested.prototypes.Child = { name: "Child", kind: "insert", components: { MapInsert: { variations: [{ spawn: "/child.yml" }] } } };
    nested.insertMaps["/a.yml"].occurrences.Child = [[0.5, 0.5]];
    nested.insertMaps["/child.yml"] = { occurrences: { Loot: [[1.5, 1.5]] }, tiles: "child/tiles.json" };
    const selection = { "map:Insert:0": "/a.yml" };
    const child = flattenOverlay(nested, selection).find((p) => p.prototypeId === "Child")!;
    const active = { ...selection, [child.key]: "/child.yml" };
    const points = previewMapPoints(nested, catalog, active);
    expect(points.find((p) => p.prototypeId === "Child")?.key).toBe(child.key);
    expect(points.find((p) => p.insertPath === "/child.yml")?.inactive).toBe(false);
    const inactive = { ...active, "map:Insert:0": "/b.yml" };
    const switched = previewMapPoints(nested, catalog, inactive);
    expect(switched.find((p) => p.insertPath === "/child.yml")?.inactive).toBe(true);
    expect(activeInsertPlacements(nested, switched, inactive).map((p) => p.path)).toEqual(["/b.yml"]);
  });
  it("stops cyclic insert references", () => {
    const cyclic = structuredClone(overlay);
    cyclic.insertMaps["/a.yml"].occurrences.Insert = [[0.5, 0.5]];
    expect(previewMapPoints(cyclic, catalog, {}).length).toBeLessThan(30);
  });
});


it("hides zero-chance insert items until selected, while retaining positive previews", () => {
 const data = structuredClone(overlay);
 data.prototypes.Insert.components!.MapInsert.variations = [{spawn:"/a.yml",probability:0},{spawn:"/b.yml",probability:.1}];
 const points = previewMapPoints(data,catalog,{});
 expect(points.some(p=>p.category==="item" && p.insertPath==="/a.yml")).toBe(false);
 expect(points.find(p=>p.category==="item" && p.insertPath==="/b.yml")?.inactive).toBe(true);
 expect(points.some(p=>p.category==="insert")).toBe(true);
 expect(previewMapPoints(data,catalog,{"map:Insert:0":"/a.yml"}).find(p=>p.category==="item" && p.insertPath==="/a.yml")?.inactive).toBe(false);
});
it("uses the effective nightmare scenario chance", () => {
 const data = structuredClone(overlay);
 data.prototypes.Insert.components!.MapInsert.variations = [{spawn:"/a.yml",probability:1,nightmareScenario:"CLF"}];
 const map = {nightmareScenarios:[{scenarioName:"CLF",scenarioProbability:0}]};
 expect(previewMapPoints(data,catalog,{},map).some(p=>p.category==="item" && p.insertPath)).toBe(false);
 expect(previewMapPoints(data,catalog,{"map:Insert:0":"/a.yml"},map).some(p=>p.category==="item" && p.insertPath)).toBe(true);
 expect(previewMapPoints(data,catalog,{}, {nightmareScenarios:[{scenarioName:"CLF",scenarioProbability:.2}]}).some(p=>p.category==="item" && p.insertPath)).toBe(true);
});
it("does not leak nested items from a disabled parent insert", () => {
 const data = structuredClone(overlay);
 data.prototypes.Insert.components!.MapInsert.variations = [{spawn:"/a.yml",probability:0}];
 data.prototypes.Child = {name:"Child",kind:"insert",components:{MapInsert:{variations:[{spawn:"/child.yml"}]}}};
 data.insertMaps["/a.yml"].occurrences.Child = [[.5,.5]];
 data.insertMaps["/child.yml"] = {occurrences:{},itemOccurrences:{Item:[[.5,.5]]}};
 expect(previewMapPoints(data,catalog,{}).some(p=>p.category==="item" && p.insertPath)).toBe(false);
 expect(previewMapPoints(data,catalog,{"map:Insert:0":"/a.yml"}).some(p=>p.category==="item" && p.insertPath==="/child.yml")).toBe(true);
});
