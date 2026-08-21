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

// Living targets only ever use the "Biological" (marines) or "Xeno" damage
// containers (Resources/Prototypes/Damage/containers.yml,
// _RMC14/Damage/xeno_damage_containers.yml) — both support exactly the Brute
// and Burn groups. Anything else a projectile carries (most notably
// Structural, "Exclusive for structures such as walls, airlocks and others"
// per damage-type-structural's own doc comment, e.g. XM43E1's anti-materiel
// round) is silently dropped by the container, not merely unmitigated by
// armor, so it must never contribute to a living target's damage total.
const LIVING_TARGET_DAMAGE_TYPES = new Set<string>([...BRUTE_DAMAGE_TYPES, ...BURN_DAMAGE_TYPES]);

export function filterLivingTargetDamage(damage: DamageTypeMap): DamageTypeMap {
  const result: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(damage)) {
    if (LIVING_TARGET_DAMAGE_TYPES.has(type)) result[type] = amount;
  }
  return result;
}

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
    filterLivingTargetDamage(input.effectiveDamage),
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

// GunStacksSystem (XM88 heavy rifle and any future weapon sharing the
// component): a hit-streak mechanic, not a steady-state modifier — every
// projectile that actually lands on a living target increments a counter,
// which decays if 2 seconds pass without a new hit. Verified from
// GunStacksComponent's defaults and GunStacksSystem's three handlers:
//   - OnStacksAmmoShot: this shot's armor-piercing bonus = min(maxArmorPiercingBonus,
//     increaseArmorPiercing * <hits landed BEFORE this shot>) — scales with streak length.
//   - OnStacksActiveGetGunDamageModifier: a flat +damageMultiplierBonus once any
//     hit has landed (not scaled by streak length).
//   - OnStacksActiveGetGunFireRate: fire rate is *replaced* by activeFireRate
//     (not multiplied) once any hit has landed.
// Because the calculator assumes every shot hits (no accuracy/scatter model),
// the streak simply grows by one every shot once started.
export type GunStacksConfig = {
  increaseArmorPiercing: number;
  maxArmorPiercingBonus: number;
  damageMultiplierBonus: number;
  activeFireRate: number;
};

export type OverheatConfig = {
  maxHeat: number;
  heatPerShot: number;
  cooldownRate: number;
  emergencyCooldownMultiplier: number;
  emergencyCooldownDelaySeconds: number;
};

export type HoloTargetingConfig = {
  stacksPerHit: number;
  maxStacks: number;
  decayPerSecond: number;
  decayDelaySeconds: number;
  damageMultiplierPerStack: number;
};

export type SimulatedShot = {
  index: number;
  totalDamage: number;
  cumulativeDamage: number;
  cumulativeTimeSeconds: number;
  armorPiercing: number;
  damageMultiplier: number;
  shotsPerSecond: number;
  heatAfterShot?: number;
  overheated?: boolean;
  holoStacks?: number;
  holoDamageMultiplier?: number;
};

export type EngagementSimulationInput = {
  effectiveDamage: DamageTypeMap;
  distance: number;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  baseArmorPiercing: number;
  baseDamageMultiplier: number;
  baseShotsPerSecond: number;
  weaponCategory: WeaponCategory;
  target: ArmorTarget;
  hitDirection?: HitDirection;
  gunStacks?: GunStacksConfig;
  overheat?: OverheatConfig;
  holoTargeting?: HoloTargetingConfig;
};

export type EngagementResult = {
  shots: SimulatedShot[];
  hitsToCritical: number;
  hitsToDead: number;
  timeToCriticalSeconds: number;
  timeToDeadSeconds: number;
  overheatCount: number;
};

const MAX_SIMULATED_SHOTS = 300;

// Every shot "costs" its own firing period (1/rate at the time it's fired),
// matching timeToKillSeconds' hits/shotsPerSecond convention for a constant
// rate — the two agree exactly when gunStacks is absent, since the rate never
// changes and this degenerates to hits * (1/shotsPerSecond).
export function simulateEngagement(input: EngagementSimulationInput, thresholds: MobThresholdPair): EngagementResult {
  const shots: SimulatedShot[] = [];
  let consecutiveHits = 0;
  let cumulativeDamage = 0;
  let cumulativeTimeSeconds = 0;
  let hitsToCritical = Infinity;
  let hitsToDead = Infinity;
  let timeToCriticalSeconds = Infinity;
  let timeToDeadSeconds = Infinity;
  let currentHeat = 0;
  let currentHoloStacks = 0;
  let overheatCount = 0;

  for (let index = 1; index <= MAX_SIMULATED_SHOTS; index++) {
    const stacksActive = Boolean(input.gunStacks) && consecutiveHits > 0;
    const armorPiercingBonus = input.gunStacks
      ? Math.min(input.gunStacks.maxArmorPiercingBonus, input.gunStacks.increaseArmorPiercing * consecutiveHits)
      : 0;
    const armorPiercing = input.baseArmorPiercing + armorPiercingBonus;
    const weaponDamageMultiplier = input.baseDamageMultiplier + (stacksActive ? input.gunStacks!.damageMultiplierBonus : 0);
    const shotsPerSecond = stacksActive ? input.gunStacks!.activeFireRate : input.baseShotsPerSecond;

    // ProjectileHitEvent is raised before the game applies projectile damage.
    // HoloTargeting therefore adds this projectile's stacks first, so even the
    // first HT round receives its own +damage bonus.
    if (input.holoTargeting) {
      currentHoloStacks = Math.min(
        input.holoTargeting.maxStacks,
        currentHoloStacks + input.holoTargeting.stacksPerHit,
      );
    }
    const holoDamageMultiplier = input.holoTargeting
      ? 1 + currentHoloStacks * input.holoTargeting.damageMultiplierPerStack
      : 1;
    const holoStacksForShot = input.holoTargeting ? currentHoloStacks : undefined;
    const damageMultiplier = weaponDamageMultiplier * holoDamageMultiplier;

    const weaponRatio = input.baseDamageMultiplier > 0 ? weaponDamageMultiplier / input.baseDamageMultiplier : 1;
    const scaledDamage: DamageTypeMap = {};
    for (const [type, amount] of Object.entries(input.effectiveDamage)) {
      scaledDamage[type] = amount * weaponRatio * holoDamageMultiplier;
    }

    const hit = computeHitDamage({
      effectiveDamage: scaledDamage,
      distance: input.distance,
      falloffThresholds: input.falloffThresholds,
      weaponFalloffMultiplier: input.weaponFalloffMultiplier,
      armorPiercing,
      weaponCategory: input.weaponCategory,
      target: input.target,
      hitDirection: input.hitDirection,
    });

    cumulativeDamage += hit.totalDamage;
    const firingPeriod = shotsPerSecond > 0 ? 1 / shotsPerSecond : Infinity;
    let intervalAfterShot = firingPeriod;
    let heatAfterShot: number | undefined;
    let overheated = false;
    if (input.overheat) {
      currentHeat += input.overheat.heatPerShot;
      heatAfterShot = currentHeat;
      overheated = currentHeat >= input.overheat.maxHeat;
      if (overheated) {
        overheatCount += 1;
        intervalAfterShot = Math.max(firingPeriod, input.overheat.emergencyCooldownDelaySeconds);
        currentHeat *= input.overheat.emergencyCooldownMultiplier;
      } else if (Number.isFinite(firingPeriod)) {
        currentHeat = Math.max(0, currentHeat - input.overheat.cooldownRate * firingPeriod);
      }
    }
    if (input.holoTargeting && Number.isFinite(intervalAfterShot)) {
      const decayTicks = Math.floor(
        Math.max(0, intervalAfterShot - input.holoTargeting.decayDelaySeconds) + 1e-9,
      );
      currentHoloStacks = Math.max(
        0,
        currentHoloStacks - decayTicks * input.holoTargeting.decayPerSecond,
      );
    }
    cumulativeTimeSeconds += intervalAfterShot;

    shots.push({
      index,
      totalDamage: hit.totalDamage,
      cumulativeDamage,
      cumulativeTimeSeconds,
      armorPiercing,
      damageMultiplier,
      shotsPerSecond,
      heatAfterShot,
      overheated,
      holoStacks: holoStacksForShot,
      holoDamageMultiplier: input.holoTargeting ? holoDamageMultiplier : undefined,
    });

    if (hitsToCritical === Infinity && thresholds.critical != null && cumulativeDamage >= thresholds.critical) {
      hitsToCritical = index;
      timeToCriticalSeconds = cumulativeTimeSeconds;
    }
    if (hitsToDead === Infinity && cumulativeDamage >= thresholds.dead) {
      hitsToDead = index;
      timeToDeadSeconds = cumulativeTimeSeconds;
      break;
    }

    consecutiveHits += 1;
  }

  return { shots, hitsToCritical, hitsToDead, timeToCriticalSeconds, timeToDeadSeconds, overheatCount };
}

export type AmmoNeeded = { shots: number; magazines: number | null };

export function ammoNeeded(shots: number, magazineCapacity: number | null | undefined): AmmoNeeded {
  const magazines =
    Number.isFinite(shots) && magazineCapacity != null && magazineCapacity > 0
      ? Math.ceil(shots / magazineCapacity)
      : null;
  return { shots, magazines };
}
