import {
  applyArmorMitigation,
  applyRangeFalloff,
  filterLivingTargetDamage,
  type ArmorTarget,
  type DamageFalloffThreshold,
  type DamageTypeMap,
  type HitDirection,
  type WeaponCategory,
} from "./damageMath";
import type { RmcSize } from "./mobTypes";

const RMC_SIZE_ORDER: RmcSize[] = ["Small", "Humanoid", "VerySmallXeno", "SmallXeno", "Xeno", "Big", "Immobile"];

function isAtLeast(size: RmcSize, min: RmcSize): boolean {
  return RMC_SIZE_ORDER.indexOf(size) >= RMC_SIZE_ORDER.indexOf(min);
}

// AimedShotComponent's own C# defaults; RMCBaseWeaponSniperRifle gives every
// sniper the bare component, so a weapon with the ability but no explicit
// override (e.g. M96S) still needs these to compute a real aim duration.
export type AimedShotAbility = {
  aimDuration: number;
  aimedShotCooldown: number;
  aimDistanceDifficulty: number;
};

const AIMED_SHOT_DEFAULTS: AimedShotAbility = {
  aimDuration: 1.25,
  aimedShotCooldown: 2.5,
  aimDistanceDifficulty: 0.05,
};

export function aimedShotAbilityFrom(
  raw: { aimDuration?: number; aimedShotCooldown?: number; aimDistanceDifficulty?: number } | null | undefined,
): AimedShotAbility {
  return {
    aimDuration: raw?.aimDuration ?? AIMED_SHOT_DEFAULTS.aimDuration,
    aimedShotCooldown: raw?.aimedShotCooldown ?? AIMED_SHOT_DEFAULTS.aimedShotCooldown,
    aimDistanceDifficulty: raw?.aimDistanceDifficulty ?? AIMED_SHOT_DEFAULTS.aimDistanceDifficulty,
  };
}

// SharedRMCAimedShotSystem.AimedShotRequested: distance-scaled aim time before
// the shot auto-fires. Spotter/toggleable-laser multipliers aren't modeled
// (they depend on separate spotting state the calculator doesn't track).
export function aimDurationSeconds(ability: AimedShotAbility, distance: number): number {
  return ability.aimDuration + distance * ability.aimDistanceDifficulty;
}

export type AimedShotEffectConfig = {
  extraHits: number;
  fireStacksOnHit?: number;
  blindDuration?: number;
  slowDuration?: number;
  superSlowDuration?: number;
};

// RMCFocusedShootingComponent's own fixed C# defaults. Like WEAPON_GUN_STACKS'
// hardcoded XM88 constants, these are hardcoded rather than read from the
// catalog because every weapon carrying the component (currently only
// XM43E1) uses them bare, with no prototype overriding any field.
export const FOCUSED_SHOOTING = {
  baseFocusMultiplier: 0.25,
  focusMultiplier: 0.25,
  currentHealthDamageSmallXeno: 0.1,
  currentHealthDamageXeno: 0.2,
  currentHealthDamageBigXeno: 0.3,
  bonusDamageXeno: 0.6,
  bonusDamageBigXeno: 0,
};

export type FocusTier = "none" | "small" | "normal" | "big";

// AimedProjectileSystem.CalculateFocusEffects: only targets of at least
// VerySmallXeno size get any focus-shooting bonus at all (so marines, and
// Small-tier castes like larvae/parasites, never do); the "small" xeno tier
// gets a flat bonus that doesn't scale with the focus streak, "normal" and
// "big" tiers do.
export function focusTierFor(size: RmcSize): FocusTier {
  if (!isAtLeast(size, "VerySmallXeno")) return "none";
  if (isAtLeast(size, "Big")) return "big";
  if (isAtLeast(size, "Xeno")) return "normal";
  return "small";
}

// RMCFocusedShootingSystem.OnAimedShot: consecutive aimed shots landed on the
// *same* target cycle the focus counter 1 -> 2 -> 3 -> 1 -> ...; switching
// targets resets it. The multiplier scales CalculateFocusEffects' bonus for
// the "normal"/"big" tiers only.
export function focusMultiplierFor(focusCounter: number): number {
  return FOCUSED_SHOOTING.baseFocusMultiplier + FOCUSED_SHOOTING.focusMultiplier * focusCounter;
}

export type AimedShotBonus = {
  extraHits: number;
  currentHealthDamagePercent: number;
  blindDuration: number;
  fireStacksOnHit: number;
  slowDuration: number;
  superSlowDuration: number;
  focusTier: FocusTier;
};

const NO_BONUS: AimedShotBonus = {
  extraHits: 0,
  currentHealthDamagePercent: 0,
  blindDuration: 0,
  fireStacksOnHit: 0,
  slowDuration: 0,
  superSlowDuration: 0,
  focusTier: "none",
};

// AimedProjectileSystem.OnAimedProjectileHit / CalculateFocusEffects. Only
// ExtraHits and CurrentHealthDamage are ever overwritten by the focus-shooting
// ramp; BlindDuration and FireStacksOnHit always come straight from the
// bullet's own AimedShotEffectComponent regardless of focus shooting.
// SlowDuration/SuperSlowDuration are only meaningful here for weapons WITHOUT
// focused shooting -- for focused-shooting weapons the engine derives them
// from RMCStoppingPowerComponent (a separate, damage-dependent universal
// stun/knockback system), which is deliberately out of scope, the same kind
// of scoping call as the un-modeled Crusher/Vanguard shield abilities.
export function aimedShotBonus(
  effect: AimedShotEffectConfig | null | undefined,
  hasFocusedShooting: boolean,
  targetSize: RmcSize | null,
  focusCounter: number,
): AimedShotBonus {
  if (!effect) return NO_BONUS;

  const base: AimedShotBonus = {
    extraHits: effect.extraHits,
    currentHealthDamagePercent: 0,
    blindDuration: effect.blindDuration ?? 0,
    fireStacksOnHit: effect.fireStacksOnHit ?? 0,
    slowDuration: hasFocusedShooting ? 0 : effect.slowDuration ?? 0,
    superSlowDuration: hasFocusedShooting ? 0 : effect.superSlowDuration ?? 0,
    focusTier: "none",
  };
  if (!hasFocusedShooting || targetSize == null) return base;

  const tier = focusTierFor(targetSize);
  base.focusTier = tier;
  if (tier === "none") return base;

  if (tier === "small") {
    base.extraHits = FOCUSED_SHOOTING.bonusDamageXeno;
    base.currentHealthDamagePercent = FOCUSED_SHOOTING.currentHealthDamageSmallXeno;
    return base;
  }

  const scale = focusMultiplierFor(focusCounter);
  base.extraHits = (tier === "big" ? FOCUSED_SHOOTING.bonusDamageBigXeno : FOCUSED_SHOOTING.bonusDamageXeno) * scale;
  base.currentHealthDamagePercent =
    (tier === "big" ? FOCUSED_SHOOTING.currentHealthDamageBigXeno : FOCUSED_SHOOTING.currentHealthDamageXeno) * scale;
  return base;
}

export type AimedShotInput = {
  effectiveDamage: DamageTypeMap;
  distance: number;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  armorPiercing: number;
  weaponCategory: WeaponCategory;
  target: ArmorTarget;
  hitDirection?: HitDirection;
  effect: AimedShotEffectConfig | null | undefined;
  hasFocusedShooting: boolean;
  targetSize: RmcSize | null;
  focusCounter: number;
  // Target's incap (Critical) threshold at full health (0 damage taken so
  // far) -- CalculateFocusEffects computes CurrentHealthDamage as
  // (IncapThreshold - currentDamage) * percent, and the calculator doesn't
  // track ongoing damage state, so this assumes a fresh target.
  criticalThreshold: number | null;
};

export type AimedShotResult = {
  primaryDamage: number;
  bonusDamage: number;
  totalDamage: number;
  bonus: AimedShotBonus;
};

function sumDamage(damage: DamageTypeMap): number {
  return Object.values(damage).reduce((sum, value) => sum + value, 0);
}

// AimedProjectileSystem.OnAimedProjectileHit fires the aimed-shot bonus as a
// SEPARATE _damageable.TryChangeDamage call from the projectile's own normal
// hit -- both independently go through the armor pipeline, then get summed.
// The bonus's raw (pre-armor) damage is `args.Damage * ExtraHits +
// CurrentHealthDamage`, where args.Damage is the post-falloff, pre-armor
// damage of the *primary* hit (ProjectileHitEvent fires before
// TryChangeDamage applies armor for the primary hit too).
export function computeAimedShot(input: AimedShotInput): AimedShotResult {
  const afterFalloff = applyRangeFalloff(
    filterLivingTargetDamage(input.effectiveDamage),
    input.distance,
    input.falloffThresholds,
    input.weaponFalloffMultiplier,
  );
  const primaryDamage = sumDamage(
    applyArmorMitigation(afterFalloff, input.armorPiercing, input.weaponCategory, input.target, input.hitDirection),
  );

  const bonus = aimedShotBonus(input.effect, input.hasFocusedShooting, input.targetSize, input.focusCounter);
  if (!input.effect) {
    return { primaryDamage, bonusDamage: 0, totalDamage: primaryDamage, bonus };
  }

  const rawBonus: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(afterFalloff)) rawBonus[type] = amount * bonus.extraHits;
  if (bonus.currentHealthDamagePercent > 0 && input.criticalThreshold != null) {
    rawBonus.Piercing = (rawBonus.Piercing ?? 0) + input.criticalThreshold * bonus.currentHealthDamagePercent;
  }
  const bonusDamage = sumDamage(
    applyArmorMitigation(rawBonus, input.armorPiercing, input.weaponCategory, input.target, input.hitDirection),
  );

  return { primaryDamage, bonusDamage, totalDamage: primaryDamage + bonusDamage, bonus };
}
