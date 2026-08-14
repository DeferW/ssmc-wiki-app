import { describe, expect, it } from "vitest";
import { applyXenoAbilityBonuses, toggleXenoAbility, XENO_DEFENSIVE_ABILITIES } from "./xenoAbilities";
import type { XenoTargetArmor } from "./damageMath";

const BASE: XenoTargetArmor = { kind: "xeno", xenoArmor: 30, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: false };

describe("applyXenoAbilityBonuses", () => {
  it("leaves armor untouched when no ability is active", () => {
    expect(applyXenoAbilityBonuses(BASE, "CMXenoDefender", new Set())).toEqual(BASE);
  });

  it("leaves armor untouched for a caste with no defensive ability, even with names passed", () => {
    expect(applyXenoAbilityBonuses(BASE, "CMXenoRunner", new Set(["Укрепление"]))).toEqual(BASE);
  });

  it("applies only the base Defender's Fortify bonus when just that one is active", () => {
    const result = applyXenoAbilityBonuses(BASE, "CMXenoDefender", new Set(["Укрепление"]));
    expect(result).toEqual({ kind: "xeno", xenoArmor: 60, frontalArmor: 5, sideArmor: 0, immuneToArmorPiercing: false });
  });

  it("applies only the base Defender's Crest bonus when just that one is active", () => {
    const result = applyXenoAbilityBonuses(BASE, "CMXenoDefender", new Set(["Опустить гребень"]));
    expect(result).toEqual({ kind: "xeno", xenoArmor: 35, frontalArmor: 0, sideArmor: 0, immuneToArmorPiercing: false });
  });

  it("would sum both bonuses if both names were somehow active at once (an unreachable state — see toggleXenoAbility below, which is what actually guards this)", () => {
    const result = applyXenoAbilityBonuses(BASE, "CMXenoDefender", new Set(["Укрепление", "Опустить гребень"]));
    expect(result).toEqual({ kind: "xeno", xenoArmor: 65, frontalArmor: 5, sideArmor: 0, immuneToArmorPiercing: false });
  });

  it("applies the Steelcrest strain's smaller Fortify bonus alongside its (identical) Crest bonus", () => {
    const result = applyXenoAbilityBonuses(BASE, "CMXenoDefenderSteelcrest", new Set(["Укрепление", "Опустить гребень"]));
    expect(result).toEqual({ kind: "xeno", xenoArmor: 45, frontalArmor: 15, sideArmor: 0, immuneToArmorPiercing: false });
  });

  it("applies the Bulwark's Encased Plates trade-off (+10 frontal, -10 side, no xenoArmor change)", () => {
    const result = applyXenoAbilityBonuses(BASE, "STXenoWarriorBulwark", new Set(["Закованные пластины"]));
    expect(result).toEqual({ kind: "xeno", xenoArmor: 30, frontalArmor: 10, sideArmor: -10, immuneToArmorPiercing: false });
  });

  it("preserves immuneToArmorPiercing through the merge", () => {
    const immune: XenoTargetArmor = { ...BASE, immuneToArmorPiercing: true };
    const result = applyXenoAbilityBonuses(immune, "CMXenoDefender", new Set(["Укрепление"]));
    expect(result.immuneToArmorPiercing).toBe(true);
  });
});

describe("toggleXenoAbility", () => {
  // Real engine rule, not a UI nicety: XenoFortifySystem.OnXenoFortifyToggleCrestAttempt
  // blocks lowering the crest while Fortified, and XenoCrestSystem.OnXenoCrestFortifyAttempt
  // blocks fortifying while Lowered — the two can never both be active.
  it("turning on Fortify while Crest is active deactivates Crest", () => {
    const result = toggleXenoAbility("CMXenoDefender", new Set(["Опустить гребень"]), "Укрепление");
    expect(result).toEqual(new Set(["Укрепление"]));
  });

  it("turning on Crest while Fortify is active deactivates Fortify", () => {
    const result = toggleXenoAbility("CMXenoDefender", new Set(["Укрепление"]), "Опустить гребень");
    expect(result).toEqual(new Set(["Опустить гребень"]));
  });

  it("same exclusivity applies to the Steelcrest strain", () => {
    const result = toggleXenoAbility("CMXenoDefenderSteelcrest", new Set(["Опустить гребень"]), "Укрепление");
    expect(result).toEqual(new Set(["Укрепление"]));
  });

  it("turning an ability off doesn't disturb anything else", () => {
    const result = toggleXenoAbility("CMXenoDefender", new Set(["Укрепление"]), "Укрепление");
    expect(result).toEqual(new Set());
  });

  it("turning on an ability with no exclusions (Bulwark's single toggle) just adds it", () => {
    const result = toggleXenoAbility("STXenoWarriorBulwark", new Set(), "Закованные пластины");
    expect(result).toEqual(new Set(["Закованные пластины"]));
  });

  it("does nothing destructive for an unknown caste or ability name", () => {
    expect(toggleXenoAbility("CMXenoRunner", new Set(), "Укрепление")).toEqual(new Set(["Укрепление"]));
  });
});

describe("XENO_DEFENSIVE_ABILITIES", () => {
  it("only lists the three castes with a verified armor-number ability", () => {
    expect(Object.keys(XENO_DEFENSIVE_ABILITIES).sort()).toEqual([
      "CMXenoDefender",
      "CMXenoDefenderSteelcrest",
      "STXenoWarriorBulwark",
    ]);
  });

  it("lists both of the Defender's independent toggles", () => {
    expect(XENO_DEFENSIVE_ABILITIES.CMXenoDefender.map((ability) => ability.name)).toEqual([
      "Укрепление",
      "Опустить гребень",
    ]);
  });
});
