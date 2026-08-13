import { describe, expect, it } from "vitest";
import {
  capitalizeName,
  categoryIndex,
  formatNumber,
  itemCompatibleWith,
  normalize,
  pluralize,
} from "./format";
import type { CatalogItem } from "./types";

describe("capitalizeName", () => {
  it("capitalizes the first letter", () => {
    expect(capitalizeName("нож")).toBe("Нож");
  });

  it("leaves names starting with a digit untouched", () => {
    expect(capitalizeName("9mm пистолет")).toBe("9mm пистолет");
  });

  it("skips leading punctuation to find the first letter", () => {
    expect(capitalizeName("«винтовка»")).toBe("«Винтовка»");
  });
});

describe("normalize", () => {
  it("lowercases and trims", () => {
    expect(normalize("  Пистолет  ")).toBe("пистолет");
  });

  it("folds ё to е", () => {
    expect(normalize("ёж")).toBe("еж");
  });
});

describe("categoryIndex", () => {
  it("orders known categories before unknown ones", () => {
    expect(categoryIndex("Оружие")).toBeLessThan(categoryIndex("Другое"));
  });

  it("puts an unrecognized category after every known one", () => {
    expect(categoryIndex("Не категория")).toBeGreaterThan(categoryIndex("Другое"));
  });
});

describe("itemCompatibleWith", () => {
  const weaponId = "RMCWeaponPistolM13";

  it("matches items that list the weapon directly", () => {
    const item = { id: "x", name: "x", compatibleWeaponIds: [weaponId] } as CatalogItem;
    expect(itemCompatibleWith(item, weaponId)).toBe(true);
  });

  it("matches items whose attachment slots list the weapon", () => {
    const item = {
      id: "x",
      name: "x",
      attachableTo: [{ weaponIds: [weaponId] }],
    } as CatalogItem;
    expect(itemCompatibleWith(item, weaponId)).toBe(true);
  });

  it("does not match unrelated items", () => {
    const item = { id: "x", name: "x" } as CatalogItem;
    expect(itemCompatibleWith(item, weaponId)).toBe(false);
  });
});

describe("formatNumber", () => {
  it("formats numbers with the ru-RU locale", () => {
    expect(formatNumber(1.5)).toBe("1,5");
  });

  it("passes non-numbers through as a string", () => {
    expect(formatNumber("N/A")).toBe("N/A");
    expect(formatNumber(null)).toBe("");
  });
});

describe("pluralize", () => {
  it("picks the singular form", () => {
    expect(pluralize(1, "место", "места", "мест")).toBe("место");
    expect(pluralize(21, "место", "места", "мест")).toBe("место");
  });

  it("picks the few form", () => {
    expect(pluralize(2, "место", "места", "мест")).toBe("места");
    expect(pluralize(3, "место", "места", "мест")).toBe("места");
  });

  it("picks the many form, including the 11-14 exception", () => {
    expect(pluralize(5, "место", "места", "мест")).toBe("мест");
    expect(pluralize(11, "место", "места", "мест")).toBe("мест");
    expect(pluralize(12, "место", "места", "мест")).toBe("мест");
  });
});
