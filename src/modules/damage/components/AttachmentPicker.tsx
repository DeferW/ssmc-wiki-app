import { useMemo } from "react";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { Catalog, CatalogItem } from "../../equipment/types";
import { lockedIntegratedAttachmentIds } from "../attachmentEligibility";
import { AttachmentEffectTooltip, attachmentEffectLines } from "./AttachmentEffectTooltip";

export function AttachmentPicker({ catalog, compatibleItemIds, selectedId, onSelect }: {
  catalog: Catalog;
  compatibleItemIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const lockedIntegratedIds = useMemo(() => lockedIntegratedAttachmentIds(catalog), [catalog]);

  const items = useMemo(() => (
    compatibleItemIds
      .map((id) => catalog.items[id])
      .filter((item): item is CatalogItem => Boolean(item) && !lockedIntegratedIds.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
  ), [catalog, compatibleItemIds, lockedIntegratedIds]);

  if (!items.length) return <p className="muted">Нет совместимых обвесов в каталоге.</p>;

  return (
    <div className="weapon-grid" role="listbox" aria-label="Выбор обвеса">
      {items.map((item) => {
        const effects = attachmentEffectLines(item);
        return (
          <div className="attachment-choice" key={item.id}>
            <button
              type="button"
              className={`weapon-card${selectedId === item.id ? " is-selected" : ""}`}
              role="option"
              aria-selected={selectedId === item.id}
              onClick={() => onSelect(item.id)}
            >
              <ItemSprite item={item} />
              <strong>{capitalizeName(item.name)}</strong>
              <small className="attachment-choice-summary">
                {effects[0] ? `${effects[0].label} ${effects[0].value}` : "Без изменения стрельбы"}
              </small>
            </button>
            <AttachmentEffectTooltip item={item} />
          </div>
        );
      })}
    </div>
  );
}
