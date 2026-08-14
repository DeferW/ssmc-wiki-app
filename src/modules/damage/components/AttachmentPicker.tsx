import { useMemo } from "react";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { Catalog, CatalogItem } from "../../equipment/types";

export function AttachmentPicker({ catalog, compatibleItemIds, selectedId, onSelect }: {
  catalog: Catalog;
  compatibleItemIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const items = useMemo(() => (
    compatibleItemIds
      .map((id) => catalog.items[id])
      .filter((item): item is CatalogItem => Boolean(item))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  ), [catalog, compatibleItemIds]);

  if (!items.length) return <p className="muted">Нет совместимых обвесов в каталоге.</p>;

  return (
    <div className="weapon-grid" role="listbox" aria-label="Выбор обвеса">
      {items.map((item) => (
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
