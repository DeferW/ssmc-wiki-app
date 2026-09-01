import { isMap } from "../equipment/format";
import type { CatalogItem, JsonMap } from "../equipment/types";
import { computeHitDamage } from "./damageMath";

const TEST_TARGET = { kind: "marine", bullet: 0, melee: 0, bio: 0 } as const;

function damageMap(value: unknown) {
  if (!isMap(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function projectileDamagesTarget(projectile: JsonMap, mode?: JsonMap) {
  const result = computeHitDamage({
    effectiveDamage: damageMap(mode?.damage ?? projectile.effectiveDamage ?? projectile.damage),
    distance: 0,
    falloffThresholds: [],
    weaponFalloffMultiplier: 1,
    armorPiercing: typeof mode?.armorPiercing === "number"
      ? mode.armorPiercing
      : typeof projectile.armorPiercing === "number" ? projectile.armorPiercing : 0,
    weaponCategory: "bullet",
    target: TEST_TARGET,
  });
  return result.totalDamage > 0;
}

/** Uses the same living-target damage path as the result panel. */
export function canDamageAnyTarget(item: CatalogItem) {
  const stats = item.weaponStats;
  if (!isMap(stats)) return false;
  const ammunition = Array.isArray(stats.ammunition) ? stats.ammunition.filter(isMap) : [];
  const modes = Array.isArray(stats.ammoModes) ? stats.ammoModes.filter(isMap) : [];

  for (const ammo of ammunition) {
    const projectiles = Array.isArray(ammo.projectiles) ? ammo.projectiles.filter(isMap) : [];
    for (const projectile of projectiles) {
      if (!modes.length && projectileDamagesTarget(projectile)) return true;
      if (modes.some((mode) => projectileDamagesTarget(projectile, mode))) return true;
    }
  }
  return false;
}
