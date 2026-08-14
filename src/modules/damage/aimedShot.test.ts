import { describe, expect, it } from "vitest";
import {
  aimDurationSeconds,
  aimedShotAbilityFrom,
  aimedShotBonus,
  computeAimedShot,
  FOCUSED_SHOOTING,
  focusMultiplierFor,
  focusTierFor,
} from "./aimedShot";
import type { AimedShotEffectConfig } from "./aimedShot";
import { ARMOR_MODIFIER, BRUTE_DAMAGE_TYPES, resistGroup } from "./damageMath";
import type { ArmorTarget, XenoTargetArmor } from "./damageMath";

describe("aimedShotAbilityFrom / aimDurationSeconds", () => {
  it("uses AimedShotComponent's own C# defaults for a bare component (M96S via RMCBaseWeaponSniperRifle)", () => {
    const ability = aimedShotAbilityFrom({});
    expect(ability).toEqual({ aimDuration: 1.25, aimedShotCooldown: 2.5, aimDistanceDifficulty: 0.05 });
  });

  it("uses the null/undefined default for a weapon with no AimedShot ability at all", () => {
    expect(aimedShotAbilityFrom(undefined)).toEqual({ aimDuration: 1.25, aimedShotCooldown: 2.5, aimDistanceDifficulty: 0.05 });
  });

  it("keeps XM43E1's real explicit override", () => {
    const ability = aimedShotAbilityFrom({ aimDuration: 2, aimedShotCooldown: 4.5 });
    expect(ability).toEqual({ aimDuration: 2, aimedShotCooldown: 4.5, aimDistanceDifficulty: 0.05 });
  });

  it("adds aimDistanceDifficulty seconds per tile of distance", () => {
    const ability = aimedShotAbilityFrom({ aimDuration: 2, aimedShotCooldown: 4.5 });
    expect(aimDurationSeconds(ability, 10)).toBeCloseTo(2 + 10 * 0.05, 10);
  });
});

describe("focusTierFor", () => {
  it("is none for anything below VerySmallXeno (marines, and Small-tier castes like larva/parasite)", () => {
    expect(focusTierFor("Small")).toBe("none");
    expect(focusTierFor("Humanoid")).toBe("none");
  });

  it("is small for VerySmallXeno/SmallXeno", () => {
    expect(focusTierFor("VerySmallXeno")).toBe("small");
    expect(focusTierFor("SmallXeno")).toBe("small");
  });

  it("is normal for Xeno", () => {
    expect(focusTierFor("Xeno")).toBe("normal");
  });

  it("is big for Big and Immobile (Queen/Crusher/King)", () => {
    expect(focusTierFor("Big")).toBe("big");
    expect(focusTierFor("Immobile")).toBe("big");
  });
});

describe("focusMultiplierFor", () => {
  it("cycles 1 -> 0.5, 2 -> 0.75, 3 -> 1.0, matching RMCFocusedShootingSystem's counter cycle", () => {
    expect(focusMultiplierFor(1)).toBeCloseTo(0.5, 10);
    expect(focusMultiplierFor(2)).toBeCloseTo(0.75, 10);
    expect(focusMultiplierFor(3)).toBeCloseTo(1, 10);
  });
});

// Real data: CMBulletSniper10x28mm family (M96S's three magazine variants).
// M96S has no RMCFocusedShooting, so these are always flat, un-tiered bonuses.
const M96S_STANDARD: AimedShotEffectConfig = { extraHits: 2 };
const M96S_FLAK: AimedShotEffectConfig = { extraHits: 1, superSlowDuration: 14 };
const M96S_INCENDIARY: AimedShotEffectConfig = { extraHits: 0, fireStacksOnHit: 10, blindDuration: 5 };
// Real data: RMCBulletSniper10x99mmAntiMateriel (XM43E1's only round).
const XM43E1_ROUND: AimedShotEffectConfig = { extraHits: 0.8 };

describe("aimedShotBonus", () => {
  it("is the flat bullet value for a non-focused weapon (M96S) regardless of target", () => {
    expect(aimedShotBonus(M96S_STANDARD, false, null, 1)).toEqual({
      extraHits: 2,
      currentHealthDamagePercent: 0,
      blindDuration: 0,
      fireStacksOnHit: 0,
      slowDuration: 0,
      superSlowDuration: 0,
      focusTier: "none",
    });
  });

  it("passes through superSlowDuration flat for M96S's flak round", () => {
    expect(aimedShotBonus(M96S_FLAK, false, null, 1)).toMatchObject({ extraHits: 1, superSlowDuration: 14, slowDuration: 0 });
  });

  it("passes through fireStacksOnHit/blindDuration flat for M96S's incendiary round (never touched by focus shooting)", () => {
    expect(aimedShotBonus(M96S_INCENDIARY, false, null, 1)).toMatchObject({ extraHits: 0, fireStacksOnHit: 10, blindDuration: 5 });
  });

  it("has no bonus at all when the projectile carries no AimedShotEffect", () => {
    expect(aimedShotBonus(undefined, true, "Xeno", 1)).toEqual({
      extraHits: 0,
      currentHealthDamagePercent: 0,
      blindDuration: 0,
      fireStacksOnHit: 0,
      slowDuration: 0,
      superSlowDuration: 0,
      focusTier: "none",
    });
  });

  it("stays flat against a marine-sized (Humanoid) target even for a focused-shooting weapon", () => {
    expect(aimedShotBonus(XM43E1_ROUND, true, "Humanoid", 3)).toMatchObject({ extraHits: 0.8, focusTier: "none" });
  });

  it("zeroes slow/superSlow for a focused-shooting weapon (driven by stopping power instead, out of scope)", () => {
    expect(aimedShotBonus(XM43E1_ROUND, true, "Humanoid", 1)).toMatchObject({ slowDuration: 0, superSlowDuration: 0 });
  });

  it("gives the small-xeno tier a flat 0.6 extraHits/0.1 health% regardless of focus counter", () => {
    expect(aimedShotBonus(XM43E1_ROUND, true, "VerySmallXeno", 1)).toMatchObject({
      extraHits: FOCUSED_SHOOTING.bonusDamageXeno,
      currentHealthDamagePercent: FOCUSED_SHOOTING.currentHealthDamageSmallXeno,
      focusTier: "small",
    });
    expect(aimedShotBonus(XM43E1_ROUND, true, "SmallXeno", 3)).toMatchObject({
      extraHits: FOCUSED_SHOOTING.bonusDamageXeno,
      focusTier: "small",
    });
  });

  it("scales the normal xeno tier by the 1/2/3 focus cycle", () => {
    const counter1 = aimedShotBonus(XM43E1_ROUND, true, "Xeno", 1);
    expect(counter1.extraHits).toBeCloseTo(0.3, 10);
    expect(counter1.currentHealthDamagePercent).toBeCloseTo(0.1, 10);
    expect(counter1.focusTier).toBe("normal");

    const counter2 = aimedShotBonus(XM43E1_ROUND, true, "Xeno", 2);
    expect(counter2.extraHits).toBeCloseTo(0.45, 10);
    expect(counter2.currentHealthDamagePercent).toBeCloseTo(0.15, 10);

    const counter3 = aimedShotBonus(XM43E1_ROUND, true, "Xeno", 3);
    expect(counter3.extraHits).toBeCloseTo(0.6, 10);
    expect(counter3.currentHealthDamagePercent).toBeCloseTo(0.2, 10);
  });

  it("zeroes extraHits for the big-xeno tier by default (BonusDamageBigXeno=0) but still grants current-health damage", () => {
    expect(aimedShotBonus(XM43E1_ROUND, true, "Big", 3)).toMatchObject({
      extraHits: 0,
      currentHealthDamagePercent: FOCUSED_SHOOTING.currentHealthDamageBigXeno,
      focusTier: "big",
    });
  });
});

const NO_ARMOR_MARINE: ArmorTarget = { kind: "marine", bullet: 0, melee: 0, bio: 0 };
const WARRIOR_ARMOR: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: false };

describe("computeAimedShot", () => {
  it("sums the primary hit and a separately-armor-mitigated bonus hit (M96S standard round vs. unarmored marine)", () => {
    const result = computeAimedShot({
      effectiveDamage: { Piercing: 70 },
      distance: 0,
      falloffThresholds: [],
      weaponFalloffMultiplier: 1,
      armorPiercing: 50,
      weaponCategory: "bullet",
      target: NO_ARMOR_MARINE,
      effect: M96S_STANDARD,
      hasFocusedShooting: false,
      targetSize: null,
      focusCounter: 1,
      criticalThreshold: null,
    });
    // primary: 70 (no armor). bonus raw: 70*2=140, also unmitigated (no armor).
    expect(result.primaryDamage).toBe(70);
    expect(result.bonusDamage).toBe(140);
    expect(result.totalDamage).toBe(210);
  });

  it("independently armor-mitigates the primary hit and the bonus hit against real armor (oracle: resistGroup)", () => {
    const result = computeAimedShot({
      effectiveDamage: { Piercing: 56 },
      distance: 0,
      falloffThresholds: [],
      weaponFalloffMultiplier: 1,
      armorPiercing: 0,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
      effect: M96S_STANDARD,
      hasFocusedShooting: false,
      targetSize: null,
      focusCounter: 1,
      criticalThreshold: null,
    });
    const expectedPrimary = resistGroup({ Piercing: 56 }, 20, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER).Piercing;
    const expectedBonus = resistGroup({ Piercing: 112 }, 20, BRUTE_DAMAGE_TYPES, ARMOR_MODIFIER).Piercing;
    expect(result.primaryDamage).toBeCloseTo(expectedPrimary, 10);
    expect(result.bonusDamage).toBeCloseTo(expectedBonus, 10);
  });

  it("adds the current-health-damage bonus as flat Piercing before the bonus is armor-mitigated (focused, normal xeno tier)", () => {
    const result = computeAimedShot({
      effectiveDamage: { Piercing: 125 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      armorPiercing: 75,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
      hitDirection: "front",
      effect: XM43E1_ROUND,
      hasFocusedShooting: true,
      targetSize: "Xeno",
      focusCounter: 3,
      criticalThreshold: 500,
    });
    // armor 20 - AP 75 <= 0 for both hits, so nothing is mitigated.
    // primary: 125. bonus raw: 125*0.6 (extraHits, scale=1.0 at counter 3) + 500*0.2 (currentHealthDamagePercent) = 75 + 100 = 175.
    expect(result.primaryDamage).toBe(125);
    expect(result.bonusDamage).toBe(175);
    expect(result.totalDamage).toBe(300);
    expect(result.bonus.focusTier).toBe("normal");
  });

  it("drops Structural damage entirely, even inside the bonus hit (real data: XM43E1's round)", () => {
    // Same Damage-container rule as computeHitDamage: Structural is never
    // valid against a living target, and that must hold for the bonus hit's
    // raw damage (afterFalloff * extraHits) too, not just the primary hit.
    const result = computeAimedShot({
      effectiveDamage: { Piercing: 125, Structural: 1275 },
      distance: 1,
      falloffThresholds: [],
      weaponFalloffMultiplier: 0,
      armorPiercing: 75,
      weaponCategory: "bullet",
      target: WARRIOR_ARMOR,
      hitDirection: "front",
      effect: XM43E1_ROUND,
      hasFocusedShooting: false,
      targetSize: null,
      focusCounter: 1,
      criticalThreshold: null,
    });
    // armor 20 - AP 75 <= 0, nothing mitigated. primary: 125. bonus: 125*0.8=100.
    expect(result.primaryDamage).toBe(125);
    expect(result.bonusDamage).toBe(100);
  });

  it("has no bonus damage at all when the projectile carries no AimedShotEffect", () => {
    const result = computeAimedShot({
      effectiveDamage: { Piercing: 70 },
      distance: 0,
      falloffThresholds: [],
      weaponFalloffMultiplier: 1,
      armorPiercing: 0,
      weaponCategory: "bullet",
      target: NO_ARMOR_MARINE,
      effect: undefined,
      hasFocusedShooting: false,
      targetSize: null,
      focusCounter: 1,
      criticalThreshold: null,
    });
    expect(result.bonusDamage).toBe(0);
    expect(result.totalDamage).toBe(result.primaryDamage);
  });
});
