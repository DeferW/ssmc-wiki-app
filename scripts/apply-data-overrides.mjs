import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import categories from "../config/catalog-categories.json" with { type: "json" };

const categoryIds = new Map(categories.map(({ name, id }) => [name, id]));

export async function applyDataOverrides(dataRoot, overridesPath) {
  const catalogPath = resolve(dataRoot, "catalog/catalog.json");
  const mapItemsPath = resolve(dataRoot, "maps/static-items.json");
  const [catalog, mapItems, document] = await Promise.all([
    readJson(catalogPath),
    readJsonOptional(mapItemsPath),
    readFile(overridesPath, "utf8").then((text) => text.trim() ? JSON.parse(text) : { schemaVersion: 2, items: {} }),
  ]);
  if (isObject(document) && Object.keys(document).length === 0) {
    document.schemaVersion = 2;
    document.items = {};
  }
  if (!isObject(document) || document.schemaVersion !== 2 || !isObject(document.items)) {
    throw new Error("config/catalog-overrides.json must use schemaVersion 2");
  }

  validateCatalog(catalog, catalogPath, 4, true);
  if (mapItems !== undefined) validateCatalog(mapItems, mapItemsPath, 1, false);
  const catalogs = mapItems === undefined ? [catalog] : [catalog, mapItems];
  const editedIds = new Set();
  const appliedIds = [];
  const skippedIds = [];
  for (const [itemId, override] of Object.entries(document.items)) {
    const category = isObject(override) ? override.category : undefined;
    const categoryId = categoryIds.get(category);
    if (!categoryId) throw new Error(`Unknown category for ${itemId}: ${category}`);
    let found = false;
    for (const target of catalogs) {
      const item = target.items[itemId];
      if (!isObject(item) || !target.publicCatalog.itemIds.includes(itemId)) continue;
      found = true;
      const classification = isObject(item.classification) ? item.classification : {};
      const automaticCategory = classification.automaticCategory ?? item.category;
      const automaticCategoryId = classification.automaticCategoryId ?? classification.categoryId;
      classification.automaticCategory = automaticCategory;
      classification.automaticCategoryId = automaticCategoryId;
      classification.category = category;
      classification.categoryId = categoryId;
      classification.overriddenByAdministrator = true;
      item.classification = classification;
      item.category = category;
      item.types = [categoryId];
      if (category !== automaticCategory) {
        item.edited = true;
        editedIds.add(itemId);
      } else {
        delete item.edited;
      }
    }
    if (found) appliedIds.push(itemId);
    else skippedIds.push(itemId);
  }

  for (const target of catalogs) rebuildCategories(target);
  catalog.overrides = {
    schemaVersion: 2,
    appliedItemIds: appliedIds.sort(),
    skippedItemIds: skippedIds.sort(),
    editedItemIds: [...editedIds].sort(),
  };
  catalog.counts.editedItems = editedIds.size;
  catalog.counts.hiddenItems = catalog.publicCatalog.categories["Скрытые"].length;

  await Promise.all([
    writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8"),
    ...(mapItems ? [writeFile(mapItemsPath, `${JSON.stringify(mapItems, null, 2)}\n`, "utf8")] : []),
  ]);
  if (skippedIds.length) {
    console.warn(`Skipped ${skippedIds.length} app catalog overrides: items are not published in catalog/catalog.json or maps/static-items.json: ${skippedIds.join(", ")}. Check game source changes and data build reports; overrides are retained for future builds.`);
  }
  return appliedIds.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const count = await applyDataOverrides(resolve(root, "public/data"), resolve(root, "config/catalog-overrides.json"));
  console.log(`Applied ${count} app catalog overrides`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonOptional(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateCatalog(target, path, schemaVersion, requireItems) {
  if (!isObject(target) || target.schemaVersion !== schemaVersion || !isObject(target.items)
      || !isObject(target.publicCatalog) || !Array.isArray(target.publicCatalog.itemIds)
      || !isObject(target.counts)) {
    throw new Error(`Generated catalog has an unsupported structure or schema: ${path}`);
  }
  const ids = target.publicCatalog.itemIds;
  if (requireItems && ids.length === 0) throw new Error(`Generated catalog is empty: ${path}`);
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== "string" || !id || seen.has(id)
        || !Object.hasOwn(target.items, id) || !isObject(target.items[id])) {
      throw new Error(`Generated catalog has an invalid public item reference: ${String(id)} (${path})`);
    }
    seen.add(id);
    if (!categoryIds.has(target.items[id].category)) {
      throw new Error(`Generated catalog has an unknown category for ${id}: ${target.items[id].category} (${path})`);
    }
  }
}

function rebuildCategories(target) {
  const orderedIds = [...new Set(target.publicCatalog.itemIds)].sort((left, right) =>
    String(target.items[left].name).localeCompare(String(target.items[right].name), "ru") || left.localeCompare(right),
  );
  const categories = Object.fromEntries([...categoryIds].map(([label]) => [label, []]));
  for (const itemId of orderedIds) categories[target.items[itemId].category].push(itemId);
  target.publicCatalog.itemIds = orderedIds;
  target.publicCatalog.categories = categories;
}
