import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../modules/equipment/types";
import { makeAdminDocument, normalizeAdminDocument } from "./api";
import { automaticCategory } from "./useAdminOverrides";

describe("catalog admin overrides", () => {
  it("normalizes schema v2 and keeps Hidden as a category", () => {
    expect(normalizeAdminDocument({
      schemaVersion: 2,
      items: {
        HiddenItem: { category: "Скрытые" },
        InvalidItem: { category: "Неизвестно" },
        BrokenItem: null,
      },
    })).toEqual({ HiddenItem: { category: "Скрытые" } });
  });

  it("accepts an empty overrides document", () => {
    expect(normalizeAdminDocument({})).toEqual({});
    expect(normalizeAdminDocument({ schemaVersion: 2, items: {} })).toEqual({});
  });

  it("serializes the full schema v2 document", () => {
    expect(makeAdminDocument({ Item: { category: "Броня" } })).toEqual({
      schemaVersion: 2,
      items: { Item: { category: "Броня" } },
    });
  });

  it("uses the automatic category as the override reset target", () => {
    const item = {
      id: "Item",
      name: "Item",
      category: "Скрытые",
      classification: { automaticCategory: "Медицина" },
    } as CatalogItem;
    expect(automaticCategory(item)).toBe("Медицина");
  });
});
