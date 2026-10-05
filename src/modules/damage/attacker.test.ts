import { describe, expect, it } from "vitest";
import {
  customWeaponProfile,
  customXenoProfile,
  profileAgainstTarget,
  xenoCasteProfile,
} from "./attacker";
import { computeHitDamage } from "./damageMath";
import type { MobCatalog } from "./mobTypes";
import { customTargetArmor, customTargetFrom, customTargetThresholds } from "./target";

const mobCatalog = {
  schemaVersion: 1,
  source: "test",
  gameCommit: "test",
  locale: "ru-RU",
  marine: { sourcePrototypeId: "Marine", thresholds: { critical: 150, dead: 200 } },
  counts: { xenoCastes: 2 },
  xenoCastes: {
    // Real numbers from drone.yml at 024d853a.
    Drone: {
      id: "Drone", name: "Дрон", strainName: null, size: "Xeno", origin: "rmc14", sourceFile: "drone.yml", parents: [],
      thresholds: { critical: 400, dead: 500 }, maturedThresholds: null,
      armor: { xenoArmor: 0, frontalArmor: 0, sideArmor: 0, explosionArmor: 0, immuneToArmorPiercing: false },
      attacks: {
        claw: { damage: { Blunt: 7.5, Slash: 7.5, Piercing: 7.5 }, attackRate: 1 },
        tail: { damage: { Blunt: 10, Slash: 10, Piercing: 10 }, armorPiercing: 0, cooldownSeconds: 10 },
      },
      sprite: null,
    },
    Old: {
      id: "Old", name: "Старый", strainName: null, size: "Xeno", origin: "rmc14", sourceFile: "old.yml", parents: [],
      thresholds: { critical: 400, dead: 500 }, maturedThresholds: null,
      armor: { xenoArmor: 0, frontalArmor: 0, sideArmor: 0, explosionArmor: 0, immuneToArmorPiercing: false },
      sprite: null,
    },
  },
} satisfies MobCatalog;

const total = (damage: Record<string, number>) => Object.values(damage).reduce((sum, value) => sum + value, 0);

describe("xeno caste attacks", () => {
  it("reads the claw swing with its attack rate", () => {
    const profile = xenoCasteProfile(mobCatalog, "Drone", "claw")!;
    expect(total(profile.damage)).toBe(22.5);
    expect(profile.ratePerSecond).toBe(1);
    expect(profile.category).toBe("melee");
  });

  it("turns the tail stab cooldown into a rate", () => {
    const profile = xenoCasteProfile(mobCatalog, "Drone", "tail")!;
    expect(total(profile.damage)).toBe(30);
    expect(profile.ratePerSecond).toBeCloseTo(0.1);
  });

  it("is unavailable for catalogs built before attacks were exported", () => {
    expect(xenoCasteProfile(mobCatalog, "Old", "claw")).toBeNull();
    expect(xenoCasteProfile(mobCatalog, null, "claw")).toBeNull();
  });

  it("applies x1.5 for claws and x2.25 for the tail against xenos only", () => {
    const claw = xenoCasteProfile(mobCatalog, "Drone", "claw")!;
    const tail = xenoCasteProfile(mobCatalog, "Drone", "tail")!;
    expect(total(profileAgainstTarget(claw, "xeno").damage)).toBeCloseTo(33.75);
    expect(total(profileAgainstTarget(tail, "xeno").damage)).toBeCloseTo(67.5);
    expect(total(profileAgainstTarget(claw, "marine").damage)).toBe(22.5);
  });

  it("is cut by marine melee armor, not bullet armor", () => {
    const claw = xenoCasteProfile(mobCatalog, "Drone", "claw")!;
    const hit = (bullet: number, melee: number) => computeHitDamage({
      effectiveDamage: claw.damage,
      distance: 0,
      falloffThresholds: [],
      weaponFalloffMultiplier: 1,
      armorPiercing: claw.armorPiercing,
      weaponCategory: claw.category,
      target: { kind: "marine", bullet, melee, bio: 0 },
    }).totalDamage;
    expect(hit(50, 0)).toBeCloseTo(22.5);
    expect(hit(0, 20)).toBeLessThan(22.5);
  });
});

describe("custom attackers", () => {
  it("never multiplies a custom marine weapon against xenos", () => {
    const profile = customWeaponProfile({ category: "bullet", brute: 40, burn: 5, armorPiercing: 10, shotsPerSecond: 2, magazine: 30 });
    expect(profile.damage).toEqual({ Piercing: 40, Heat: 5 });
    expect(profileAgainstTarget(profile, "xeno")).toBe(profile);
    expect(profile.magazine).toBe(30);
  });

  it("drops the magazine for custom melee weapons", () => {
    const profile = customWeaponProfile({ category: "melee", brute: 40, burn: 0, armorPiercing: 0, shotsPerSecond: 1, magazine: 30 });
    expect(profile.magazine).toBeNull();
    expect(profile.unit).toBe("strike");
  });

  it("gives a custom xeno attack the multiplier of its chosen strike", () => {
    const profile = customXenoProfile({ attack: "tail", brute: 40, burn: 0, armorPiercing: 0, attacksPerSecond: 0.1 });
    expect(total(profileAgainstTarget(profile, "xeno").damage)).toBeCloseTo(90);
  });
});

describe("custom targets", () => {
  it("maps to armor and thresholds", () => {
    const target = { kind: "xeno", xenoArmor: 30, frontalArmor: 10, sideArmor: 5, immuneToArmorPiercing: true, critical: 400, dead: 500 } as const;
    expect(customTargetArmor(target)).toEqual({ kind: "xeno", xenoArmor: 30, frontalArmor: 10, sideArmor: 5, immuneToArmorPiercing: true });
    expect(customTargetThresholds(target)).toEqual({ critical: 400, dead: 500 });
  });

  it("drops a critical threshold that is not below death", () => {
    expect(customTargetThresholds({ kind: "marine", bullet: 0, melee: 0, bio: 0, critical: 300, dead: 200 }).critical).toBeNull();
  });

  it("starts from the selected preset of the same kind", () => {
    const seeded = customTargetFrom({ kind: "marine", bullet: 25, melee: 20, bio: 5 }, { critical: 150, dead: 200 }, "marine");
    expect(seeded).toEqual({ kind: "marine", bullet: 25, melee: 20, bio: 5, critical: 150, dead: 200 });
    expect(customTargetFrom({ kind: "marine", bullet: 25, melee: 20, bio: 5 }, { critical: 150, dead: 200 }, "xeno").kind).toBe("xeno");
  });
});
