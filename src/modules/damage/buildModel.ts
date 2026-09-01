import { isMap } from "../equipment/format";
import type { Catalog, CatalogItem, CompatibilitySlot, JsonMap } from "../equipment/types";
import {
  collectRangedModifierEntries,
  foldAttachmentModifiers,
  type EquippedAttachment,
  type WeaponModifiableStats,
} from "./attachmentModifiers";
import { isCompatibleAttachment } from "./attachmentEligibility";
import type {
  DamageFalloffThreshold,
  DamageTypeMap,
  HoloTargetingConfig,
  OverheatConfig,
} from "./damageMath";
import { ammoProjectiles } from "./components/AmmoPicker";

export type DamageBuildState = {
  id: string;
  weaponId: string | null;
  ammoIndex: number;
  ammoModeIndex: number;
  attachmentBySlot: Record<string, string>;
  attachmentActiveBySlot: Record<string, boolean>;
};

export type NormalizedAttachmentSlot = CompatibilitySlot & {
  id: string;
};

export type DerivedDamageBuild = {
  state: DamageBuildState;
  weapon: CatalogItem | null;
  attachmentSlots: NormalizedAttachmentSlot[];
  effectiveAttachmentBySlot: Record<string, string>;
  equippedAttachments: EquippedAttachment[];
  ammunition: JsonMap[];
  ammoIndex: number;
  selectedAmmo?: JsonMap;
  ammoModes: JsonMap[];
  ammoModeIndex: number;
  selectedAmmoMode?: JsonMap;
  projectiles: JsonMap[];
  selectedProjectile?: JsonMap;
  projectilesPerShot: number;
  baseStats: WeaponModifiableStats | null;
  modifiedStats: WeaponModifiableStats | null;
  effectiveDamage: DamageTypeMap;
  falloffThresholds: DamageFalloffThreshold[];
  weaponFalloffMultiplier: number;
  armorPiercing: number;
  overheat?: OverheatConfig;
  holoTargeting?: HoloTargetingConfig;
  magazineCapacity: number | null;
};

export function emptyDamageBuild(id: string): DamageBuildState {
  return {
    id,
    weaponId: null,
    ammoIndex: 0,
    ammoModeIndex: 0,
    attachmentBySlot: {},
    attachmentActiveBySlot: {},
  };
}

function numberField(container: unknown, key: string): number | undefined {
  return isMap(container) && typeof container[key] === "number" ? container[key] as number : undefined;
}

function damageTypeMapFrom(value: unknown): DamageTypeMap {
  if (!isMap(value)) return {};
  const result: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(value)) {
    if (typeof amount === "number") result[type] = amount;
  }
  return result;
}

function scaleDamage(damage: DamageTypeMap, ratio: number): DamageTypeMap {
  return Object.fromEntries(Object.entries(damage).map(([type, amount]) => [type, amount * ratio]));
}

function falloffThresholdsFrom(projectile: JsonMap | undefined): DamageFalloffThreshold[] {
  const raw = isMap(projectile?.damageFalloff) ? projectile.damageFalloff.thresholds : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMap).map((entry) => ({
    range: typeof entry.range === "number" ? entry.range : 0,
    falloff: typeof entry.falloff === "number" ? entry.falloff : 0,
    ignoreModifiers: entry.ignoreModifiers === true,
  }));
}

function overheatConfigFrom(stats: JsonMap | undefined): OverheatConfig | undefined {
  const raw = isMap(stats?.overheat) ? stats.overheat : undefined;
  if (!raw) return undefined;
  const maxHeat = numberField(raw, "maxHeat");
  const heatPerShot = numberField(raw, "heatPerShot");
  if (maxHeat == null || heatPerShot == null) return undefined;
  return {
    maxHeat,
    heatPerShot,
    cooldownRate: numberField(raw, "cooldownRate") ?? 0,
    emergencyCooldownMultiplier: numberField(raw, "emergencyCooldownMultiplier") ?? 0,
    emergencyCooldownDelaySeconds: numberField(raw, "emergencyCooldownDelaySeconds") ?? 0,
  };
}

function holoTargetingConfigFrom(projectile: JsonMap | undefined): HoloTargetingConfig | undefined {
  const raw = isMap(projectile?.holoTargeting) ? projectile.holoTargeting : undefined;
  if (!raw) return undefined;
  const stacksPerHit = numberField(raw, "stacksPerHit");
  const maxStacks = numberField(raw, "maxStacks");
  const decayPerSecond = numberField(raw, "decayPerSecond");
  const decayDelaySeconds = numberField(raw, "decayDelaySeconds");
  const damageMultiplierPerStack = numberField(raw, "damageMultiplierPerStack");
  if ([stacksPerHit, maxStacks, decayPerSecond, decayDelaySeconds, damageMultiplierPerStack].some((value) => value == null)) {
    return undefined;
  }
  return {
    stacksPerHit: stacksPerHit!,
    maxStacks: maxStacks!,
    decayPerSecond: decayPerSecond!,
    decayDelaySeconds: decayDelaySeconds!,
    damageMultiplierPerStack: damageMultiplierPerStack!,
  };
}

function attachmentSlotsFrom(weapon: CatalogItem | null): NormalizedAttachmentSlot[] {
  if (!weapon) return [];
  const holder = weapon.properties?.AttachableHolder;
  const rawSlots = isMap(holder?.slots) ? holder.slots : {};
  return (weapon.attachmentSlots ?? []).flatMap((slot) => {
    const id = slot.id ?? slot.slotId;
    if (!id) return [];
    const rawSlot = isMap(rawSlots[id]) ? rawSlots[id] : {};
    return [{
      ...slot,
      id,
      locked: slot.locked ?? rawSlot.locked === true,
      startingItemId: slot.startingItemId
        ?? (typeof rawSlot.startingAttachable === "string" ? rawSlot.startingAttachable : slot.installedItemIds?.[0]),
    }];
  });
}

export function deriveDamageBuild(
  catalog: Catalog,
  state: DamageBuildState,
  lockedIntegratedIds: ReadonlySet<string>,
): DerivedDamageBuild {
  const candidate = state.weaponId ? catalog.items[state.weaponId] : undefined;
  const weapon = candidate?.category === "Оружие" ? candidate : null;
  const attachmentSlots = attachmentSlotsFrom(weapon);
  const effectiveAttachmentBySlot: Record<string, string> = {};
  for (const slot of attachmentSlots) {
    if (slot.locked) continue;
    const itemId = state.attachmentBySlot[slot.id];
    if (isCompatibleAttachment(catalog, slot, itemId, lockedIntegratedIds)) effectiveAttachmentBySlot[slot.id] = itemId;
  }

  const equippedAttachments: EquippedAttachment[] = [];
  for (const slot of attachmentSlots) {
    const itemId = slot.locked
      ? slot.startingItemId ?? slot.installedItemIds?.[0]
      : effectiveAttachmentBySlot[slot.id];
    const item = itemId ? catalog.items[itemId] : undefined;
    if (item) equippedAttachments.push({ item, active: Boolean(state.attachmentActiveBySlot[slot.id]) });
  }

  const ammunitionRaw = weapon?.weaponStats?.ammunition;
  const ammunition = Array.isArray(ammunitionRaw) ? ammunitionRaw.filter(isMap) : [];
  const ammoIndex = state.ammoIndex >= 0 && state.ammoIndex < ammunition.length ? state.ammoIndex : 0;
  const selectedAmmo = ammunition[ammoIndex];
  const projectiles = ammoProjectiles(selectedAmmo);
  const selectedProjectile = projectiles[0];
  const ammoModesRaw = weapon?.weaponStats?.ammoModes;
  const ammoModes = Array.isArray(ammoModesRaw) ? ammoModesRaw.filter(isMap) : [];
  const ammoModeIndex = state.ammoModeIndex >= 0 && state.ammoModeIndex < ammoModes.length ? state.ammoModeIndex : 0;
  const selectedAmmoMode = ammoModes[ammoModeIndex];

  const weaponStats = weapon?.weaponStats;
  const baseStats: WeaponModifiableStats | null = weapon ? {
    damageMultiplier: numberField(weaponStats, "damageMultiplier") ?? 1,
    accuracyWieldedMultiplier: numberField(isMap(weaponStats) ? weaponStats.accuracy : undefined, "wieldedMultiplier") ?? 1,
    scatterWielded: numberField(isMap(weaponStats) ? weaponStats.scatter : undefined, "wielded") ?? 0,
    recoilWielded: numberField(isMap(weaponStats) ? weaponStats.recoil : undefined, "wielded") ?? 0,
    shotsPerSecond: numberField(weaponStats, "shotsPerSecond") ?? 0,
  } : null;
  const modifiedStats = baseStats
    ? foldAttachmentModifiers(baseStats, collectRangedModifierEntries(equippedAttachments, weapon?.tags ?? []))
    : null;
  const damageRatio = baseStats && modifiedStats && baseStats.damageMultiplier > 0
    ? modifiedStats.damageMultiplier / baseStats.damageMultiplier
    : 1;
  const effectiveDamage = scaleDamage(
    damageTypeMapFrom(selectedAmmoMode?.damage ?? selectedProjectile?.effectiveDamage ?? selectedProjectile?.damage),
    damageRatio,
  );
  const projectilesPerShot = typeof selectedProjectile?.projectilesPerShot === "number"
    ? Math.max(1, Math.floor(selectedProjectile.projectilesPerShot))
    : 1;
  const weaponFalloffMultiplier = numberField(
    isMap(weapon?.properties) ? weapon.properties.RMCWeaponDamageFalloff : undefined,
    "falloffMultiplier",
  ) ?? 1;
  const armorPiercing = typeof selectedAmmoMode?.armorPiercing === "number"
    ? selectedAmmoMode.armorPiercing
    : typeof selectedProjectile?.armorPiercing === "number" ? selectedProjectile.armorPiercing : 0;
  const hasMagazine = selectedAmmo != null && selectedAmmo.directFeed !== true;

  return {
    state,
    weapon,
    attachmentSlots,
    effectiveAttachmentBySlot,
    equippedAttachments,
    ammunition,
    ammoIndex,
    selectedAmmo,
    ammoModes,
    ammoModeIndex,
    selectedAmmoMode,
    projectiles,
    selectedProjectile,
    projectilesPerShot,
    baseStats,
    modifiedStats,
    effectiveDamage,
    falloffThresholds: falloffThresholdsFrom(selectedProjectile),
    weaponFalloffMultiplier,
    armorPiercing,
    overheat: overheatConfigFrom(weaponStats),
    holoTargeting: holoTargetingConfigFrom(selectedProjectile),
    magazineCapacity: hasMagazine && typeof selectedAmmo?.capacity === "number" ? selectedAmmo.capacity : null,
  };
}

export function ammoLabel(build: DerivedDamageBuild): string {
  const ammo = build.selectedAmmo;
  if (!ammo) return "Боеприпас не выбран";
  return String(ammo.magazineName ?? ammo.ammoName ?? ammo.magazineId ?? ammo.ammoId ?? "Боеприпас");
}
