import { isMap } from "../../equipment/format";
import type { JsonMap } from "../../equipment/types";

export function AmmoPicker({ ammunition, selectedIndex, onSelect }: {
  ammunition: JsonMap[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (!ammunition.length) return null;
  return (
    <div className="ammo-picker" role="radiogroup" aria-label="Выбор боеприпаса">
      {ammunition.map((entry, index) => {
        const label = String(
          entry.magazineName ?? entry.ammoName ?? entry.magazineId ?? entry.ammoId ?? `Боеприпас ${index + 1}`,
        );
        const isAp = /ББ|Бронебойн/u.test(label);
        return (
          <button
            type="button"
            key={`${String(entry.magazineId ?? entry.ammoId)}:${index}`}
            className={`ammo-chip${selectedIndex === index ? " is-selected" : ""}${isAp ? " is-ap" : ""}`}
            role="radio"
            aria-checked={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            {label}
            {typeof entry.capacity === "number" && <small>{entry.capacity} шт.</small>}
          </button>
        );
      })}
    </div>
  );
}

export function ammoProjectiles(entry: JsonMap | undefined): JsonMap[] {
  if (!entry || !Array.isArray(entry.projectiles)) return [];
  return entry.projectiles.filter(isMap);
}
