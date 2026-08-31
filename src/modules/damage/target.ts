import type { Catalog } from "../equipment/types";
import type { ArmorTarget } from "./damageMath";
import { marineArmorFromItems, MARINE_PRESETS } from "./marinePresets";
import type { MobCatalog, MobThresholdPair, RmcSize } from "./mobTypes";

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
  matured = false,
): MobThresholdPair | null {
  if (!selection || !mobCatalog) return null;
  if (selection.kind === "marine") return mobCatalog.marine.thresholds;
  const caste = mobCatalog.xenoCastes[selection.casteId];
  if (!caste) return null;
  return matured && caste.maturedThresholds ? caste.maturedThresholds : caste.thresholds;
}

// RMCFocusedShootingSystem only ever grants a bonus against xeno-sized
// targets — marines have no RMCSizeComponent tier that matters here, so this
// is null for a marine selection rather than some marine-equivalent size.
export function targetSizeFrom(
  selection: TargetSelection | null,
  mobCatalog: MobCatalog | null,
): RmcSize | null {
  if (!selection || selection.kind !== "xeno" || !mobCatalog) return null;
  return mobCatalog.xenoCastes[selection.casteId]?.size ?? null;
}
