import { useEffect, useRef } from "react";
import { capitalizeName, descriptionText, explicitStorageItemIds } from "../format";
import type { Catalog, CatalogItem, PanelPosition } from "../types";
import { ItemLinks } from "./ItemLinks";
import { ItemSprite } from "./ItemSprite";
import { ItemStats } from "./StatBlocks";

export function DetailsPanel({ item, catalog, position, onClose, onSelect }: {
  item: CatalogItem;
  catalog: Catalog;
  position: PanelPosition;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const relationIds = (types: string[]) => (item.relationships ?? [])
    .filter((relation) => relation.itemId && relation.type && types.includes(relation.type))
    .map((relation) => relation.itemId as string)
    .filter((id) => catalog.items[id]);

  const packed = relationIds(["contains", "bundleItem", "slotItem"]);
  const installed = relationIds(["installedAttachment"]);
  const loaded = relationIds(["loadedWith"]);
  const compatibility = [
    ...(item.attachmentSlots ?? []).flatMap((slot) => slot.compatibleItemIds ?? []),
    ...(item.magazineSlots ?? []).flatMap((slot) => slot.compatibleItemIds ?? []),
    ...(item.attachableTo ?? []).flatMap((slot) => slot.weaponIds ?? []),
    ...(item.compatibleWeaponIds ?? []),
  ];
  const accepted = explicitStorageItemIds(item, catalog);

  const backToSearch = () => {
    onClose();
    window.requestAnimationFrame(() => document.getElementById("catalog-search-input")?.focus());
  };

  return (
    <div className={`details-backdrop is-${position}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="details-panel" role="dialog" aria-modal="true" aria-labelledby={`item-title-${item.id}`}>
        <header className="details-header">
          <button ref={closeButton} className="close-button" type="button" onClick={onClose} aria-label="Закрыть карточку">×</button>
          <div className="details-sprite"><ItemSprite item={item} eager /></div>
          <div className="details-title">
            <p className="eyebrow">{item.category ?? "Другое"}</p>
            <h2 id={`item-title-${item.id}`}>{capitalizeName(item.name)}</h2>
            <code>{item.id}</code>
            {item.edited && <span className="edited-badge">Категория изменена</span>}
          </div>
        </header>

        <div className="details-scroll">
          <p className="item-description">{descriptionText(item.description)}</p>
          <div className="details-content">
            <ItemStats item={item} catalog={catalog} />
            <LinkedSection title="Содержит" ids={packed} catalog={catalog} onSelect={onSelect} />
            <LinkedSection title="Установлено" ids={installed} catalog={catalog} onSelect={onSelect} />
            <LinkedSection title="Заряжено" ids={loaded} catalog={catalog} onSelect={onSelect} />
            <CollapsibleLinkedSection title="Разрешено помещать внутрь" ids={accepted} catalog={catalog} onSelect={onSelect} />
            <LinkedSection title="Совместимость" ids={compatibility} catalog={catalog} onSelect={onSelect} />
          </div>
        </div>
        <button className="back-to-search" type="button" onClick={backToSearch}>К поиску</button>
      </aside>
    </div>
  );
}

function CollapsibleLinkedSection({ title, ids, catalog, onSelect }: {
  title: string;
  ids: string[];
  catalog: Catalog;
  onSelect: (id: string) => void;
}) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return null;
  return (
    <details className="detail-section collapsible-section">
      <summary><span>{title}</span><small>{uniqueIds.length}</small></summary>
      <ItemLinks ids={uniqueIds} catalog={catalog} onSelect={onSelect} />
    </details>
  );
}

function LinkedSection({ title, ids, catalog, onSelect }: {
  title: string;
  ids: string[];
  catalog: Catalog;
  onSelect: (id: string) => void;
}) {
  if (!ids.length) return null;
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <ItemLinks ids={ids} catalog={catalog} onSelect={onSelect} />
    </section>
  );
}
