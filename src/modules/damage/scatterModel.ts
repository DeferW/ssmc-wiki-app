import { isMap } from "../equipment/format";
import type { CatalogItem, JsonMap } from "../equipment/types";
import type { RangedModifierEntry } from "./attachmentModifiers";

export type FireMode = "SemiAuto" | "Burst" | "FullAuto";
export type Ballistics = {
  schemaVersion: number; rulesCommit: string; availableModes: FireMode[]; defaultMode: FireMode;
  scatter: number; increase: number; decay: number; recoil: number;
  burstScatterMultiplier: number; fireRate: number; burstRateMultiplier: number; burstSize: number;
  modes: Record<FireMode, { extraScatter: number; scaleExtraScatter: boolean; shotsToMax: number | null; fireDelay: number }>;
  unsupported: string[];
};
export type ScatterModel = {
  minimum: number; maximum: number; increase: number; decay: number;
  pelletSpread: number; pellets: number; recoil: number; fireRate: number; burstSize: number;
};
export function ballisticsFrom(weapon: CatalogItem | null): Ballistics | undefined {
  const value = weapon?.weaponStats?.ballistics;
  if (!isMap(value) || value.schemaVersion !== 1 || !Array.isArray(value.availableModes) || !isMap(value.modes)) return;
  const fields = ["scatter", "increase", "decay", "recoil", "burstScatterMultiplier", "fireRate", "burstRateMultiplier", "burstSize"];
  if (fields.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) return;
  return value as unknown as Ballistics;
}
export function scatterModel(config: Ballistics, mode: FireMode, entries: RangedModifierEntry[], projectile?: JsonMap): ScatterModel {
  const mods = config.modes[mode];
  const burstMultiplier = entries.reduce((value, entry) => value + (entry.burstScatterAddMult ?? 0), config.burstScatterMultiplier);
  const extra = Math.max(0, mods.extraScatter * (mods.scaleExtraScatter ? burstMultiplier : 1));
  let minimum = config.scatter;
  let maximum = minimum + extra;
  const increase = mods.shotsToMax != null && mods.shotsToMax > 0 ? extra / mods.shotsToMax : config.increase;
  let recoil = config.recoil;
  const pellets = typeof projectile?.projectilesPerShot === "number" ? Math.max(1, Math.floor(projectile.projectilesPerShot)) : 1;
  let pelletSpread = pellets > 1 && typeof projectile?.spreadDegrees === "number" ? projectile.spreadDegrees : 0;
  let burstSize = config.burstSize;
  let delay = 1 / (config.fireRate * (mode === "Burst" ? config.burstRateMultiplier : 1)) + mods.fireDelay;
  for (const entry of entries) {
    minimum = Math.max(0, minimum + (entry.scatterFlat ?? 0));
    maximum = Math.max(minimum, maximum + (entry.scatterFlat ?? 0));
    recoil = Math.max(0, recoil + (entry.recoilFlat ?? 0));
    pelletSpread = Math.max(0, pelletSpread + (entry.scatterFlat ?? 0) / 2);
    burstSize = Math.max(1, burstSize + (entry.shotsPerBurstFlat ?? 0));
    delay += (entry.fireDelayFlat ?? 0) / (mode === "Burst" ? 2 : 1);
  }
  return { minimum, maximum, increase, decay: config.decay, pellets, pelletSpread: pellets > 1 ? pelletSpread : 0,
    recoil, fireRate: delay > 0 ? 1 / delay : 0, burstSize: Math.max(1, burstSize) };
}
// SharedGunSystem.GetRecoilAngle increments BEFORE choosing a uniform angle.
export function nextScatter(model: ScatterModel, previous: number, elapsedSeconds = 0): number {
  return Math.max(model.minimum, Math.min(model.maximum, previous + model.increase - model.decay * elapsedSeconds));
}
export function shotAngles(model: ScatterModel, scatter: number, random: number): number[] {
  // ProjectileSpread uses the original mapAngle, captured BEFORE GetRecoilAngle.
  const center = model.pellets > 1 ? 0 : scatter * (Math.max(0, Math.min(1, random)) - 0.5);
  // SharedGunSystem.LinearSpread spaces shotgun pellets evenly, not randomly.
  return Array.from({ length: model.pellets }, (_, i) => center + (model.pellets > 1
    ? -model.pelletSpread / 2 + model.pelletSpread * i / (model.pellets - 1) : 0));
}
export function coneOffset(distance: number, fullAngle: number): number {
  return distance * Math.tan(Math.min(179, Math.max(0, fullAngle)) * Math.PI / 360);
}
