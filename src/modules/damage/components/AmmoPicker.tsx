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

export function AmmoModePicker({ modes, selectedIndex, onSelect }: {
  modes: JsonMap[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  if (!modes.length) return null;
  return (
    <div className="ammo-picker" role="radiogroup" aria-label="Режим боеприпаса">
      {modes.map((mode, index) => {
        const label = ammoModeLabel(String(mode.nameId ?? mode.id ?? `Режим ${index + 1}`));
        return (
          <button
            type="button"
            key={String(mode.id ?? index)}
            className={`ammo-chip${selectedIndex === index ? " is-selected" : ""}${Number(mode.armorPiercing ?? 0) > 0 ? " is-ap" : ""}`}
            role="radio"
            aria-checked={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            {label}
            <small>Урон {damageTotal(mode.damage)} · БП {Number(mode.armorPiercing ?? 0)}</small>
          </button>
        );
      })}
    </div>
  );
}

function ammoModeLabel(value: string) {
  const labels: Record<string, string> = {
    "rmc-toggleable-ammo-highly-precise": "Высокоточный",
    "rmc-toggleable-ammo-armor-shredding": "Бронебойный",
  };
  return labels[value] ?? value;
}

function damageTotal(value: unknown) {
  if (!isMap(value)) return "—";
  return Object.values(value).reduce<number>((total, amount) => (
    total + (typeof amount === "number" ? amount : 0)
  ), 0);
}
