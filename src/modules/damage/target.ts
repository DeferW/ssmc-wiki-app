import type { Catalog } from "../equipment/types";
import type { ArmorTarget } from "./damageMath";
import { marineArmorFromItems, MARINE_PRESETS } from "./marinePresets";
import type { MobCatalog, MobThresholdPair } from "./mobTypes";

export type TargetSelection =
  | { kind: "marine"; presetId: string }
  | { kind: "xeno"; casteId: string };

export function targetArmorFrom(
  selection: TargetSelection | null,
  catalog: Catalog | null,
  mobCatalog: MobCatalog | null,
): ArmorTarget | null {
  if (!selection || !catalog || !mobCatalog) return null;
  if (selection.kind === "marine") {
    const preset = MARINE_PRESETS.find((entry) => entry.id === selection.presetId);
    if (!preset) return null;
    return marineArmorFromItems(preset.itemIds, catalog);
  }
  const caste = mobCatalog.xenoCastes[selection.casteId];
  if (!caste) return null;
  return {
    kind: "xeno",
    xenoArmor: caste.armor.xenoArmor,
    frontalArmor: caste.armor.frontalArmor,
    sideArmor: caste.armor.sideArmor,
    immuneToArmorPiercing: caste.armor.immuneToArmorPiercing,
  };
}

export function targetThresholdsFrom(
  selection: TargetSelection | null,
  mobCatalog: MobCatalog | null,
): MobThresholdPair | null {
  if (!selection || !mobCatalog) return null;
  if (selection.kind === "marine") return mobCatalog.marine.thresholds;
  return mobCatalog.xenoCastes[selection.casteId]?.thresholds ?? null;
}
