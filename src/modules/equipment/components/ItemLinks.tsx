import { capitalizeName } from "../format";
import type { Catalog } from "../types";
import { ItemSprite } from "./ItemSprite";

export function ItemLinks({ ids, catalog, onSelect }: {
  ids: string[];
  catalog: Catalog;
  onSelect: (id: string) => void;
}) {
  const uniqueIds = [...new Set(ids)].filter((id) => catalog.items[id]);
  return (
    <div className="item-link-list">
      {uniqueIds.map((id) => (
        <button type="button" key={id} onClick={() => onSelect(id)}>
          <ItemSprite item={catalog.items[id]} compact />
          <span>{capitalizeName(catalog.items[id].name)}</span>
        </button>
      ))}
    </div>
  );
}
