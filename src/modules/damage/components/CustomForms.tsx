import { useState } from "react";
import type { CustomWeaponStats, CustomXenoAttackStats } from "../attacker";
import type { CustomTarget } from "../target";

export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={`direction-control is-${options.length}-options`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? "is-active" : ""}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Keeps the typed text while it's mid-edit ("1.", "") and only reports a
// value once it parses, so the field never jumps under the cursor.
function NumberField({ label, value, onChange, min = 0, step = 1, optional = false, hint }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
  optional?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    const parsed = draft === "" ? null : Number(draft);
    if (parsed !== value) setDraft(value == null ? "" : String(value));
  }

  return (
    <label className="custom-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={draft}
        placeholder={optional ? "нет" : undefined}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text === "") {
            if (optional) onChange(null);
            return;
          }
          const parsed = Number(text);
          if (Number.isFinite(parsed) && parsed >= min) onChange(parsed);
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function CustomWeaponForm({ stats, onChange }: {
  stats: CustomWeaponStats;
  onChange: (stats: CustomWeaponStats) => void;
}) {
  const set = <K extends keyof CustomWeaponStats>(key: K, value: CustomWeaponStats[K]) => onChange({ ...stats, [key]: value });
  const bullet = stats.category === "bullet";
  return (
    <div className="custom-form">
      <SegmentedControl
        label="Тип оружия"
        value={stats.category}
        options={[{ value: "bullet", label: "Огнестрел" }, { value: "melee", label: "Ближний бой" }]}
        onChange={(value) => set("category", value)}
      />
      <div className="custom-fields">
        <NumberField label="Физический урон" value={stats.brute} onChange={(value) => set("brute", value ?? 0)} step={0.5} hint={bullet ? "Режется бронёй от пуль" : "Режется бронёй ближнего боя"} />
        <NumberField label="Ожоговый урон" value={stats.burn} onChange={(value) => set("burn", value ?? 0)} step={0.5} hint="Режется только био-бронёй морпеха" />
        <NumberField label="Бронепробитие" value={stats.armorPiercing} onChange={(value) => set("armorPiercing", value ?? 0)} />
        <NumberField label={bullet ? "Выстрелов в секунду" : "Ударов в секунду"} value={stats.shotsPerSecond} onChange={(value) => set("shotsPerSecond", value ?? 0)} step={0.1} />
        {bullet && <NumberField label="Магазин" value={stats.magazine} onChange={(value) => set("magazine", value)} optional min={1} />}
      </div>
    </div>
  );
}

export function CustomXenoAttackForm({ stats, onChange }: {
  stats: CustomXenoAttackStats;
  onChange: (stats: CustomXenoAttackStats) => void;
}) {
  const set = <K extends keyof CustomXenoAttackStats>(key: K, value: CustomXenoAttackStats[K]) => onChange({ ...stats, [key]: value });
  return (
    <div className="custom-form">
      <SegmentedControl
        label="Тип удара"
        value={stats.attack}
        options={[{ value: "claw", label: "Когти" }, { value: "tail", label: "Хвост" }]}
        onChange={(value) => set("attack", value)}
      />
      <div className="custom-fields">
        <NumberField label="Физический урон" value={stats.brute} onChange={(value) => set("brute", value ?? 0)} step={0.5} hint="Режется бронёй ближнего боя или бронёй ксено" />
        <NumberField label="Ожоговый урон" value={stats.burn} onChange={(value) => set("burn", value ?? 0)} step={0.5} hint="Режется только био-бронёй морпеха" />
        <NumberField label="Бронепробитие" value={stats.armorPiercing} onChange={(value) => set("armorPiercing", value ?? 0)} />
        <NumberField label="Ударов в секунду" value={stats.attacksPerSecond} onChange={(value) => set("attacksPerSecond", value ?? 0)} step={0.05} hint="Хвост: 1 / перезарядка, обычно 0.1" />
      </div>
    </div>
  );
}

export function CustomTargetForm({ target, onChange }: {
  target: CustomTarget;
  onChange: (target: CustomTarget) => void;
}) {
  const thresholds = (
    <>
      <NumberField label="Критическое состояние" value={target.critical} onChange={(value) => onChange({ ...target, critical: value })} optional min={1} hint="Пусто — сразу смерть" />
      <NumberField label="Смерть" value={target.dead} onChange={(value) => onChange({ ...target, dead: value && value > 0 ? value : target.dead })} min={1} />
    </>
  );

  if (target.kind === "marine") {
    return (
      <div className="custom-form">
        <div className="custom-fields">
          <NumberField label="Броня · пули" value={target.bullet} onChange={(value) => onChange({ ...target, bullet: value ?? 0 })} />
          <NumberField label="Броня · ближний бой" value={target.melee} onChange={(value) => onChange({ ...target, melee: value ?? 0 })} />
          <NumberField label="Броня · био" value={target.bio} onChange={(value) => onChange({ ...target, bio: value ?? 0 })} />
          {thresholds}
        </div>
      </div>
    );
  }

  return (
    <div className="custom-form">
      <div className="custom-fields">
        <NumberField label="Базовая броня" value={target.xenoArmor} onChange={(value) => onChange({ ...target, xenoArmor: value ?? 0 })} />
        <NumberField label="Бонус спереди" value={target.frontalArmor} onChange={(value) => onChange({ ...target, frontalArmor: value ?? 0 })} min={-100} />
        <NumberField label="Бонус сбоку" value={target.sideArmor} onChange={(value) => onChange({ ...target, sideArmor: value ?? 0 })} min={-100} />
        {thresholds}
      </div>
      <label className="custom-check">
        <input type="checkbox" checked={target.immuneToArmorPiercing} onChange={(event) => onChange({ ...target, immuneToArmorPiercing: event.target.checked })} />
        <span>Игнорирует бронепробитие</span>
      </label>
    </div>
  );
}
