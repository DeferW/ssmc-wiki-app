import { isMap } from "../equipment/format";
import type { Catalog } from "../equipment/types";
import type { MarineArmor } from "./damageMath";

export type MarinePreset = {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
};

// Item lists verified against real USCM job "dummy" starting gear in
// Roles/Jobs/Marines/*.yml and Roles/Jobs/Command/*.yml (the exact loadout
// shown on the character-preview screen for that role), not guessed.
export const MARINE_PRESETS: MarinePreset[] = [
  {
    id: "light",
    name: "Лёгкая броня",
    description: "Униформа, шлем M10 и лёгкая броня M3-L.",
    itemIds: ["JumpsuitMarine", "ArmorHelmetM10", "RMCArmorM3LightCarrier"],
  },
  {
    id: "medium",
    name: "Средняя броня",
    description: "Стандартный комплект рядового: униформа, шлем M10, броня M3.",
    itemIds: ["JumpsuitMarine", "ArmorHelmetM10", "RMCArmorM3MediumCarrier"],
  },
  {
    id: "heavy",
    name: "Тяжёлая броня",
    description: "Униформа, шлем M10 и тяжёлая броня M3-EOD.",
    itemIds: ["JumpsuitMarine", "ArmorHelmetM10", "RMCArmorM3HeavyCarrier"],
  },
  {
    id: "b12",
    name: "Броня B12",
    description: "Униформа, шлем M10 и броня B12.",
    itemIds: ["JumpsuitMarine", "ArmorHelmetM10", "CMArmorB12"],
  },
  {
    id: "m4-radio",
    name: "Броня M4 радиста",
    description: "Комплект командира огневой группы: униформа, шлем M12, броня M4.",
    itemIds: ["JumpsuitMarine", "CMArmorHelmetM12", "CMArmorM4"],
  },
  {
    id: "b12-leader",
    name: "Броня B12 лидера",
    description: "Комплект командира отделения: униформа, шлем M11, броня B12.",
    itemIds: ["JumpsuitMarine", "CMArmorHelmetM11", "CMArmorB12"],
  },
  {
    id: "officer",
    name: "Офицер",
    description: "Офицерская форма и фуражка, без брони.",
    itemIds: ["CMJumpsuitBO", "CMHeadCapOfficer"],
  },
  {
    id: "senior-officer",
    name: "Старший офицер",
    description: "Офицерская форма, полевая фуражка и мундир, без брони.",
    itemIds: ["CMJumpsuitBO", "CMHeadCapPeakedService", "RMCCoatService"],
  },
  {
    id: "no-armor",
    name: "Без брони",
    description: "Только униформа морской пехоты.",
    itemIds: ["JumpsuitMarine"],
  },
  {
    id: "nothing",
    name: "Совсем ничего",
    description: "Голая кожа, никакой защиты.",
    itemIds: [],
  },
];

// CMArmorSystem only ever queries SlotFlags.OUTERCLOTHING | SlotFlags.INNERCLOTHING
// (CMArmorSystem.cs, both CMGetArmorEvent call sites) — head-slot armor (helmets)
// is inert until per-part damage lands, per the TODO on the same line. A helmet's
// CMArmor numbers exist in the data but must not count toward protection yet.
const ARMOR_CONTRIBUTING_SLOTS = new Set(["outerClothing", "innerclothing"]);

export function marineArmorFromItems(itemIds: string[], catalog: Catalog): MarineArmor {
  let bullet = 0;
  let melee = 0;
  let bio = 0;
  for (const id of itemIds) {
    const item = catalog.items[id];
    if (!item?.equipmentSlots?.some((slot) => ARMOR_CONTRIBUTING_SLOTS.has(slot))) continue;
    const armor = item.properties?.CMArmor;
    if (!isMap(armor)) continue;
    bullet += typeof armor.bullet === "number" ? armor.bullet : 0;
    melee += typeof armor.melee === "number" ? armor.melee : 0;
    bio += typeof armor.bio === "number" ? armor.bio : 0;
  }
  return { kind: "marine", bullet, melee, bio };
}
