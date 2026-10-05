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

// User-entered target, kept apart from TargetSelection so it never shows up
// in the preset lists. Custom xeno targets are treated as Xeno-sized.
export type CustomMarineTarget = {
  kind: "marine";
  bullet: number;
  melee: number;
  bio: number;
  critical: number | null;
  dead: number;
};

export type CustomXenoTarget = {
  kind: "xeno";
  xenoArmor: number;
  frontalArmor: number;
  sideArmor: number;
  immuneToArmorPiercing: boolean;
  critical: number | null;
  dead: number;
};

export type CustomTarget = CustomMarineTarget | CustomXenoTarget;

export const DEFAULT_CUSTOM_MARINE_TARGET: CustomMarineTarget = {
  kind: "marine", bullet: 20, melee: 20, bio: 10, critical: 150, dead: 200,
};

export const DEFAULT_CUSTOM_XENO_TARGET: CustomXenoTarget = {
  kind: "xeno", xenoArmor: 20, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: false, critical: 400, dead: 500,
};

export function customTargetArmor(target: CustomTarget): ArmorTarget {
  return target.kind === "marine"
    ? { kind: "marine", bullet: target.bullet, melee: target.melee, bio: target.bio }
    : {
      kind: "xeno",
      xenoArmor: target.xenoArmor,
      frontalArmor: target.frontalArmor,
      sideArmor: target.sideArmor,
      immuneToArmorPiercing: target.immuneToArmorPiercing,
    };
}

export function customTargetThresholds(target: CustomTarget): MobThresholdPair {
  const critical = target.critical != null && target.critical > 0 && target.critical < target.dead ? target.critical : null;
  return { critical, dead: target.dead };
}

// Starting point for the custom form: whatever preset is selected right now,
// so tweaking "this caste but with +10 armor" is one edit away.
export function customTargetFrom(
  armor: ArmorTarget | null,
  thresholds: MobThresholdPair | null,
  kind: "marine" | "xeno",
): CustomTarget {
  const fallback = kind === "marine" ? DEFAULT_CUSTOM_MARINE_TARGET : DEFAULT_CUSTOM_XENO_TARGET;
  if (!armor || armor.kind !== kind || !thresholds) return fallback;
  return armor.kind === "marine"
    ? { ...armor, critical: thresholds.critical, dead: thresholds.dead }
    : { ...armor, critical: thresholds.critical, dead: thresholds.dead };
}
