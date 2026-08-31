import { describe, expect, it } from "vitest";
import type { MobCatalog } from "./mobTypes";
import { targetThresholdsFrom } from "./target";

const catalog: MobCatalog = {
  schemaVersion: 1,
  source: "test",
  gameCommit: "test",
  locale: "ru-RU",
  marine: { sourcePrototypeId: "Marine", thresholds: { critical: 100, dead: 200 } },
  xenoCastes: {
    Queen: {
      id: "Queen",
      name: "Королева",
      strainName: null,
      size: "Immobile",
      origin: "test",
      sourceFile: "queen.yml",
      parents: [],
      thresholds: { critical: 500, dead: 600 },
      maturedThresholds: { critical: 1000, dead: 1100 },
      armor: {
        xenoArmor: 25,
        frontalArmor: 0,
        sideArmor: 0,
        explosionArmor: 100,
        immuneToArmorPiercing: false,
      },
      sprite: null,
    },
  },
  counts: { xenoCastes: 1 },
};

describe("target maturity", () => {
  const queen = { kind: "xeno", casteId: "Queen" } as const;

  it("uses spawn thresholds by default", () => {
    expect(targetThresholdsFrom(queen, catalog)).toEqual({ critical: 500, dead: 600 });
  });

  it("uses matured thresholds when selected", () => {
    expect(targetThresholdsFrom(queen, catalog, true)).toEqual({ critical: 1000, dead: 1100 });
  });
});
