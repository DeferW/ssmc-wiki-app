import { describe, expect, it } from "vitest";
import {
  ammoNeeded,
  applyArmorMitigation,
  computeHitDamage,
  falloffMultiplier,
  hitsToKill,
  timeToKillSeconds,
} from "./damageMath";
import type { MarineArmor, XenoTargetArmor } from "./damageMath";

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
const WARRIOR_ARMOR: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, immuneToArmorPiercing: false };

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
    const immuneTarget: XenoTargetArmor = { kind: "xeno", xenoArmor: 20, immuneToArmorPiercing: true };
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
