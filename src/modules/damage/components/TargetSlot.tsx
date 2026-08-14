import { ItemSprite } from "../../equipment/components/ItemSprite";
import type { Catalog } from "../../equipment/types";
import { MARINE_PRESETS } from "../marinePresets";
import { xenoCasteLabel } from "../mobTypes";
import type { MobCatalog } from "../mobTypes";
import type { TargetSelection } from "../target";
import { XenoSprite } from "./XenoSprite";

export function TargetSlot({ label, selection, catalog, mobCatalog, onOpen, onClear }: {
  label: string;
  selection: TargetSelection | null;
  catalog: Catalog;
  mobCatalog: MobCatalog | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  if (!selection) {
    return (
      <button type="button" className="item-slot is-empty" onClick={onOpen}>
        <span className="item-slot-plus" aria-hidden="true">+</span>
        <span>{label}</span>
      </button>
    );
  }

  if (selection.kind === "marine") {
    const preset = MARINE_PRESETS.find((entry) => entry.id === selection.presetId);
    return (
      <div className="item-slot is-filled">
        <button type="button" className="item-slot-main" onClick={onOpen}>
          <div className="target-card-icons">
            {preset?.itemIds.map((id) => (
              catalog.items[id] ? <ItemSprite key={id} item={catalog.items[id]} compact /> : null
            ))}
          </div>
          <strong>{preset?.name ?? selection.presetId}</strong>
        </button>
        {onClear && <button type="button" className="item-slot-clear" onClick={onClear} aria-label="Убрать цель">×</button>}
      </div>
    );
  }

  const caste = mobCatalog?.xenoCastes[selection.casteId];
  return (
    <div className="item-slot is-filled">
      <button type="button" className="item-slot-main" onClick={onOpen}>
        {caste && <XenoSprite caste={caste} compact />}
        <strong>{caste ? xenoCasteLabel(caste) : selection.casteId}</strong>
        <small>{selection.casteId}</small>
      </button>
      {onClear && <button type="button" className="item-slot-clear" onClick={onClear} aria-label="Убрать цель">×</button>}
    </div>
  );
}
