import { capitalizeName, descriptionText } from "../format";
import type { Catalog, CatalogItem } from "../types";
import { CompatibilityDetails } from "./CompatibilityDetails";
import { ItemLinkList } from "./ItemLinkList";
import { Sprite } from "./Sprite";
import { StatsDetails } from "./Stats";

export function ItemDrawer({
  item,
  catalog,
  onClose,
  onSelect,
}: {
  item: CatalogItem;
  catalog: Catalog;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const contained = ["Броня", "Экипировка"].includes(item.category || "")
    ? []
    : (item.containsItemIds || []).filter((id) => catalog.items[id]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="item-drawer" role="dialog" aria-modal="false" aria-labelledby={`item-title-${item.id}`}>
        <div className="drawer-content">
          <section className="dialog-summary">
            <button className="close-button" onClick={onClose} aria-label="Закрыть подробности">×</button>
            <div className="dialog-sprite"><Sprite item={item} eager /></div>
            <div>
              <p className="eyebrow">{item.category || "Снаряжение"}</p>
              <h2 id={`item-title-${item.id}`}>{capitalizeName(item.name)}</h2>
              <code className="prototype-id">{item.id}</code>
            </div>
          </section>
          <div className="drawer-scroll">
            <p className="item-description">{descriptionText(item.description)}</p>
            <div className="dialog-details">
              <StatsDetails item={item} />
              <CompatibilityDetails item={item} catalog={catalog} onSelect={onSelect} />
              {contained.length > 0 && (
                <section className="detail-section">
                  <h3>Содержит</h3>
                  <ItemLinkList ids={contained} catalog={catalog} onSelect={onSelect} />
                </section>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
