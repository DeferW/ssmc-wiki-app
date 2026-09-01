import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { CatalogItem } from "../../equipment/types";

export function ItemSlot({ label, item, onOpen, onClear, compact = false, locked = false }: {
  label: string;
  item: CatalogItem | null;
  onOpen?: () => void;
  onClear?: () => void;
  compact?: boolean;
  locked?: boolean;
}) {
  if (!item) {
    return (
      <button type="button" className={`item-slot is-empty${compact ? " is-compact" : ""}`} onClick={onOpen} disabled={!onOpen}>
        <span className="item-slot-plus" aria-hidden="true">+</span>
        <span className="item-slot-copy">
          <strong>{label}</strong>
          {!compact && <small>Открыть список</small>}
        </span>
      </button>
    );
  }

  return (
    <div className={`item-slot is-filled${compact ? " is-compact" : ""}`}>
      <button type="button" className={`item-slot-main${locked ? " is-locked" : ""}`} onClick={onOpen} disabled={locked || !onOpen}>
        <ItemSprite item={item} compact={compact} />
        <span className="item-slot-copy">
          <strong>{capitalizeName(item.name)}</strong>
          {!compact && <small>{item.id}</small>}
        </span>
        {locked && <span className="item-slot-lock-badge">Встроено · несъёмный</span>}
      </button>
      {onClear && (
        <button type="button" className="item-slot-clear" onClick={onClear} aria-label={`Убрать ${item.name}`}>×</button>
      )}
    </div>
  );
}
