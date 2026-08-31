import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "public/data/catalog/catalog.json");
const mapItemsPath = resolve(root, "public/data/maps/static-items.json");
const overridesPath = resolve(root, "config/catalog-overrides.json");
const categoryIds = new Map([
  ["Оружие", "weapon"],
  ["Боезапас", "ammunition"],
  ["Обвесы", "attachment"],
  ["Броня", "armor"],
  ["Экипировка", "equipment"],
  ["Медицина", "medicine"],
  ["Снаряжение", "gear"],
  ["Другое", "other"],
  ["Скрытые", "hidden"],
]);

const [catalog, mapItems, document] = await Promise.all([
  readJson(catalogPath),
  readJsonOptional(mapItemsPath),
  readJson(overridesPath),
]);
if (isObject(document) && Object.keys(document).length === 0) {
  document.schemaVersion = 2;
  document.items = {};
}
if (document.schemaVersion !== 2 || !isObject(document.items)) {
  throw new Error("config/catalog-overrides.json must use schemaVersion 2");
}

const catalogs = [catalog, mapItems].filter(Boolean);
for (const target of catalogs) {
  if (!isObject(target.items) || !isObject(target.publicCatalog) || !Array.isArray(target.publicCatalog.itemIds)) {
    throw new Error("Generated catalog has an unsupported structure");
  }
}
const editedIds = new Set();
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
  if (!found) throw new Error(`Catalog override references unpublished item: ${itemId}`);
}

for (const target of catalogs) rebuildCategories(target);
catalog.overrides = {
  schemaVersion: 2,
  appliedItemIds: Object.keys(document.items).sort(),
  editedItemIds: [...editedIds].sort(),
};
catalog.counts.editedItems = editedIds.size;
catalog.counts.hiddenItems = catalog.publicCatalog.categories["Скрытые"].length;

await Promise.all([
  writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8"),
  ...(mapItems ? [writeFile(mapItemsPath, `${JSON.stringify(mapItems, null, 2)}\n`, "utf8")] : []),
]);
console.log(`Applied ${Object.keys(document.items).length} app catalog overrides`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonOptional(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
