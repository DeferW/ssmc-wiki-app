import type { Catalog, CatalogItem } from "../types";
import { ItemLinkList } from "./ItemLinkList";

export function CompatibilityDetails({ item, catalog, onSelect }: { item: CatalogItem; catalog: Catalog; onSelect: (id: string) => void }) {
  const groups = [
    ...(item.attachmentSlots || []).map((slot) => ({
      title: `Обвесы · ${slot.name || slot.slotName || "Слот"}`,
      ids: slot.compatibleItemIds || [],
    })),
    ...(item.magazineSlots || []).map((slot) => ({
      title: slot.name || slot.slotName || "Совместимые магазины",
      ids: slot.compatibleItemIds || [],
    })),
    ...(item.attachableTo || []).map((slot) => ({
      title: `Устанавливается · ${slot.slotName || slot.name || "Слот"}`,
      ids: slot.weaponIds || [],
    })),
    ...(item.compatibleWeaponIds?.length ? [{ title: "Совместимое оружие", ids: item.compatibleWeaponIds }] : []),
  ].map((group) => ({ ...group, ids: [...new Set(group.ids)].filter((id) => catalog.items[id]) }))
    .filter((group) => group.ids.length);

  if (!groups.length) return null;
  return (
    <section className="detail-section compatibility-section">
      <h3>Совместимость</h3>
      <div className="compatibility-groups">
        {groups.map((group) => (
          <div key={`${group.title}:${group.ids.join(":")}`}>
            <h4>{group.title}</h4>
            <ItemLinkList ids={group.ids} catalog={catalog} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}
