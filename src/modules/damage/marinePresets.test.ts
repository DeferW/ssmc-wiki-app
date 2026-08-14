import { describe, expect, it } from "vitest";
import { MARINE_PRESETS, marineArmorFromItems } from "./marinePresets";
import type { Catalog, CatalogItem } from "../equipment/types";

// properties.CMArmor and equipmentSlots values pulled from the real catalog
// for every item used by a marine preset (see the preset comments in
// marinePresets.ts for the job/gear source each combination is verified
// against). Helmets carry real CMArmor numbers in the data but sit in the
// HEAD slot, which CMArmorSystem never reads from (see marinePresets.ts).
function item(
  id: string,
  slot: "outerClothing" | "innerclothing" | "HEAD",
  armor?: { bullet?: number; melee?: number; bio?: number },
): CatalogItem {
  return {
    id,
    name: id,
    equipmentSlots: [slot],
    properties: armor ? { CMArmor: armor } : {},
  } as unknown as CatalogItem;
}

const CATALOG: Catalog = {
  schemaVersion: 4,
  gameCommit: "test",
  source: "test",
  sources: {},
  items: {
    JumpsuitMarine: item("JumpsuitMarine", "innerclothing", { bullet: 10, melee: 10 }),
    ArmorHelmetM10: item("ArmorHelmetM10", "HEAD", { bullet: 20, melee: 20, bio: 20 }),
    CMArmorHelmetM11: item("CMArmorHelmetM11", "HEAD", { bullet: 20, melee: 20, bio: 25 }),
    CMArmorHelmetM12: item("CMArmorHelmetM12", "HEAD", { bullet: 20, melee: 25, bio: 25 }),
    CMArmorB12: item("CMArmorB12", "outerClothing", { bullet: 20, melee: 25, bio: 25 }),
    CMArmorM4: item("CMArmorM4", "outerClothing", { bullet: 20, melee: 20, bio: 25 }),
    RMCArmorM3LightCarrier: item("RMCArmorM3LightCarrier", "outerClothing", { bullet: 15, melee: 15, bio: 15 }),
    RMCArmorM3MediumCarrier: item("RMCArmorM3MediumCarrier", "outerClothing", { bullet: 20, melee: 20, bio: 20 }),
    RMCArmorM3HeavyCarrier: item("RMCArmorM3HeavyCarrier", "outerClothing", { bullet: 35, melee: 25, bio: 25 }),
    CMJumpsuitBO: item("CMJumpsuitBO", "innerclothing", { bullet: 10, melee: 10 }),
    CMHeadCapOfficer: item("CMHeadCapOfficer", "HEAD"),
    CMHeadCapPeakedService: item("CMHeadCapPeakedService", "HEAD"),
    RMCCoatService: item("RMCCoatService", "outerClothing", { bullet: 10, melee: 10 }),
  },
  publicCatalog: { itemIds: [], categories: {} },
};

describe("marineArmorFromItems", () => {
  // Helmets no longer contribute: B12 and B12-leader end up identical because
  // the only real-game difference between them is the leader's helmet/headset.
  const expected: Record<string, { bullet: number; melee: number; bio: number }> = {
    light: { bullet: 25, melee: 25, bio: 15 },
    medium: { bullet: 30, melee: 30, bio: 20 },
    heavy: { bullet: 45, melee: 35, bio: 25 },
    b12: { bullet: 30, melee: 35, bio: 25 },
    "m4-radio": { bullet: 30, melee: 30, bio: 25 },
    "b12-leader": { bullet: 30, melee: 35, bio: 25 },
    officer: { bullet: 10, melee: 10, bio: 0 },
    "senior-officer": { bullet: 20, melee: 20, bio: 0 },
    "no-armor": { bullet: 10, melee: 10, bio: 0 },
    nothing: { bullet: 0, melee: 0, bio: 0 },
  };

  for (const preset of MARINE_PRESETS) {
    it(`computes the right totals for ${preset.id}`, () => {
      const result = marineArmorFromItems(preset.itemIds, CATALOG);
      expect(result).toEqual({ kind: "marine", ...expected[preset.id] });
    });
  }

  it("ignores items missing from the catalog", () => {
    expect(marineArmorFromItems(["DoesNotExist"], CATALOG)).toEqual({ kind: "marine", bullet: 0, melee: 0, bio: 0 });
  });

  it("ignores a helmet's CMArmor even though the field is present in the data", () => {
    expect(marineArmorFromItems(["ArmorHelmetM10"], CATALOG)).toEqual({ kind: "marine", bullet: 0, melee: 0, bio: 0 });
  });
});
