import { WEAPON_CATEGORIES, weaponCategory, type WeaponCategory } from "../weaponCategories";
import { useMemo, useState } from "react";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { Catalog, CatalogItem } from "../../equipment/types";
import { canDamageAnyTarget } from "../weaponEligibility";

export function WeaponPicker({ catalog, selectedId, onSelect }: {
  catalog: Catalog;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [category, setCategory] = useState<WeaponCategory | "all">("all");
  const [query, setQuery] = useState("");
  const weapons = useMemo(() => (
    catalog.publicCatalog.itemIds
      .map((id) => catalog.items[id])
      .filter((item): item is CatalogItem => (
        Boolean(item)
        && item.category === "Оружие"
        && canDamageAnyTarget(item)
      ))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  ), [catalog]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const matchingWeapons = useMemo(() => (
    normalizedQuery
      ? weapons.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery))
      : weapons
  ), [normalizedQuery, weapons]);

  const visibleWeapons = matchingWeapons.filter(item => category === "all" || weaponCategory(item) === category);
  const categories = [{ id: "all" as const, label: "Все" }, ...WEAPON_CATEGORIES];

  return (
    <div className="picker-catalog weapon-picker-catalog">
      <label className="picker-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск оружия по названию или ID…" autoFocus />
        <small>{visibleWeapons.length} из {weapons.length}</small>
      </label>
      <div className="weapon-picker-layout">
      <nav className="weapon-picker-categories" aria-label="Категории оружия">
        {categories.map(({id, label}) => <button type="button" key={id} aria-pressed={category === id}
          onClick={() => setCategory(id)}><span>{label}</span><small>{id === "all" ? matchingWeapons.length : matchingWeapons.filter(item => weaponCategory(item) === id).length}</small></button>)}
      </nav>
      <div className="weapon-grid" role="listbox" aria-label="Выбор оружия">
      {visibleWeapons.map((item) => (
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
      {!visibleWeapons.length && <p className="picker-empty">Оружие не найдено.</p>}
      </div>
      </div>
    </div>
  );
}
