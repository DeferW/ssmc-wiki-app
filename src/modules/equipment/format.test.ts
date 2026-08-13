import { describe, expect, it } from "vitest";
import { capitalizeName, categoryIndex, descriptionText, formatCost, itemMatches, normalize } from "./format";
import type { CatalogItem } from "./types";

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
});
