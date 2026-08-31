import { useMemo, useState } from "react";
import { formatNumber } from "../../equipment/format";
import type { Catalog } from "../../equipment/types";
import { marineArmorFromItems, MARINE_PRESETS } from "../marinePresets";
import { xenoCasteLabel } from "../mobTypes";
import type { MobCatalog } from "../mobTypes";
import type { TargetSelection } from "../target";
import { ItemSprite } from "../../equipment/components/ItemSprite";
import { XenoSprite } from "./XenoSprite";

type Tab = "marine" | "xeno";

export function TargetPicker({ catalog, mobCatalog, selected, onSelect }: {
  catalog: Catalog;
  mobCatalog: MobCatalog;
  selected: TargetSelection | null;
  onSelect: (selection: TargetSelection) => void;
}) {
  const [tab, setTab] = useState<Tab>(selected?.kind === "xeno" ? "xeno" : "marine");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");

  const xenoCastes = useMemo(() => (
    Object.values(mobCatalog.xenoCastes).sort((a, b) => (
      a.name.localeCompare(b.name, "ru") || (a.strainName ?? "").localeCompare(b.strainName ?? "", "ru")
    ))
  ), [mobCatalog]);
  const visibleMarinePresets = useMemo(() => (
    normalizedQuery
      ? MARINE_PRESETS.filter((preset) => `${preset.name} ${preset.description}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery))
      : MARINE_PRESETS
  ), [normalizedQuery]);
  const visibleXenoCastes = useMemo(() => (
    normalizedQuery
      ? xenoCastes.filter((caste) => `${xenoCasteLabel(caste)} ${caste.name} ${caste.id} ${caste.strainName ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery))
      : xenoCastes
  ), [normalizedQuery, xenoCastes]);

  return (
    <div className="target-picker">
      <div className="target-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marine"}
          className={tab === "marine" ? "is-active" : ""}
          onClick={() => setTab("marine")}
        >
          Морпех
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "xeno"}
          className={tab === "xeno" ? "is-active" : ""}
          onClick={() => setTab("xeno")}
        >
          Ксеноморф
        </button>
      </div>
      <label className="picker-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск цели…" autoFocus />
        <small>{tab === "marine" ? visibleMarinePresets.length : visibleXenoCastes.length}</small>
      </label>

      {tab === "marine" && (
        <div className="target-grid">
          {visibleMarinePresets.map((preset) => {
            const armor = marineArmorFromItems(preset.itemIds, catalog);
            const isSelected = selected?.kind === "marine" && selected.presetId === preset.id;
            return (
              <button
                type="button"
                key={preset.id}
                className={`target-card${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelect({ kind: "marine", presetId: preset.id })}
              >
                <div className="target-card-icons">
                  {preset.itemIds.length
                    ? preset.itemIds.map((id) => (
                      catalog.items[id] ? <ItemSprite key={id} item={catalog.items[id]} compact /> : null
                    ))
                    : <span className="sprite-placeholder is-compact" aria-hidden="true">—</span>}
                </div>
                <strong>{preset.name}</strong>
                <small>{preset.description}</small>
                <dl className="stat-grid">
                  <div><dt>Пули</dt><dd>{formatNumber(armor.bullet)}</dd></div>
                  <div><dt>Ближний бой</dt><dd>{formatNumber(armor.melee)}</dd></div>
                  <div><dt>Био</dt><dd>{formatNumber(armor.bio)}</dd></div>
                </dl>
              </button>
            );
          })}
          {!visibleMarinePresets.length && <p className="picker-empty">Цель не найдена.</p>}
        </div>
      )}

      {tab === "xeno" && (
        <div className="target-grid">
          {visibleXenoCastes.map((caste) => {
            const isSelected = selected?.kind === "xeno" && selected.casteId === caste.id;
            return (
              <button
                type="button"
                key={caste.id}
                className={`target-card${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelect({ kind: "xeno", casteId: caste.id })}
              >
                <XenoSprite caste={caste} />
                <strong>{xenoCasteLabel(caste)}</strong>
                <small>{caste.id}</small>
                <dl className="stat-grid">
                  <div>
                    <dt>ХП (смерть)</dt>
                    <dd>
                      {formatNumber(caste.thresholds.dead)}
                      {caste.maturedThresholds && ` → ${formatNumber(caste.maturedThresholds.dead)}`}
                    </dd>
                  </div>
                  <div><dt>Броня</dt><dd>{formatNumber(caste.armor.xenoArmor)}</dd></div>
                </dl>
              </button>
            );
          })}
          {!visibleXenoCastes.length && <p className="picker-empty">Цель не найдена.</p>}
        </div>
      )}
    </div>
  );
}
