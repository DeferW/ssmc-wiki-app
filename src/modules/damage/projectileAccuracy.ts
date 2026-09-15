import { isMap } from "../equipment/format";
import type { JsonMap } from "../equipment/types";

// RMCProjectileSystem.OnProjectileAccuracyPreventCollide, audited at 024d853a.
// Conditional chance on intersecting an enemy with Evasion, no cover/buffs.
export function projectileHitChance(projectile: JsonMap | undefined, multiplier: number, distance: number, rangeFlat = 0, evasion = 0): number | undefined {
  const raw = projectile?.accuracy;
  if (!isMap(raw)) return undefined;
  if (raw.forceHit === true) return 1;
  let accuracy = (typeof raw.accuracy === "number" ? raw.accuracy : 90) * Math.max(.1, multiplier);
  const thresholds = Array.isArray(raw.thresholds) ? raw.thresholds.filter(isMap) : [{range:5,falloff:10,buildup:false}];
  for (const threshold of thresholds) {
    const range = (typeof threshold.range === "number" ? threshold.range : 0) + rangeFlat;
    const falloff = typeof threshold.falloff === "number" ? threshold.falloff : 0;
    const past = distance - range;
    if (threshold.buildup === true) { if (past < 0) accuracy += falloff * past; }
    else if (past > 0) accuracy -= falloff * past;
  }
  const minimum = typeof raw.minAccuracy === "number" ? raw.minAccuracy : 5;
  return Math.min(1, Math.max(0, minimum, accuracy - evasion) / 100);
}

export type ShotOutcome = "hit" | "dodge" | "wide" | "unknown";
export function shotOutcome(angle: number, chance: number | undefined, random: number): ShotOutcome {
  // Explicit illustrative target gate, not the sprite's physical hitbox.
  if (Math.abs(530 * Math.tan(angle * Math.PI / 180)) > 55) return "wide";
  return chance == null ? "unknown" : random < chance ? "hit" : "dodge";
}
