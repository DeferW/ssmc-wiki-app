import { capitalizeName } from "../format";
import type { Catalog } from "../types";
import { Sprite } from "./Sprite";

export function ItemLinkList({ ids, catalog, onSelect }: { ids: string[]; catalog: Catalog; onSelect: (id: string) => void }) {
  return (
    <div className="item-link-list">
      {ids.map((id) => (
        <button key={id} onClick={() => onSelect(id)}>
          <Sprite item={catalog.items[id]} compact />
          <span>{capitalizeName(catalog.items[id].name)}</span>
        </button>
      ))}
    </div>
  );
}
