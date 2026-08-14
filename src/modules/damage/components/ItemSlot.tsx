import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { CatalogItem } from "../../equipment/types";

export function ItemSlot({ label, item, onOpen, onClear, compact = false }: {
  label: string;
  item: CatalogItem | null;
  onOpen: () => void;
  onClear?: () => void;
  compact?: boolean;
}) {
  if (!item) {
    return (
      <button type="button" className={`item-slot is-empty${compact ? " is-compact" : ""}`} onClick={onOpen}>
        <span className="item-slot-plus" aria-hidden="true">+</span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className={`item-slot is-filled${compact ? " is-compact" : ""}`}>
      <button type="button" className="item-slot-main" onClick={onOpen}>
        <ItemSprite item={item} compact={compact} />
        <strong>{capitalizeName(item.name)}</strong>
      </button>
      {onClear && (
        <button type="button" className="item-slot-clear" onClick={onClear} aria-label={`Убрать ${item.name}`}>×</button>
      )}
    </div>
  );
}
