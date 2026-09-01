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
  const lockedIntegratedIds = useMemo(() => {
    const result = new Set<string>();
    for (const owner of Object.values(catalog.items)) {
      const holder = owner.properties?.AttachableHolder;
      const slots = holder?.slots;
      if (!slots || typeof slots !== "object" || Array.isArray(slots)) continue;
      for (const value of Object.values(slots)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const slot = value as Record<string, unknown>;
        const attachmentId = slot.startingAttachable;
        if (slot.locked !== true || typeof attachmentId !== "string") continue;
        const attachment = catalog.items[attachmentId];
        if (attachment && !attachment.directlyVended && !attachment.availability?.length) {
          result.add(attachmentId);
        }
      }
    }
    return result;
  }, [catalog]);

  const items = useMemo(() => (
    compatibleItemIds
      .map((id) => catalog.items[id])
      .filter((item): item is CatalogItem => Boolean(item) && !lockedIntegratedIds.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  ), [catalog, compatibleItemIds, lockedIntegratedIds]);

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
