import { useMemo } from "react";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { Catalog, CatalogItem } from "../../equipment/types";

// Category "Оружие" already excludes turrets (Снаряжение), underbarrel
// modules (Обвесы) and the hidden *Empty duplicate prototypes (Скрытые) that
// exist only for map-spawned unloaded guns. These specific ids stay in that
// category but aren't handheld weapons a player picks for a TTK comparison.
const EXCLUDED_WEAPON_IDS = new Set([
  "RMCWeaponLauncherM85A1", // Гранатомет M79
  "WeaponLauncherM83", // Гранатомет M83
  "RMCWeaponFlamerSpec", // Огнеметная установка M240-T
  "RMCWeaponFlamer", // Огнеметная установка M240A1
  "RMCWeaponTaser", // Тазер
  "RMCWeaponPistolM82F", // Сигнальный пистолет M82-F
  "RMCWeaponLauncherM5ATL", // M5-ATL
  "RMCWeaponLauncherM6HBrute", // M6H-BRUTE
  "STWeaponSharpRifle", // Винтовка P9 SHARP
  "RMCWeaponRevolverM44Marksman", // Боевой револьвер M44 (Марксманский)
]);

export function WeaponPicker({ catalog, selectedId, onSelect }: {
  catalog: Catalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const weapons = useMemo(() => (
    catalog.publicCatalog.itemIds
      .map((id) => catalog.items[id])
      .filter((item): item is CatalogItem => (
        Boolean(item?.weaponStats)
        && item.category === "Оружие"
        && !EXCLUDED_WEAPON_IDS.has(item.id)
      ))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  ), [catalog]);

  return (
    <div className="weapon-grid" role="listbox" aria-label="Выбор оружия">
      {weapons.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`weapon-card${selectedId === item.id ? " is-selected" : ""}`}
          role="option"
          aria-selected={selectedId === item.id}
          onClick={() => onSelect(item.id)}
        >
          <ItemSprite item={item} />
          <strong>{capitalizeName(item.name)}</strong>
        </button>
      ))}
    </div>
  );
}
