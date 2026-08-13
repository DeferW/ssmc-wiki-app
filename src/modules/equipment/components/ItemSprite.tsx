import { CATALOG_DATA_ROOT } from "../config";
import type { CatalogItem } from "../types";

export function ItemSprite({ item, compact = false, eager = false }: {
  item: CatalogItem;
  compact?: boolean;
  eager?: boolean;
}) {
  if (!item.image) {
    return <span className={`sprite-placeholder${compact ? " is-compact" : ""}`} aria-hidden="true">?</span>;
  }
  const source = new URL(item.image, CATALOG_DATA_ROOT).toString();
  return (
    <span className={`sprite-frame${compact ? " is-compact" : ""}`}>
      <img src={source} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}
