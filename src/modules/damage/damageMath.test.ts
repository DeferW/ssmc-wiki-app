import { describe, expect, it } from "vitest";
import {
  ammoNeeded,
  applyArmorMitigation,
  ARMOR_MODIFIER,
  BRUTE_DAMAGE_TYPES,
  computeHitDamage,
  falloffMultiplier,
  filterLivingTargetDamage,
  hitsToKill,
  resistGroup,
  simulateEngagement,
  timeToKillSeconds,
} from "./damageMath";
import type { GunStacksConfig, MarineArmor, XenoTargetArmor } from "./damageMath";

// Verified against BulletRifle10x24mm / WeaponRifleM4SPR data pulled from the
// real equipment-catalog.json: effectiveDamage.Piercing = 56, weapon
// falloffMultiplier = 0, thresholds [{range:24, falloff:9999, ignoreModifiers:
// true}, {range:7, falloff:4}].
const AR10_THRESHOLDS = [
  { range: 24, falloff: 9999, ignoreModifiers: true },
  { range: 7, falloff: 4 },
];

describe("falloffMultiplier", () => {
  it("is 1 when no threshold has been crossed", () => {
    expect(falloffMultiplier(56, 5, AR10_THRESHOLDS, 0)).toBe(1);
  });

  it("stays 1 past the ramping threshold when the weapon's falloff multiplier is 0", () => {
    // This weapon zeroes out normal ramping falloff, relying only on the
    // ignoreModifiers threshold as a hard cutoff.
    expect(falloffMultiplier(56, 15, AR10_THRESHOLDS, 0)).toBe(1);
  });

  it("clamps to the 5% floor past the hard ignoreModifiers cutoff", () => {
    expect(falloffMultiplier(56, 30, AR10_THRESHOLDS, 0)).toBeCloseTo(0.05, 10);
  });

  it("applies normal ramping falloff when the weapon's multiplier is nonzero", () => {
    const thresholds = [{ range: 10, falloff: 5 }];
    // distance 15: pastEffectiveRange 5, extraMult 1 -> (100 - 5*5*1)/100 = 0.75
    expect(falloffMultiplier(100, 15, thresholds, 1)).toBeCloseTo(0.75, 10);
  });

  it("returns 1 for non-positive input damage", () => {
    expect(falloffMultiplier(0, 100, AR10_THRESHOLDS, 1)).toBe(1);
  });
});

const HELMET_ARMOR: MarineArmor = { kind: "marine", bullet: 20, melee: 20, bio: 20 };
const WARRIOR_ARMOR: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: false };
// Real data: RMCXenoCrusherCharger (crusher "Charger" strain) — one of the
// few castes with nonzero base frontal/side armor even without any ability
// toggle, so it's a real verification case, not a synthetic one.
const CHARGER_ARMOR: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, frontalArmor: 30, sideArmor: 15, immuneToArmorPiercing: false };

describe("applyArmorMitigation", () => {
  it("matches the verified two-stage Resist formula for a marine target", () => {
    // armor after piercing: 20 - 5 = 15; resist = 1.1^(15/5) = 1.331
    // 56 / 1.331 = 42.0736...; total (42.07) is above armor*2 (30), stage 2 doesn't fire.
    const result = applyArmorMitigation({ Piercing: 56 }, 5, "bullet", HELMET_ARMOR);
    expect(result.Piercing).toBeCloseTo(56 / 1.331, 6);
  });

  it("matches the same Resist formula for a xeno target's innate armor", () => {
    const result = applyArmorMitigation({ Piercing: 56 }, 5, "bullet", WARRIOR_ARMOR);
    expect(result.Piercing).toBeCloseTo(56 / 1.331, 6);
  });

  it("mitigates marine Heat damage through the bio stat but leaves xeno Heat untouched", () => {
    // This is the easiest spot to silently get wrong: xenos only ever resist
    // the Brute group, so Burn-type damage (Heat/Shock/Cold/Caustic) passes
    // straight through their armor, while marines resist it via `bio`.
    const marineResult = applyArmorMitigation(
      { Piercing: 50, Heat: 10 },
      0,
      "bullet",
      HELMET_ARMOR,
    );
    const xenoResult = applyArmorMitigation(
      { Piercing: 50, Heat: 10 },
      0,
      "bullet",
      WARRIOR_ARMOR,
    );

    expect(marineResult.Heat).toBeCloseTo(10 / 1.4641, 6);
    expect(xenoResult.Heat).toBe(10);
  });

  it("ignores armor piercing for a xeno target that is immune to it", () => {
    const immuneTarget: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: true };
    const withoutPiercing = applyArmorMitigation({ Piercing: 56 }, 0, "bullet", immuneTarget);
    const withPiercing = applyArmorMitigation({ Piercing: 56 }, 5, "bullet", immuneTarget);
    expect(withPiercing.Piercing).toBeCloseTo(withoutPiercing.Piercing, 10);
  });

  it("uses melee armor instead of bullet armor for melee weapons", () => {
    const lopsided: MarineArmor = { kind: "marine", bullet: 0, melee: 20, bio: 0 };
    const bulletHit = applyArmorMitigation({ Piercing: 56 }, 0, "bullet", lopsided);
    const meleeHit = applyArmorMitigation({ Piercing: 56 }, 0, "melee", lopsided);
    expect(bulletHit.Piercing).toBe(56);
    // Stage 1: 56 / 1.1^4 = 38.2488. That total is below armor*2 (40), so the
    // stage-2 clamp also fires: (38.2488*4 - 20) / 4 = 38.2488 - 5 = 33.2488.
    expect(meleeHit.Piercing).toBeCloseTo(56 / 1.4641 - 5, 6);
  });

  it("returns damage unchanged when armor is zero or negative after piercing", () => {
    const noArmor: MarineArmor = { kind: "marine", bullet: 5, melee: 0, bio: 0 };
    const result = applyArmorMitigation({ Piercing: 56 }, 10, "bullet", noArmor);
    expect(result.Piercing).toBe(56);
  });

  it("defaults to a frontal hit when no direction is given", () => {
    const explicit = applyArmorMitigation({ Piercing: 100 }, 0, "bullet", CHARGER_ARMOR, "front");
    const implicit = applyArmorMitigation({ Piercing: 100 }, 0, "bullet", CHARGER_ARMOR);
    expect(implicit).toEqual(explicit);
  });

  it("adds frontalArmor on a frontal hit and sideArmor on a side hit, but nothing on a back hit", () => {
    // armor: front 20+30=50, side 20+15=35, back 20+0=20. resistGroup is
    // independently verified above, so it's used as the oracle here instead
    // of re-deriving the two-stage formula by hand for three cases at once.
    const front = applyArmorMitigation({ Piercing: 100 }, 0, "bullet", CHARGER_ARMOR, "front");
    const side = applyArmorMitigation({ Piercing: 100 }, 0, "bullet", CHARGER_ARMOR, "side");
    const back = applyArmorMitigation({ Piercing: 100 }, 0, "bullet", CHARGER_ARMOR, "back");
    expect(front).toEqual(resistGroup({ Piercing: 100 }, 50, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER));
    expect(side).toEqual(resistGroup({ Piercing: 100 }, 35, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER));
    expect(back).toEqual(resistGroup({ Piercing: 100 }, 20, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER));
    // Frontal armor is the real "weak spot vs. strong spot" ordering.
    expect(front.Piercing).toBeLessThan(side.Piercing);
    expect(side.Piercing).toBeLessThan(back.Piercing);
  });

  it("subtracts piercing before adding the directional bonus, not after — matches CMArmorSystem's operation order", () => {
    // xenoArmor(20) - piercing(40) = -20 first, THEN +30 frontal = 10 (not
    // clamped to 0 before the bonus is added, which would floor it at 30).
    const result = applyArmorMitigation({ Piercing: 100 }, 40, "bullet", CHARGER_ARMOR, "front");
    expect(result).toEqual(resistGroup({ Piercing: 100 }, 10, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER));
  });
});

describe("computeHitDamage", () => {
  it("combines falloff and armor in one call", () => {
    const result = computeHitDamage({
      effectiveDamage: { Piercing: 56 },
      distance: 5,
      falloffThresholds: AR10_THRESHOLDS,
      weaponFalloffMultiplier: 0,
      armorPiercing: 5,
      weaponCategory: "bullet",
      target: HELMET_ARMOR,
    });
    expect(result.preArmorTotal).toBe(56);
    expect(result.totalDamage).toBeCloseTo(56 / 1.331, 6);
  });

  it("drops Structural damage entirely against living targets (real data: XM43E1's round)", () => {
    // Resources/Prototypes/Damage/containers.yml + xeno_damage_containers.yml:
    // marines use the "Biological" container, xenos use "Xeno" -- neither
    // supports Structural (damage-type-structural: "Exclusive for structures
    // such as walls, airlocks and others"), so it must never contribute to a
    // living target's damage total, not merely pass through unmitigated.
    const marineResult = computeHitDamage({
      effectiveDamage: { Piercing: 125, Structural: 1275 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      armorPiercing: 0,
      weaponCategory: "bullet",
      target: HELMET_ARMOR,
    });
    const xenoResult = computeHitDamage({
      effectiveDamage: { Piercing: 125, Structural: 1275 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      armorPiercing: 0,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    });
    expect(marineResult.preArmorTotal).toBe(125);
    expect(xenoResult.preArmorTotal).toBe(125);
  });
});

describe("filterLivingTargetDamage", () => {
  it("keeps Brute and Burn types, drops everything else", () => {
    expect(filterLivingTargetDamage({ Piercing: 125, Structural: 1275, Heat: 10 })).toEqual({
      Piercing: 125,
      Heat: 10,
    });
  });

  it("is a no-op when every type is already Brute/Burn", () => {
    expect(filterLivingTargetDamage({ Blunt: 10, Slash: 5 })).toEqual({ Blunt: 10, Slash: 5 });
  });
});

// Real data: WeaponRifleXM88 (XM88 heavy rifle) — the only weapon with a
// GunStacksComponent. Component defaults, verified from
// GunStacksComponent.cs: increaseArmorPiercing=10, maxArmorPiercingBonus=50,
// damageMultiplierBonus=0.2 (flat, not per-hit), activeFireRate=1.4285
// (a hard replacement, not a multiplier).
const XM88_STACKS: GunStacksConfig = {
  increaseArmorPiercing: 10,
  maxArmorPiercingBonus: 50,
  damageMultiplierBonus: 0.2,
  activeFireRate: 1.4285,
};
const NO_FALLOFF_AT_DISTANCE_1: never[] = [];

describe("simulateEngagement", () => {
  it("combines every projectile in a shotgun shell after per-projectile armor mitigation", () => {
    const perProjectile = computeHitDamage({
      effectiveDamage: { Piercing: 65 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      armorPiercing: 5,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }).totalDamage;

    const result = simulateEngagement({
      effectiveDamage: { Piercing: 65 },
      projectilesPerShot: 4,
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 5,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 1,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }, { critical: 500, dead: 600 });

    expect(result.shots[0].totalDamage).toBeCloseTo(perProjectile * 4, 10);
    expect(result.hitsToDead).toBe(Math.ceil(600 / (perProjectile * 4)));
  });

  it("matches hitsToKill/timeToKillSeconds exactly when there is no gunStacks config (constant rate)", () => {
    // Real data: RMCWeaponRifleM54C (M41A MK2) vs. a base Warrior, no
    // attachments — effectiveDamage.Piercing=44, armorPiercing=5,
    // damageMultiplier=1.1 (base == modified, nothing folding it), shotsPerSecond=4.
    const perHitDamage = computeHitDamage({
      effectiveDamage: { Piercing: 44 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      armorPiercing: 5,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }).totalDamage;
    const thresholds = { critical: 500, dead: 600 };
    const expectedHitsDead = hitsToKill(perHitDamage, thresholds, "dead");
    const expectedHitsCritical = hitsToKill(perHitDamage, thresholds, "critical");

    const result = simulateEngagement({
      effectiveDamage: { Piercing: 44 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 5,
      baseDamageMultiplier: 1.1,
      baseShotsPerSecond: 4,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }, thresholds);

    expect(result.hitsToDead).toBe(expectedHitsDead);
    expect(result.hitsToCritical).toBe(expectedHitsCritical);
    expect(result.timeToDeadSeconds).toBeCloseTo(timeToKillSeconds(expectedHitsDead, 4), 10);
    expect(result.timeToCriticalSeconds).toBeCloseTo(timeToKillSeconds(expectedHitsCritical, 4), 10);
    // Every shot has identical stats when there's no stacking mechanic.
    expect(result.shots.every((shot) => shot.armorPiercing === 5 && shot.damageMultiplier === 1.1 && shot.shotsPerSecond === 4)).toBe(true);
  });

  it("ramps armor-piercing per consecutive hit and flips damage/fire-rate once active, matching GunStacksSystem", () => {
    // Real data: WeaponRifleXM88 vs. a base Warrior (xenoArmor=20) at
    // point-blank (no falloff). effectiveDamage.Piercing=80, armorPiercing=10,
    // damageMultiplier=1, shotsPerSecond=1 (all real catalog values).
    const thresholds = { critical: 500, dead: 600 };
    const result = simulateEngagement({
      effectiveDamage: { Piercing: 80 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 10,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 1,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
      gunStacks: XM88_STACKS,
    }, thresholds);

    // Shot 1: cold gun — 0 prior hits, so no armor-piercing bonus, base
    // multiplier, base fire rate.
    const shot1 = computeHitDamage({
      effectiveDamage: { Piercing: 80 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      armorPiercing: 10,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }).totalDamage;
    expect(result.shots[0]).toMatchObject({ armorPiercing: 10, damageMultiplier: 1, shotsPerSecond: 1 });
    expect(result.shots[0].totalDamage).toBeCloseTo(shot1, 10);

    // Shot 2: 1 prior hit — +10 armor-piercing (10*1), the flat +0.2 damage
    // bonus is now active, and fire rate is replaced by activeFireRate.
    const shot2 = computeHitDamage({
      effectiveDamage: { Piercing: 80 * 1.2 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      armorPiercing: 20,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
    }).totalDamage;
    expect(result.shots[1]).toMatchObject({ armorPiercing: 20, damageMultiplier: 1.2, shotsPerSecond: 1.4285 });
    expect(result.shots[1].totalDamage).toBeCloseTo(shot2, 10);

    // Armor-piercing bonus caps at maxArmorPiercingBonus (50) from the 6th
    // shot onward (5 prior consecutive hits * 10 = 50).
    expect(result.shots[4].armorPiercing).toBe(50); // 4 prior hits * 10 = 40 bonus
    expect(result.shots[5].armorPiercing).toBe(60); // 5 prior hits * 10 = 50 bonus, at the cap
    expect(result.shots[6]?.armorPiercing).toBe(60); // 6 prior hits: still capped at 50

    // Once xenoArmor(20) - armorPiercing <= 0, the target is fully pierced
    // and takes the raw (already stacked) damage with no mitigation at all.
    expect(result.shots[1].totalDamage).toBe(80 * 1.2);

    expect(result.hitsToCritical).toBe(6);
    expect(result.hitsToDead).toBe(7);
  });

  it("stops simulating once the dead threshold is crossed", () => {
    const result = simulateEngagement({
      effectiveDamage: { Piercing: 80 },
      distance: 1,
      falloffThresholds: NO_FALLOFF_AT_DISTANCE_1,
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 10,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 1,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
      gunStacks: XM88_STACKS,
    }, { critical: 500, dead: 600 });
    expect(result.shots.length).toBe(result.hitsToDead);
  });

  it("adds the emergency pause when a continuous burst overheats", () => {
    const result = simulateEngagement({
      effectiveDamage: { Piercing: 1 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 0,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 10,
      weaponCategory: "bullet",
      target: { kind: "marine", bullet: 0, melee: 0, bio: 0 },
      overheat: {
        maxHeat: 40,
        heatPerShot: 1,
        cooldownRate: 0,
        emergencyCooldownMultiplier: 0.375,
        emergencyCooldownDelaySeconds: 1,
      },
    }, { critical: null, dead: 45 });

    expect(result.hitsToDead).toBe(45);
    expect(result.overheatCount).toBe(1);
    expect(result.shots[39]).toMatchObject({ overheated: true, heatAfterShot: 40 });
    expect(result.timeToDeadSeconds).toBeCloseTo(5.4, 10);
  });

  it("applies HT stacks before each hit and caps the universal damage bonus", () => {
    const result = simulateEngagement({
      effectiveDamage: { Piercing: 100 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 0,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 10,
      weaponCategory: "bullet",
      target: { kind: "marine", bullet: 0, melee: 0, bio: 0 },
      holoTargeting: {
        stacksPerHit: 10,
        maxStacks: 100,
        decayPerSecond: 5,
        decayDelaySeconds: 5,
        damageMultiplierPerStack: 0.001,
      },
    }, { critical: null, dead: 2_000 });

    expect(result.shots[0]).toMatchObject({ totalDamage: 101, holoStacks: 10, holoDamageMultiplier: 1.01 });
    expect(result.shots[1]).toMatchObject({ totalDamage: 102, holoStacks: 20, holoDamageMultiplier: 1.02 });
    expect(result.shots[9]).toMatchObject({ holoStacks: 100, holoDamageMultiplier: 1.1 });
    expect(result.shots[9].totalDamage).toBeCloseTo(110, 10);
    expect(result.shots[10]).toMatchObject({ holoStacks: 100, holoDamageMultiplier: 1.1 });
    expect(result.shots[10].totalDamage).toBeCloseTo(110, 10);
  });

  it("decays HT stacks after five seconds without another hit", () => {
    const result = simulateEngagement({
      effectiveDamage: { Piercing: 100 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      baseArmorPiercing: 0,
      baseDamageMultiplier: 1,
      baseShotsPerSecond: 0.1,
      weaponCategory: "bullet",
      target: { kind: "marine", bullet: 0, melee: 0, bio: 0 },
      holoTargeting: {
        stacksPerHit: 10,
        maxStacks: 100,
        decayPerSecond: 5,
        decayDelaySeconds: 5,
        damageMultiplierPerStack: 0.001,
      },
    }, { critical: null, dead: 202 });

    expect(result.shots[0]).toMatchObject({ totalDamage: 101, holoStacks: 10 });
    expect(result.shots[1]).toMatchObject({ totalDamage: 101, holoStacks: 10 });
  });
});

describe("hitsToKill", () => {
  it("rounds up to a whole number of hits", () => {
    expect(hitsToKill(30, { critical: 150, dead: 200 }, "dead")).toBe(7);
  });

  it("is Infinity when the target has no critical stage", () => {
    expect(hitsToKill(30, { critical: null, dead: 35 }, "critical")).toBe(Infinity);
  });

  it("is Infinity for zero or negative per-hit damage", () => {
    expect(hitsToKill(0, { critical: 150, dead: 200 }, "dead")).toBe(Infinity);
  });
});

describe("timeToKillSeconds", () => {
  it("divides hits by the fire rate", () => {
    expect(timeToKillSeconds(7, 2.86)).toBeCloseTo(2.4476, 3);
  });

  it("is Infinity when hits is already Infinity", () => {
    expect(timeToKillSeconds(Infinity, 2.86)).toBe(Infinity);
  });
});

describe("ammoNeeded", () => {
  it("rounds up to whole magazines when capacity is known", () => {
    expect(ammoNeeded(7, 25)).toEqual({ shots: 7, magazines: 1 });
    expect(ammoNeeded(30, 25)).toEqual({ shots: 30, magazines: 2 });
  });

  it("has no magazine count when capacity is unknown", () => {
    expect(ammoNeeded(7, null)).toEqual({ shots: 7, magazines: null });
    expect(ammoNeeded(7, undefined)).toEqual({ shots: 7, magazines: null });
  });
});
