import { isMap } from "../equipment/format";
import type { JsonMap } from "../equipment/types";
import type { DamageFalloffThreshold } from "./damageMath";

// Defaults from RMCProjectileDamageFalloffComponent. The catalog normally
// expands them, but this keeps calculations correct with an older catalog in
// which a bare inherited bullet component has no serialized fields.
const DEFAULT_BULLET_FALLOFF: JsonMap = {
  thresholds: [
    { range: 0, falloff: 1, ignoreModifiers: false },
    { range: 22, falloff: 9999, ignoreModifiers: true },
  ],
  minRemainingDamageMult: 0.05,
};

export function damageFalloffFrom(projectile: JsonMap | undefined): JsonMap | undefined {
  if (isMap(projectile?.damageFalloff)) return projectile.damageFalloff;
  return /bullet/i.test(String(projectile?.projectileId ?? "")) ? DEFAULT_BULLET_FALLOFF : undefined;
}

export function falloffThresholdsFrom(
  projectile: JsonMap | undefined,
  rangeFlat = 0,
): DamageFalloffThreshold[] {
  const raw = damageFalloffFrom(projectile)?.thresholds;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMap).map((entry) => ({
    range: (typeof entry.range === "number" ? entry.range : 0) + rangeFlat,
    falloff: typeof entry.falloff === "number" ? entry.falloff : 0,
    ignoreModifiers: entry.ignoreModifiers === true,
  }));
}
