import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { CatalogItem } from "../../equipment/types";
import { AttachmentTooltipTrigger } from "./AttachmentEffectTooltip";

export function ItemSlot({ label, item, onOpen, onClear, compact = false, locked = false, tooltipItem }: {
  label: string;
  item: CatalogItem | null;
  onOpen?: () => void;
  onClear?: () => void;
  compact?: boolean;
  locked?: boolean;
  tooltipItem?: CatalogItem;
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

  const content = (
    <>
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
    </>
  );

  const className = `item-slot is-filled${compact ? " is-compact" : ""}`;
  return tooltipItem
    ? <AttachmentTooltipTrigger item={tooltipItem} compact={compact} className={className}>{content}</AttachmentTooltipTrigger>
    : <div className={className}>{content}</div>;
}
