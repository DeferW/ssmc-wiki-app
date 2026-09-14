import type { CatalogItem } from "../equipment/types";

export function availableGrips(weapon: CatalogItem | null) {
  const has = (name: string) => Boolean(weapon?.componentTypes?.includes(name) || weapon?.properties?.[name]);
  return { one: !has("GunRequiresWield"), two: has("Wieldable") };
}

export function resolveGrip(weapon: CatalogItem | null, requested: boolean): boolean {
  if (!weapon) return requested;
  const allowed = availableGrips(weapon);
  if (!allowed.one) return true;
  if (!allowed.two) return false;
  return requested;
}
