import type { ReactNode } from "react";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { capitalizeName } from "../../equipment/format";
import type { CatalogItem } from "../../equipment/types";
import { AttachmentTooltipTrigger } from "./AttachmentEffectTooltip";

export function ItemSlot({ label, item, onOpen, onClear, compact = false, locked = false, tooltipItem, footer }: {
  label: string;
  item: CatalogItem | null;
  onOpen?: () => void;
  onClear?: () => void;
  compact?: boolean;
  locked?: boolean;
  tooltipItem?: CatalogItem;
  footer?: ReactNode;
}) {
  const lockIcon = (
    <span className="item-slot-lock-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z" />
      </svg>
    </span>
  );

  if (!item && locked) {
    return (
      <div className={`item-slot is-filled is-missing-integrated${compact ? " is-compact" : ""}`}>
        <button type="button" className="item-slot-main is-locked" disabled aria-label={`${label}: встроенный несъёмный обвес`}>
          <span className="item-slot-sprite-lock-wrap">
            <span className="item-slot-integrated-mark" aria-hidden="true" />
            {lockIcon}
          </span>
          <span className="item-slot-copy">
            <strong>{label}</strong>
            {!compact && <small>Встроенный обвес</small>}
          </span>
        </button>
      </div>
    );
  }

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

  if (footer) return <div className="weapon-selection-card">
    <button className="weapon-selection-sprite" type="button" onClick={onOpen} aria-label={`Заменить ${item.name}`}>
      <ItemSprite item={item} />
    </button>
    <div className="weapon-selection-body">
      <button className="weapon-selection-name" type="button" onClick={onOpen} title="Заменить оружие">{capitalizeName(item.name)}</button>
      {footer}
    </div>
    {onClear && <button className="weapon-selection-clear" type="button" onClick={onClear} aria-label={`Убрать ${item.name}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
    </button>}
  </div>;

  const content = (
    <>
      <button type="button" className={`item-slot-main${locked ? " is-locked" : ""}`} onClick={onOpen} disabled={locked || !onOpen}>
        {locked ? (
          <span className="item-slot-sprite-lock-wrap">
            <ItemSprite item={item} compact={compact} />
            {lockIcon}
          </span>
        ) : <ItemSprite item={item} compact={compact} />}
        <span className="item-slot-copy">
          <strong>{capitalizeName(item.name)}</strong>
          {!compact && <small>{footer ? "Заменить оружие" : item.id}</small>}
        </span>
      </button>
      {footer && <div className="item-slot-footer">{footer}</div>}
      {onClear && (
        <button type="button" className="item-slot-clear" onClick={onClear} aria-label={`Убрать ${item.name}`}>×</button>
      )}
    </>
  );

  const className = `item-slot is-filled${compact ? " is-compact" : ""}${footer ? " has-footer" : ""}`;
  return tooltipItem
    ? <AttachmentTooltipTrigger item={tooltipItem} compact={compact} className={className}>{content}</AttachmentTooltipTrigger>
    : <div className={className}>{content}</div>;
}
