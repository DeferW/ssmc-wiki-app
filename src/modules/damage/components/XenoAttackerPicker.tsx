import { useMemo, useState } from "react";
import { formatNumber } from "../../equipment/format";
import { xenoCasteLabel } from "../mobTypes";
import type { MobCatalog, XenoCaste } from "../mobTypes";
import { XenoSprite } from "./XenoSprite";

const sum = (damage: Record<string, number>) => Object.values(damage).reduce((total, value) => total + value, 0);

export function XenoAttackerPicker({ mobCatalog, selectedId, onSelect }: {
  mobCatalog: MobCatalog;
  selectedId: string | null;
  onSelect: (casteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const castes = useMemo(() => (
    Object.values(mobCatalog.xenoCastes)
      .filter((caste) => caste.attacks?.claw)
      .sort((a, b) => a.name.localeCompare(b.name, "ru") || (a.strainName ?? "").localeCompare(b.strainName ?? "", "ru"))
  ), [mobCatalog]);
  const visible = normalizedQuery
    ? castes.filter((caste) => `${xenoCasteLabel(caste)} ${caste.id}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery))
    : castes;

  return (
    <div className="target-picker">
      <label className="picker-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск касты…" autoFocus />
        <small>{visible.length}</small>
      </label>
      <div className="target-grid">
        {visible.map((caste) => (
          <button
            type="button"
            key={caste.id}
            className={`target-card${caste.id === selectedId ? " is-selected" : ""}`}
            onClick={() => onSelect(caste.id)}
          >
            <XenoSprite caste={caste} />
            <strong>{xenoCasteLabel(caste)}</strong>
            <small>{caste.id}</small>
            <XenoAttackStats caste={caste} />
          </button>
        ))}
        {!visible.length && <p className="picker-empty">Каста не найдена.</p>}
      </div>
    </div>
  );
}

export function XenoAttackStats({ caste }: { caste: XenoCaste }) {
  const claw = caste.attacks?.claw;
  const tail = caste.attacks?.tail;
  return (
    <dl className="stat-grid">
      {claw && <div><dt>Когти</dt><dd>{formatNumber(sum(claw.damage))} · {formatNumber(claw.attackRate)}/с</dd></div>}
      <div><dt>Хвост</dt><dd>{tail ? `${formatNumber(sum(tail.damage))} · КД ${formatNumber(tail.cooldownSeconds)} с` : "—"}</dd></div>
    </dl>
  );
}

export function XenoAttackerSlot({ mobCatalog, casteId, onOpen, onClear }: {
  mobCatalog: MobCatalog | null;
  casteId: string | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  const caste = casteId ? mobCatalog?.xenoCastes[casteId] : undefined;
  if (!caste) {
    return (
      <button type="button" className="item-slot is-empty" onClick={onOpen}>
        <span className="item-slot-plus" aria-hidden="true">+</span>
        <span className="item-slot-copy">
          <strong>Выбрать касту</strong>
          <small>Открыть список</small>
        </span>
      </button>
    );
  }
  return (
    <div className="item-slot is-filled">
      <button type="button" className="item-slot-main" onClick={onOpen}>
        <XenoSprite caste={caste} compact />
        <span className="item-slot-copy">
          <strong>{xenoCasteLabel(caste)}</strong>
          <small>{caste.id}</small>
        </span>
      </button>
      {onClear && <button type="button" className="item-slot-clear" onClick={onClear} aria-label="Убрать атакующего">×</button>}
    </div>
  );
}
