import { isMap } from "../equipment/format";
import type { CatalogItem, JsonMap } from "../equipment/types";

export type TagFilter = {
  tags?: string[];
  requireAll?: boolean;
};

export type ModifierConditions = {
  activeOnly?: boolean;
  inactiveOnly?: boolean;
  wieldedOnly?: boolean;
  unwieldedOnly?: boolean;
  whitelist?: TagFilter;
  blacklist?: TagFilter;
};

export type RangedModifierEntry = {
  conditions?: ModifierConditions;
  accuracyAddMult?: number;
  damageAddMult?: number;
  scatterFlat?: number;
  recoilFlat?: number;
  fireDelayFlat?: number;
  burstScatterAddMult?: number;
  damageFalloffAddMult?: number;
  rangeFlat?: number;
  shotsPerBurstFlat?: number;
};

export type EquippedAttachment = {
  item: CatalogItem;
  active: boolean;
};

export type WeaponModifiableStats = {
  damageMultiplier: number;
  accuracyWieldedMultiplier: number;
  scatterWielded: number;
  recoilWielded: number;
  shotsPerSecond: number;
};

// The calculator only ever compares wielded (aimed) fire, so unwieldedOnly
// entries never contribute and wieldedOnly entries always do.
export function isGunAttachment(item: CatalogItem): boolean {
  return item.componentTypes?.includes("Gun") ?? false;
}

export function isToggleableAttachment(item: CatalogItem): boolean {
  return item.componentTypes?.includes("AttachableToggleable") ?? false;
}

// EntityWhitelist semantics: a filter with no tags never gates anything;
// otherwise it matches when any (or, with requireAll, all) listed tag is
// present on the weapon.
function tagsMatch(weaponTags: string[], filter: TagFilter | undefined): boolean {
  if (!filter?.tags?.length) return true;
  return filter.requireAll
    ? filter.tags.every((tag) => weaponTags.includes(tag))
    : filter.tags.some((tag) => weaponTags.includes(tag));
}

function entryApplies(conditions: ModifierConditions | undefined, active: boolean, weaponTags: string[]): boolean {
  if (!conditions) return true;
  if (conditions.unwieldedOnly) return false;
  if (conditions.activeOnly && !active) return false;
  if (conditions.inactiveOnly && active) return false;
  // CanApplyModifiers: whitelist gates on a fail-to-match, blacklist gates on a match.
  if (conditions.whitelist && !tagsMatch(weaponTags, conditions.whitelist)) return false;
  if (conditions.blacklist && tagsMatch(weaponTags, conditions.blacklist)) return false;
  return true;
}

function rangedModifierEntries(item: CatalogItem): JsonMap[] {
  const modifiers = item.attachmentStats?.modifiers;
  const rangedMods = isMap(modifiers) ? modifiers.AttachableWeaponRangedMods : undefined;
  const entries = isMap(rangedMods) ? rangedMods.modifiers : undefined;
  return Array.isArray(entries) ? entries.filter(isMap) : [];
}

// Underbarrel weapons (grenade launchers, the underbarrel shotgun) carry a
// Gun component and are never activated as an alt-fire in this calculator —
// they're shown as equipped but contribute nothing to the numbers.
export function collectRangedModifierEntries(
  attachments: EquippedAttachment[],
  weaponTags: string[],
): RangedModifierEntry[] {
  const entries: RangedModifierEntry[] = [];
  for (const { item, active } of attachments) {
    if (isGunAttachment(item)) continue;
    for (const entry of rangedModifierEntries(item)) {
      if (entryApplies(entry.conditions as ModifierConditions | undefined, active, weaponTags)) {
        entries.push(entry as RangedModifierEntry);
      }
    }
  }
  return entries;
}

// Matches AttachableModifiersSystem.Ranged.cs: every modifier is a simple
// running-total accumulator, with fire delay (not fire rate) as the linear
// quantity — delay = 1/rate, so rate deltas have to go through the delay.
export function foldAttachmentModifiers(
  base: WeaponModifiableStats,
  entries: RangedModifierEntry[],
): WeaponModifiableStats {
  let damageMultiplier = base.damageMultiplier;
  let accuracyWieldedMultiplier = base.accuracyWieldedMultiplier;
  let scatterWielded = base.scatterWielded;
  let recoilWielded = base.recoilWielded;
  let fireDelay = base.shotsPerSecond > 0 ? 1 / base.shotsPerSecond : Infinity;

  for (const entry of entries) {
    damageMultiplier += entry.damageAddMult ?? 0;
    accuracyWieldedMultiplier += entry.accuracyAddMult ?? 0;
    scatterWielded = Math.max(scatterWielded + (entry.scatterFlat ?? 0), 0);
    recoilWielded = Math.max(recoilWielded + (entry.recoilFlat ?? 0), 0);
    fireDelay += entry.fireDelayFlat ?? 0;
  }

  const shotsPerSecond = Number.isFinite(fireDelay) && fireDelay > 0 ? 1 / fireDelay : 0;
  return { damageMultiplier, accuracyWieldedMultiplier, scatterWielded, recoilWielded, shotsPerSecond };
}

export type StatDirection = "higher-better" | "lower-better";

export type StatDelta = {
  from: number;
  to: number;
  better: boolean | null;
};

export function statDelta(from: number, to: number, direction: StatDirection): StatDelta | null {
  if (from === to) return null;
  const better = direction === "higher-better" ? to > from : to < from;
  return { from, to, better };
}
