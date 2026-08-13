import { describe, expect, it } from "vitest";
import { capitalizeName, categoryIndex, descriptionText, explicitStorageItemIds, formatCost, isCatalogItemVisible, itemMatches, normalize } from "./format";
import type { Catalog, CatalogItem } from "./types";

describe("equipment formatting", () => {
  it("normalizes Russian search", () => {
    expect(normalize("  ЁЖ  ")).toBe("еж");
  });

  it("capitalizes the first visible letter", () => {
    expect(capitalizeName("«винтовка»")).toBe("«Винтовка»");
  });

  it("orders new catalog categories", () => {
    expect(categoryIndex("Боезапас")).toBeLessThan(categoryIndex("Другое"));
  });

  it("hides hidden items only from the ordinary catalog listing", () => {
    expect(isCatalogItemVisible("Скрытые")).toBe(false);
    expect(isCatalogItemVisible("Скрытые", true)).toBe(true);
    expect(isCatalogItemVisible("Медицина")).toBe(true);
  });

  it("searches name, id, description and tags", () => {
    const item = {
      id: "RMCExample",
      name: "Аптечка",
      description: "Полевая медицина",
      tags: ["Medical"],
    } as CatalogItem;
    expect(itemMatches(item, "медицин")).toBe(true);
    expect(itemMatches(item, "rmcexample")).toBe(true);
    expect(itemMatches(item, "оружие")).toBe(false);
  });

  it("formats cargo cost", () => {
    expect(formatCost(3500)).toContain("3 500");
  });

  it("replaces empty and malformed descriptions", () => {
    expect(descriptionText("{ \"\" }")).toBe("Нет описания предмета");
    expect(descriptionText({ value: "" })).toBe("Нет описания предмета");
  });

  it("shows accepted storage items only for an explicit, informative whitelist", () => {
    const catalog = { items: { Allowed: { id: "Allowed" }, Packed: { id: "Packed" } } } as unknown as Catalog;
    const generic = { id: "Generic", name: "Generic", storageStats: { acceptedItemIds: ["Allowed"] } } as CatalogItem;
    const duplicate = {
      id: "Duplicate",
      name: "Duplicate",
      relationships: [{ type: "contains", itemId: "Packed" }],
      storageStats: { whitelist: { tags: ["Example"] }, acceptedItemIds: ["Packed"] },
    } as CatalogItem;
    const restricted = {
      id: "Restricted",
      name: "Restricted",
      storageStats: { whitelist: { tags: ["Example"] }, acceptedItemIds: ["Allowed"] },
    } as CatalogItem;

    expect(explicitStorageItemIds(generic, catalog)).toEqual([]);
    expect(explicitStorageItemIds(duplicate, catalog)).toEqual([]);
    expect(explicitStorageItemIds(restricted, catalog)).toEqual(["Allowed"]);
  });
});
