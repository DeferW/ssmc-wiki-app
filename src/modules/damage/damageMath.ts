import type { MobThresholdPair } from "./mobTypes";

export type DamageTypeMap = Record<string, number>;

export type DamageFalloffThreshold = {
  range: number;
  falloff: number;
  ignoreModifiers?: boolean;
};

export type WeaponCategory = "bullet" | "melee";

export type MarineArmor = { kind: "marine"; bullet: number; melee: number; bio: number };
export type XenoTargetArmor = {
  kind: "xeno";
  xenoArmor: number;
  frontalArmor: number;
  sideArmor: number;
  immuneToArmorPiercing: boolean;
};
export type ArmorTarget = MarineArmor | XenoTargetArmor;

// CMArmorSystem.OnDamageModify: cardinal direction from the shooter to the
// xeno vs. the xeno's own facing. Marines never read Frontal/SideArmor
// through this code path — direction only ever matters for xeno targets.
export type HitDirection = "front" | "side" | "back";

// RMCArmorModifierComponent default; no prototype in the game data overrides it.
export const ARMOR_MODIFIER = 4;
// MobThresholdsComponent-independent floor: a falloff-heavy hit can never drop
// below this fraction of the pre-falloff damage, no matter how far past range.
export const MIN_REMAINING_DAMAGE_MULT = 0.05;

export const BRUTE_DAMAGE_TYPES = ["Blunt", "Slash", "Piercing"] as const;
export const BURN_DAMAGE_TYPES = ["Heat", "Shock", "Cold", "Caustic"] as const;

function sumDamage(damage: DamageTypeMap): number {
  return Object.values(damage).reduce((sum, value) => sum + value, 0);
}

export function falloffMultiplier(
  originalTotalDamage: number,
  distance: number,
  thresholds: DamageFalloffThreshold[],
  weaponFalloffMultiplier: number,
): number {
  if (originalTotalDamage <= 0) return 1;

  const minDamage = originalTotalDamage * MIN_REMAINING_DAMAGE_MULT;
  let currentTotal = originalTotalDamage;
  let combined = 1;

  for (const threshold of thresholds) {
    const pastEffectiveRange = distance - threshold.range;
    if (pastEffectiveRange <= 0) continue;
    if (currentTotal <= minDamage) break;

    const extraMult = threshold.ignoreModifiers ? 1 : weaponFalloffMultiplier;
    const minMult = Math.min(minDamage / currentTotal, 1);
    const rawMult = (currentTotal - pastEffectiveRange * threshold.falloff * extraMult) / currentTotal;
    const mult = Math.min(Math.max(rawMult, minMult), 1);

    combined *= mult;
    currentTotal *= mult;
  }

  return combined;
}

export function applyRangeFalloff(
  damage: DamageTypeMap,
  distance: number,
  thresholds: DamageFalloffThreshold[],
  weaponFalloffMultiplier: number,
): DamageTypeMap {
  const mult = falloffMultiplier(sumDamage(damage), distance, thresholds, weaponFalloffMultiplier);
  const result: DamageTypeMap = {};
  for (const [type, value] of Object.entries(damage)) {
    result[type] = value * mult;
  }
  return result;
}

// One CMArmorSystem.Resist() call. The stage-2 "weak hit" clamp compares against
// the running total across the WHOLE damage map (not just this group), so when
// marine targets run this twice (Brute then Burn) call order matters.
export function resistGroup(
  damage: DamageTypeMap,
  armorValue: number,
  groupTypes: readonly string[],
  armorModifier: number,
): DamageTypeMap {
  const armor = Math.max(armorValue, 0);
  if (armor <= 0) return { ...damage };

  const resist = Math.pow(1.1, armor / 5);
  const groupSet = new Set<string>(groupTypes);
  const result: DamageTypeMap = { ...damage };

  for (const [type, amount] of Object.entries(result)) {
    if (groupSet.has(type) && amount > 0) {
      result[type] = amount / resist;
    }
  }

  const newTotal = sumDamage(result);
  if (newTotal !== 0 && newTotal < armor * 2) {
    const damageWithArmor = Math.max(0, newTotal * armorModifier - armor);
    for (const [type, amount] of Object.entries(result)) {
      if (groupSet.has(type) && amount > 0) {
        result[type] = (amount * damageWithArmor) / (newTotal * armorModifier);
      }
    }
  }

  return result;
}

export function applyArmorMitigation(
  damage: DamageTypeMap,
  armorPiercing: number,
  weaponCategory: WeaponCategory,
  target: ArmorTarget,
  hitDirection: HitDirection = "front",
): DamageTypeMap {
  if (target.kind === "xeno") {
    // Verified engine quirk: immuneToArmorPiercing only ever takes effect for
    // xeno targets — a marine's worn-armor ImmuneToAP flag is never consulted
    // through this code path, so it is intentionally not modeled for marines.
    const piercing = target.immuneToArmorPiercing ? 0 : armorPiercing;
    // Order matters and is verified from source: piercing is subtracted from
    // the base armor first, the directional bonus is added on top of that
    // (unaffected by piercing), and only the combined total is floored at 0 —
    // a heavily-pierced xeno can still be dragged back above zero by a frontal
    // plate bonus.
    const directional = hitDirection === "front" ? target.frontalArmor
      : hitDirection === "side" ? target.sideArmor
      : 0;
    const armor = Math.max(target.xenoArmor - piercing + directional, 0);
    // Xenos only ever resist the Brute group; Burn-type damage (e.g. incendiary
    // Heat) passes through xeno armor completely unmitigated.
    return resistGroup(damage, armor, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER);
  }

  const bruteSource = weaponCategory === "melee" ? target.melee : target.bullet;
  const bruteArmor = Math.max(bruteSource - armorPiercing, 0);
  const afterBrute = resistGroup(damage, bruteArmor, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER);

  const bioArmor = Math.max(target.bio - armorPiercing, 0);
  return resistGroup(afterBrute, bioArmor, BURN_DAMAGE_TYPES, ARMOR_MODIFIER);
}

export type HitDamageInput = {
  effectiveDamage: DamageTypeMap;
  distance: number;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  armorPiercing: number;
  weaponCategory: WeaponCategory;
  target: ArmorTarget;
  hitDirection?: HitDirection;
};

export type HitDamageResult = {
  perTypeDamage: DamageTypeMap;
  totalDamage: number;
  preArmorTotal: number;
};

export function computeHitDamage(input: HitDamageInput): HitDamageResult {
  const afterFalloff = applyRangeFalloff(
    input.effectiveDamage,
    input.distance,
    input.falloffThresholds,
    input.weaponFalloffMultiplier,
  );
  const preArmorTotal = sumDamage(afterFalloff);
  const afterArmor = applyArmorMitigation(
    afterFalloff,
    input.armorPiercing,
    input.weaponCategory,
    input.target,
    input.hitDirection,
  );
  return {
    perTypeDamage: afterArmor,
    totalDamage: sumDamage(afterArmor),
    preArmorTotal,
  };
}

export type KillCondition = "critical" | "dead";

export function hitsToKill(
  perHitDamage: number,
  thresholds: MobThresholdPair,
  killAt: KillCondition,
): number {
  const target = killAt === "critical" ? thresholds.critical : thresholds.dead;
  if (target == null || perHitDamage <= 0) return Infinity;
  return Math.ceil(target / perHitDamage);
}

export function timeToKillSeconds(hits: number, shotsPerSecond: number): number {
  if (!Number.isFinite(hits) || shotsPerSecond <= 0) return Infinity;
  return hits / shotsPerSecond;
}

export type AmmoNeeded = { shots: number; magazines: number | null };

export function ammoNeeded(shots: number, magazineCapacity: number | null | undefined): AmmoNeeded {
  const magazines =
    Number.isFinite(shots) && magazineCapacity != null && magazineCapacity > 0
      ? Math.ceil(shots / magazineCapacity)
      : null;
  return { shots, magazines };
}
