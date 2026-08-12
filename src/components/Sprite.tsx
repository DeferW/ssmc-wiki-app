import { DATA_ROOT } from "../constants";
import type { CatalogItem } from "../types";

export function Sprite({ item, compact = false, eager = false }: { item: CatalogItem; compact?: boolean; eager?: boolean }) {
  if (!item.image) return <span className={`sprite-placeholder${compact ? " compact" : ""}`} aria-hidden="true">?</span>;
  return (
    <span className={`sprite-frame${compact ? " compact" : ""}`}>
      {/* Pixel-art sprites are already generated at their final catalog size. */}
      <img src={`${DATA_ROOT}${item.image}`} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}
