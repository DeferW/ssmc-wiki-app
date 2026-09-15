import type { CatalogItem } from "../equipment/types";

export const WEAPON_CATEGORIES = [
  { id: "rifles", label: "Винтовки и автоматы" },
  { id: "handguns", label: "Пистолеты и револьверы" },
  { id: "smgs", label: "Пистолеты-пулемёты" },
  { id: "shotguns", label: "Дробовики" },
  { id: "other", label: "Прочее" },
] as const;
export type WeaponCategory = typeof WEAPON_CATEGORIES[number]["id"];

// Game family metadata only: no item IDs, names, calibre or fire-mode guesses.
export function weaponCategory(item: CatalogItem): WeaponCategory {
  const group = item.properties?.GunDualWielding?.weaponGroup;
  switch (group) {
    case "Rifle": return "rifles";
    case "Handgun": return "handguns";
    case "Submachinegun": return "smgs";
    case "Shotgun": return "shotguns";
  }
  const tags = item.tags ?? [];
  if (tags.includes("RMCWeaponShotgun")) return "shotguns";
  if (tags.includes("RMCWeaponSMG")) return "smgs";
  if (tags.includes("Sidearm") || tags.includes("RMCRevolver")) return "handguns";
  return "other";
}
