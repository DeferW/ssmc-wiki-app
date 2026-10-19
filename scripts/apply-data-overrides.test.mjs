// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { applyDataOverrides } from "./apply-data-overrides.mjs";

const roots = [];
const catalog = (id = "Item", schemaVersion = 4) => ({
  schemaVersion,
  items: { [id]: { id, name: id, category: "Снаряжение" } },
  publicCatalog: { itemIds: [id], categories: { "Снаряжение": [id] } },
  counts: {},
});
async function fixture(overrides, main = catalog(), maps = catalog("MapItem", 1)) {
  const root = await mkdtemp(resolve(tmpdir(), "ssmc-overrides-test-"));
  roots.push(root);
  await mkdir(resolve(root, "catalog"));
  await mkdir(resolve(root, "maps"));
  await writeFile(resolve(root, "catalog/catalog.json"), JSON.stringify(main));
  await writeFile(resolve(root, "maps/static-items.json"), JSON.stringify(maps));
  const path = resolve(root, "overrides.json");
  await writeFile(path, JSON.stringify({ schemaVersion: 2, items: overrides }));
  return { root, path, read: (file = "catalog/catalog.json") => readFile(resolve(root, file), "utf8").then(JSON.parse) };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("skips stale overrides, reports their IDs and counts only applied overrides", async () => {
  const overrides = { RMCIntelFolder: { category: "Другое" }, Item: { category: "Оружие" }, MapItem: { category: "Другое" }, AnotherMissing: { category: "Другое" } };
  const { root, path, read } = await fixture(overrides);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await applyDataOverrides(root, path)).toBe(2);
  const result = await read();
  expect(result.items.Item.category).toBe("Оружие");
  expect(result.publicCatalog.categories["Оружие"]).toEqual(["Item"]);
  expect((await read("maps/static-items.json")).items.MapItem.category).toBe("Другое");
  expect(result.overrides.appliedItemIds).toEqual(["Item", "MapItem"]);
  expect(result.overrides.skippedItemIds).toEqual(["AnotherMissing", "RMCIntelFolder"]);
  expect(result.overrides.editedItemIds).toEqual(["Item", "MapItem"]);
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning.mock.calls[0][0]).toMatch(/AnotherMissing.*RMCIntelFolder/);
  expect(JSON.parse(await readFile(path, "utf8")).items).toEqual(overrides);
});

it("applies a map-only override without treating it as stale", async () => {
  const { root, path, read } = await fixture({ MapItem: { category: "Другое" } });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await applyDataOverrides(root, path)).toBe(1);
  expect((await read()).overrides.skippedItemIds).toEqual([]);
  expect(warning).not.toHaveBeenCalled();
});

it("still rejects an invalid category even for an absent item without writing catalogs", async () => {
  const { root, path, read } = await fixture({ Missing: { category: "Invalid category" } });
  const before = await read();
  await expect(applyDataOverrides(root, path)).rejects.toThrow("Unknown category");
  expect(await read()).toEqual(before);
});

it.each([
  ["an empty public catalog", { ...catalog(), publicCatalog: { itemIds: [], categories: {} } }],
  ["a dangling public reference", { ...catalog(), publicCatalog: { itemIds: ["Missing"] } }],
  ["a malformed public item", { ...catalog(), items: { Item: null } }],
  ["an unknown item category", { ...catalog(), items: { Item: { id: "Item", category: "Unknown" } } }],
  ["an unsupported schema", { ...catalog(), schemaVersion: 99 }],
  ["duplicate public references", { ...catalog(), publicCatalog: { itemIds: ["Item", "Item"] } }],
])("rejects %s instead of disguising corruption as a stale override", async (_label, main) => {
  const { root, path, read } = await fixture({}, main);
  const before = await read();
  await expect(applyDataOverrides(root, path)).rejects.toThrow(/catalog/i);
  expect(await read()).toEqual(before);
});

it("rejects broken references in the map item catalog too", async () => {
  const maps = catalog("MapItem", 1);
  maps.publicCatalog.itemIds.push("Missing");
  const { root, path } = await fixture({}, catalog(), maps);
  await expect(applyDataOverrides(root, path)).rejects.toThrow(/catalog/i);
});

it("rejects a null map item document instead of treating it as a missing file", async () => {
  const { root, path } = await fixture({}, catalog(), null);
  await expect(applyDataOverrides(root, path)).rejects.toThrow(/catalog/i);
});

it.each([
  ["Одежда", "clothing"], ["Инструменты", "tools"], ["Электроника", "electronics"],
  ["Провизия", "food"], ["Быт", "household"], ["Материалы", "materials"],
  ["Контейнеры", "containers"],
])("supports %s in both generated data and administrator overrides", async (category, categoryId) => {
  const main = catalog();
  main.items.Item.category = category;
  const { root, path, read } = await fixture({ MapItem: { category } }, main);
  expect(await applyDataOverrides(root, path)).toBe(1);
  expect((await read()).publicCatalog.categories[category]).toEqual(["Item"]);
  const mapItem = (await read("maps/static-items.json")).items.MapItem;
  expect(mapItem.classification.categoryId).toBe(categoryId);
  expect(mapItem.types).toEqual([categoryId]);
});
