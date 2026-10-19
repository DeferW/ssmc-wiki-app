import type { DamageTypeMap, WeaponCategory } from "./damageMath";
import type { MobCatalog } from "./mobTypes";

export type AttackerSide = "marine" | "xeno";
export type SourceMode = "catalog" | "custom";
export type XenoAttackKind = "claw" | "tail";

// Custom values only distinguish what the game's armor math distinguishes:
// the Brute group (cut by bullet/melee/xeno armor) and the Burn group (cut by
// marine bio armor, ignored by xeno armor).
export type CustomWeaponStats = {
  category: WeaponCategory;
  brute: number;
  burn: number;
  armorPiercing: number;
  shotsPerSecond: number;
  magazine: number | null;
};

export type CustomXenoAttackStats = {
  attack: XenoAttackKind;
  brute: number;
  burn: number;
  armorPiercing: number;
  attacksPerSecond: number;
};

export const DEFAULT_CUSTOM_WEAPON: CustomWeaponStats = {
  category: "bullet",
  brute: 30,
  burn: 0,
  armorPiercing: 10,
  shotsPerSecond: 2,
  magazine: 30,
};

export const DEFAULT_CUSTOM_XENO_ATTACK: CustomXenoAttackStats = {
  attack: "claw",
  brute: 22.5,
  burn: 0,
  armorPiercing: 0,
  attacksPerSecond: 1,
};

// Everything the result panel needs for an attacker that isn't a catalog
// weapon: no falloff, no attachments, a flat rate.
export type AttackProfile = {
  damage: DamageTypeMap;
  armorPiercing: number;
  ratePerSecond: number;
  category: WeaponCategory;
  magazine: number | null;
  unit: "shot" | "strike";
  xenoAttack?: XenoAttackKind;
};

// Claws: MeleeDamageMultiplier on CMXenoMelee (whitelist Xeno, +0.5 bonus).
// Tail stab raises the same MeleeHitEvent (so it also gets that ×1.5) and
// then XenoSystem.TryApplyXenoSlashDamageMultiplier multiplies by
// XENO_SLASH_DAMAGE_MULT = 1.5 again for xeno-sized targets: ×2.25 in total.
export const XENO_VS_XENO_MULTIPLIER: Record<XenoAttackKind, number> = { claw: 1.5, tail: 2.25 };

function splitDamage(bruteType: string, brute: number, burn: number): DamageTypeMap {
  const result: DamageTypeMap = {};
  if (brute > 0) result[bruteType] = brute;
  if (burn > 0) result.Heat = burn;
  return result;
}

export function customWeaponProfile(stats: CustomWeaponStats): AttackProfile {
  return {
    damage: splitDamage(stats.category === "melee" ? "Slash" : "Piercing", stats.brute, stats.burn),
    armorPiercing: stats.armorPiercing,
    ratePerSecond: stats.shotsPerSecond,
    category: stats.category,
    magazine: stats.category === "bullet" ? stats.magazine : null,
    unit: stats.category === "bullet" ? "shot" : "strike",
  };
}

export function customXenoProfile(stats: CustomXenoAttackStats): AttackProfile {
  return {
    damage: splitDamage("Slash", stats.brute, stats.burn),
    armorPiercing: stats.armorPiercing,
    ratePerSecond: stats.attacksPerSecond,
    category: "melee",
    magazine: null,
    unit: "strike",
    xenoAttack: stats.attack,
  };
}

export function xenoCasteProfile(
  mobCatalog: MobCatalog | null,
  casteId: string | null,
  attack: XenoAttackKind,
): AttackProfile | null {
  const attacks = casteId ? mobCatalog?.xenoCastes[casteId]?.attacks : undefined;
  if (!attacks) return null;
  if (attack === "tail") {
    const tail = attacks.tail;
    if (!tail) return null;
    return {
      damage: { ...tail.damage },
      armorPiercing: tail.armorPiercing,
      ratePerSecond: 1 / tail.cooldownSeconds,
      category: "melee",
      magazine: null,
      unit: "strike",
      xenoAttack: "tail",
    };
  }
  const claw = attacks.claw;
  if (!claw) return null;
  return {
    damage: { ...claw.damage },
    armorPiercing: 0,
    ratePerSecond: claw.attackRate,
    category: "melee",
    magazine: null,
    unit: "strike",
    xenoAttack: "claw",
  };
}

// Xeno attacks are cut by the target's melee armor (marines) or xeno armor;
// against another xeno they first get the hive-vs-hive multiplier.
export function profileAgainstTarget(profile: AttackProfile, targetKind: "marine" | "xeno"): AttackProfile {
  if (!profile.xenoAttack || targetKind !== "xeno") return profile;
  const multiplier = XENO_VS_XENO_MULTIPLIER[profile.xenoAttack];
  const damage: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(profile.damage)) damage[type] = amount * multiplier;
  return { ...profile, damage };
}

export function hasCatalogXenoAttacks(mobCatalog: MobCatalog | null): boolean {
  return Boolean(mobCatalog && Object.values(mobCatalog.xenoCastes).some((caste) => caste.attacks?.claw));
}
