import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatNumber } from "../../equipment/format";
import type { Catalog, CatalogItem } from "../../equipment/types";
import { isGunAttachment, isToggleableAttachment } from "../attachmentModifiers";
import { isCompatibleAttachment, lockedIntegratedAttachmentIds } from "../attachmentEligibility";
import {
  ammoLabel,
  deriveDamageBuild,
  emptyDamageBuild,
  type DamageBuildState,
  type DerivedDamageBuild,
} from "../buildModel";
import { simulateEngagement, type ArmorTarget, type HitDirection } from "../damageMath";
import { MARINE_PRESETS } from "../marinePresets";
import type { MobCatalog, MobThresholdPair } from "../mobTypes";
import { xenoCasteLabel } from "../mobTypes";
import { targetArmorFrom, targetThresholdsFrom, type TargetSelection } from "../target";
import {
  readDamageComparisonUrlState,
  writeDamageComparisonUrlState,
  type DamageBuildUrlState,
  type DamageUrlState,
} from "../urlState";
import { applyXenoAbilityBonuses, toggleXenoAbility, XENO_DEFENSIVE_ABILITIES } from "../xenoAbilities";
import { WEAPON_GUN_STACKS } from "../weaponGunStacks";
import { AmmoModePicker, AmmoPicker } from "./AmmoPicker";
import { AttachmentPicker } from "./AttachmentPicker";
import { DistanceControl } from "./DistanceControl";
import { ItemSlot } from "./ItemSlot";
import { PickerModal } from "./PickerModal";
import { TargetPicker } from "./TargetPicker";
import { TargetSlot } from "./TargetSlot";
import { WeaponPicker } from "./WeaponPicker";

type ComparePicker =
  | { type: "weapon"; buildId: string }
  | { type: "attachment"; buildId: string; slotId: string }
  | { type: "target" }
  | null;

type BuildResult = {
  firstShotDamage: number;
  hitsToDead: number;
  timeToDeadSeconds: number;
  armorPiercing: number;
};

const GRAPH_DISTANCES = [0, 5, 10, 15, 20, 25, 30, 35, 40];
const MAX_BUILDS = 4;
const MIN_BUILDS = 2;

function buildFromUrl(state: DamageBuildUrlState, index: number): DamageBuildState {
  return { id: `build-${index + 1}`, ...state };
}

function buildForUrl(state: DamageBuildState): DamageBuildUrlState {
  return {
    weaponId: state.weaponId,
    ammoIndex: state.ammoIndex,
    ammoModeIndex: state.ammoModeIndex,
    attachmentBySlot: state.attachmentBySlot,
    attachmentActiveBySlot: state.attachmentActiveBySlot,
  };
}

function copySeed(seed: DamageBuildUrlState | undefined, id: string): DamageBuildState {
  return seed ? {
    id,
    weaponId: seed.weaponId,
    ammoIndex: seed.ammoIndex,
    ammoModeIndex: seed.ammoModeIndex,
    attachmentBySlot: { ...seed.attachmentBySlot },
    attachmentActiveBySlot: { ...seed.attachmentActiveBySlot },
  } : emptyDamageBuild(id);
}

function simulateBuild(
  build: DerivedDamageBuild,
  distance: number,
  target: ArmorTarget | null,
  thresholds: MobThresholdPair | null,
  hitDirection: HitDirection,
): BuildResult | null {
  if (!build.weapon || !build.selectedProjectile || !build.modifiedStats || !target || !thresholds) return null;
  const engagement = simulateEngagement({
    effectiveDamage: build.effectiveDamage,
    projectilesPerShot: build.projectilesPerShot,
    distance,
    falloffThresholds: build.falloffThresholds,
    weaponFalloffMultiplier: build.weaponFalloffMultiplier,
    baseArmorPiercing: build.armorPiercing,
    baseDamageMultiplier: build.modifiedStats.damageMultiplier,
    baseShotsPerSecond: build.modifiedStats.shotsPerSecond,
    weaponCategory: "bullet",
    target,
    hitDirection,
    gunStacks: WEAPON_GUN_STACKS[build.weapon.id],
    overheat: build.overheat,
    holoTargeting: build.holoTargeting,
  }, thresholds);
  return {
    firstShotDamage: engagement.shots[0]?.totalDamage ?? 0,
    hitsToDead: engagement.hitsToDead,
    timeToDeadSeconds: engagement.timeToDeadSeconds,
    armorPiercing: engagement.shots[0]?.armorPiercing ?? build.armorPiercing,
  };
}

function finite(value: number, suffix = "") {
  return Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : "—";
}

function targetLabel(target: TargetSelection | null, mobCatalog: MobCatalog) {
  if (!target) return "Цель не выбрана";
  if (target.kind === "marine") return MARINE_PRESETS.find((entry) => entry.id === target.presetId)?.name ?? target.presetId;
  const caste = mobCatalog.xenoCastes[target.casteId];
  return caste ? xenoCasteLabel(caste) : target.casteId;
}

function attachmentSummary(build: DerivedDamageBuild) {
  const names = build.equippedAttachments.map(({ item }) => item.name);
  return names.length ? names.slice(0, 2).join(" · ") + (names.length > 2 ? ` · +${names.length - 2}` : "") : "Без обвесов";
}

function CompareChart({ builds, target, thresholds, hitDirection, selectedDistance }: {
  builds: DerivedDamageBuild[];
  target: ArmorTarget | null;
  thresholds: MobThresholdPair | null;
  hitDirection: HitDirection;
  selectedDistance: number;
}) {
  const series = builds.map((build) => ({
    build,
    values: GRAPH_DISTANCES.map((distance) => simulateBuild(build, distance, target, thresholds, hitDirection)?.firstShotDamage ?? 0),
  }));
  const maxDamage = Math.max(1, ...series.flatMap((entry) => entry.values));
  const width = 720;
  const height = 280;
  const left = 45;
  const right = 16;
  const top = 18;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (distance: number) => left + (distance / 40) * plotWidth;
  const y = (damage: number) => top + plotHeight - (damage / maxDamage) * plotHeight;
  const guideX = x(selectedDistance);

  if (!series.some((entry) => entry.build.weapon && entry.values.some((value) => value > 0))) {
    return <div className="compare-chart-empty">Выберите оружие и цель — график появится автоматически.</div>;
  }

  return (
    <svg className="compare-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Сравнение урона сборок по дистанции">
      {[0, .25, .5, .75, 1].map((ratio) => (
        <g key={ratio}>
          <line className="compare-chart-grid" x1={left} x2={width - right} y1={top + plotHeight * ratio} y2={top + plotHeight * ratio} />
          <text x={left - 8} y={top + plotHeight * ratio + 4} textAnchor="end">{formatNumber(maxDamage * (1 - ratio))}</text>
        </g>
      ))}
      {GRAPH_DISTANCES.filter((distance) => distance % 10 === 0).map((distance) => (
        <g key={distance}>
          <line className="compare-chart-grid" x1={x(distance)} x2={x(distance)} y1={top} y2={top + plotHeight} />
          <text x={x(distance)} y={height - 8} textAnchor="middle">{distance}</text>
        </g>
      ))}
      <line className="compare-chart-guide" x1={guideX} x2={guideX} y1={top} y2={top + plotHeight} />
      {series.map(({ build, values }, index) => build.weapon ? (
        <polyline
          key={build.state.id}
          className={`compare-chart-line series-${index + 1}`}
          points={values.map((value, pointIndex) => `${x(GRAPH_DISTANCES[pointIndex])},${y(value)}`).join(" ")}
        />
      ) : null)}
    </svg>
  );
}

export function DamageComparison({ catalog, mobCatalog, seed }: {
  catalog: Catalog;
  mobCatalog: MobCatalog;
  seed: DamageBuildUrlState;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialState] = useState(() => readDamageComparisonUrlState(searchParams));
  const [builds, setBuilds] = useState<DamageBuildState[]>(() => initialState
    ? initialState.builds.map(buildFromUrl)
    : [copySeed(seed, "build-1"), emptyDamageBuild("build-2")]);
  const [expandedBuildId, setExpandedBuildId] = useState<string | null>(() => builds[0]?.id ?? null);
  const [targetExpanded, setTargetExpanded] = useState(() => !initialState?.target);
  const [target, setTarget] = useState<TargetSelection | null>(initialState?.target ?? null);
  const [targetMatured, setTargetMatured] = useState(initialState?.targetMatured ?? false);
  const [hitDirection, setHitDirection] = useState<HitDirection>(initialState?.hitDirection ?? "front");
  const [activeAbilities, setActiveAbilities] = useState<Set<string>>(initialState?.activeAbilities ?? new Set());
  const [distance, setDistance] = useState(initialState?.distance ?? 5);
  const [picker, setPicker] = useState<ComparePicker>(null);
  const lockedIds = useMemo(() => lockedIntegratedAttachmentIds(catalog), [catalog]);
  const derivedBuilds = useMemo(() => builds.map((build) => deriveDamageBuild(catalog, build, lockedIds)), [builds, catalog, lockedIds]);

  const baseTargetArmor = useMemo(() => targetArmorFrom(target, catalog, mobCatalog), [catalog, mobCatalog, target]);
  const selectedCaste = target?.kind === "xeno" ? mobCatalog.xenoCastes[target.casteId] : undefined;
  const canMature = selectedCaste?.maturedThresholds != null;
  const effectiveTargetMatured = Boolean(canMature && targetMatured);
  const thresholds = useMemo(() => targetThresholdsFrom(target, mobCatalog, effectiveTargetMatured), [effectiveTargetMatured, mobCatalog, target]);
  const targetArmor = target?.kind === "xeno" && baseTargetArmor?.kind === "xeno"
    ? applyXenoAbilityBonuses(baseTargetArmor, target.casteId, activeAbilities)
    : baseTargetArmor;
  const xenoAbilities = target?.kind === "xeno" ? XENO_DEFENSIVE_ABILITIES[target.casteId] : undefined;
  const results = derivedBuilds.map((build) => simulateBuild(build, distance, targetArmor, thresholds, hitDirection));

  useEffect(() => {
    setSearchParams(writeDamageComparisonUrlState({
      builds: builds.map(buildForUrl),
      target,
      targetMatured: effectiveTargetMatured,
      hitDirection,
      activeAbilities,
      distance,
    }), { replace: true });
  }, [activeAbilities, builds, distance, effectiveTargetMatured, hitDirection, setSearchParams, target]);

  const updateBuild = (buildId: string, updater: (current: DamageBuildState) => DamageBuildState) => {
    setBuilds((current) => current.map((build) => build.id === buildId ? updater(build) : build));
  };

  const selectWeapon = (buildId: string, weaponId: string) => {
    const defaultMode = catalog.items[weaponId]?.weaponStats?.defaultAmmoModeIndex;
    updateBuild(buildId, (build) => ({
      ...build,
      weaponId,
      ammoIndex: 0,
      ammoModeIndex: typeof defaultMode === "number" ? defaultMode : 0,
      attachmentBySlot: {},
      attachmentActiveBySlot: {},
    }));
    setPicker(null);
  };

  const clearWeapon = (buildId: string) => updateBuild(buildId, (build) => ({
    ...build,
    weaponId: null,
    ammoIndex: 0,
    ammoModeIndex: 0,
    attachmentBySlot: {},
    attachmentActiveBySlot: {},
  }));

  const selectAttachment = (buildId: string, slotId: string, itemId: string) => {
    updateBuild(buildId, (build) => ({ ...build, attachmentBySlot: { ...build.attachmentBySlot, [slotId]: itemId } }));
    setPicker(null);
  };

  const clearAttachment = (buildId: string, slotId: string) => updateBuild(buildId, (build) => {
    const attachmentBySlot = { ...build.attachmentBySlot };
    const attachmentActiveBySlot = { ...build.attachmentActiveBySlot };
    delete attachmentBySlot[slotId];
    delete attachmentActiveBySlot[slotId];
    return { ...build, attachmentBySlot, attachmentActiveBySlot };
  });

  const duplicateBuild = (buildId: string) => {
    if (builds.length >= MAX_BUILDS) return;
    const source = builds.find((build) => build.id === buildId);
    if (!source) return;
    const id = `build-${Date.now().toString(36)}`;
    const copy = copySeed(buildForUrl(source), id);
    setBuilds((current) => [...current, copy]);
    setExpandedBuildId(id);
  };

  const removeBuild = (buildId: string) => {
    if (builds.length <= MIN_BUILDS) return;
    setBuilds((current) => {
      const next = current.filter((build) => build.id !== buildId);
      if (expandedBuildId === buildId) setExpandedBuildId(next[0]?.id ?? null);
      return next;
    });
  };

  const addBuild = () => {
    if (builds.length >= MAX_BUILDS) return;
    const id = `build-${Date.now().toString(36)}`;
    setBuilds((current) => [...current, emptyDamageBuild(id)]);
    setExpandedBuildId(id);
  };

  const selectTarget = (selection: TargetSelection) => {
    setTarget(selection);
    setTargetMatured(false);
    setActiveAbilities(new Set());
    setTargetExpanded(false);
    setPicker(null);
  };

  const activePickerBuild = picker && "buildId" in picker
    ? derivedBuilds.find((build) => build.state.id === picker.buildId)
    : undefined;
  const activePickerSlot = picker?.type === "attachment"
    ? activePickerBuild?.attachmentSlots.find((slot) => slot.id === picker.slotId)
    : undefined;

  return (
    <div className="damage-compare-view">
      <section className={`compare-target${targetExpanded ? " is-open" : ""}`}>
        <button type="button" className="compare-target-head" onClick={() => setTargetExpanded((value) => !value)} aria-expanded={targetExpanded}>
          <span><small>ОБЩАЯ ЦЕЛЬ</small><strong>{targetLabel(target, mobCatalog)}</strong></span>
          <span className="compare-target-summary">{target ? `${effectiveTargetMatured ? "Зрелая · " : ""}${hitDirection === "front" ? "спереди" : hitDirection === "side" ? "сбоку" : "сзади"}` : "Нажмите, чтобы выбрать"}</span>
          <i aria-hidden="true">⌄</i>
        </button>
        <div className="compare-target-body">
          <TargetSlot
            label="Выбрать цель"
            selection={target}
            catalog={catalog}
            mobCatalog={mobCatalog}
            matured={effectiveTargetMatured}
            onOpen={() => setPicker({ type: "target" })}
            onClear={target ? () => { setTarget(null); setTargetMatured(false); setActiveAbilities(new Set()); } : undefined}
          />
          {canMature && (
            <div className="target-stage-control">
              <header><span>Стадия развития</span><small>Влияет на пороги здоровья</small></header>
              <div className="direction-control maturity-control" role="radiogroup" aria-label="Стадия развития цели">
                <button type="button" role="radio" aria-checked={!effectiveTargetMatured} className={!effectiveTargetMatured ? "is-active" : ""} onClick={() => setTargetMatured(false)}>Незрелая</button>
                <button type="button" role="radio" aria-checked={effectiveTargetMatured} className={effectiveTargetMatured ? "is-active" : ""} onClick={() => setTargetMatured(true)}>Зрелая</button>
              </div>
            </div>
          )}
          {targetArmor?.kind === "xeno" && (
            <div className="direction-control" role="radiogroup" aria-label="Направление попадания">
              {(["front", "side", "back"] as const).map((direction) => (
                <button type="button" role="radio" aria-checked={hitDirection === direction} className={hitDirection === direction ? "is-active" : ""} key={direction} onClick={() => setHitDirection(direction)}>
                  {direction === "front" ? "Спереди" : direction === "side" ? "Сбоку" : "Сзади"}
                </button>
              ))}
            </div>
          )}
          {xenoAbilities?.map((ability) => (
            <button type="button" key={ability.name} className={`attachment-toggle${activeAbilities.has(ability.name) ? " is-active" : ""}`} onClick={() => setActiveAbilities((current) => toggleXenoAbility(target!.kind === "xeno" ? target!.casteId : "", current, ability.name))}>
              {ability.name}: {activeAbilities.has(ability.name) ? "Активна" : "Неактивна"}
            </button>
          ))}
        </div>
      </section>

      <div className="compare-workspace">
        <section className="compare-builds" aria-label="Сравниваемые сборки">
          <header className="compare-section-title"><div><small>LOADOUT MATRIX</small><h2>Сборки</h2></div><span>{builds.length} / {MAX_BUILDS}</span></header>
          <div className="compare-build-list">
            {derivedBuilds.map((build, index) => {
              const isOpen = expandedBuildId === build.state.id;
              const result = results[index];
              return (
                <article className={`compare-build series-${index + 1}${isOpen ? " is-open" : ""}`} key={build.state.id}>
                  <button type="button" className="compare-build-head" onClick={() => setExpandedBuildId(isOpen ? null : build.state.id)} aria-expanded={isOpen}>
                    <i className="compare-series-mark" aria-hidden="true" />
                    <span className="compare-build-name"><small>СБОРКА {String(index + 1).padStart(2, "0")}</small><strong>{build.weapon?.name ?? "Оружие не выбрано"}</strong><em>{build.weapon ? `${ammoLabel(build)} · ${attachmentSummary(build)}` : "Нажмите, чтобы настроить"}</em></span>
                    <span className="compare-build-quick"><strong>{result ? finite(result.firstShotDamage) : "—"}</strong><small>урон · {distance} т.</small></span>
                    <i className="compare-chevron" aria-hidden="true">⌄</i>
                  </button>
                  <div className="compare-build-body">
                    <ItemSlot label="Выбрать оружие" item={build.weapon} onOpen={() => setPicker({ type: "weapon", buildId: build.state.id })} onClear={build.weapon ? () => clearWeapon(build.state.id) : undefined} />
                    {build.weapon && build.attachmentSlots.length > 0 && (
                      <section className="damage-section attachment-section">
                        <header className="damage-section-header"><h3>Обвесы</h3><span>{build.attachmentSlots.length} слота</span></header>
                        <div className="attachment-rack">
                          {build.attachmentSlots.map((slot) => {
                            const itemId = slot.locked ? slot.startingItemId ?? slot.installedItemIds?.[0] : build.effectiveAttachmentBySlot[slot.id];
                            const item: CatalogItem | null = itemId ? catalog.items[itemId] ?? null : null;
                            const toggleable = item ? isToggleableAttachment(item) && !isGunAttachment(item) : false;
                            const active = Boolean(build.state.attachmentActiveBySlot[slot.id]);
                            return (
                              <div className="attachment-slot-wrap" key={slot.id}>
                                <ItemSlot label={slot.name ?? slot.slotName ?? "Обвес"} item={item} compact locked={slot.locked} onOpen={slot.locked ? undefined : () => setPicker({ type: "attachment", buildId: build.state.id, slotId: slot.id })} onClear={item && !slot.locked ? () => clearAttachment(build.state.id, slot.id) : undefined} />
                                {toggleable && <button type="button" className={`attachment-toggle${active ? " is-active" : ""}`} onClick={() => updateBuild(build.state.id, (current) => ({ ...current, attachmentActiveBySlot: { ...current.attachmentActiveBySlot, [slot.id]: !current.attachmentActiveBySlot[slot.id] } }))}>{active ? "Активен" : "Неактивен"}</button>}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {build.ammunition.length > 0 && <><h3>Боеприпас</h3><AmmoPicker ammunition={build.ammunition} selectedIndex={build.ammoIndex} onSelect={(ammoIndex) => updateBuild(build.state.id, (current) => ({ ...current, ammoIndex }))} /></>}
                    {build.ammoModes.length > 0 && <><h3>Режим боеприпаса</h3><AmmoModePicker modes={build.ammoModes} selectedIndex={build.ammoModeIndex} onSelect={(ammoModeIndex) => updateBuild(build.state.id, (current) => ({ ...current, ammoModeIndex }))} /></>}
                    {build.modifiedStats && (
                      <dl className="stat-grid compare-build-stats">
                        <div><dt>Точность</dt><dd>×{formatNumber(build.modifiedStats.accuracyWieldedMultiplier)}</dd></div>
                        <div><dt>Разброс</dt><dd>{formatNumber(build.modifiedStats.scatterWielded)}</dd></div>
                        <div><dt>Скорострельность</dt><dd>{formatNumber(build.modifiedStats.shotsPerSecond)}/с</dd></div>
                        <div><dt>Бронепробитие</dt><dd>{formatNumber(build.armorPiercing)}</dd></div>
                      </dl>
                    )}
                    <div className="compare-build-actions">
                      <button type="button" onClick={() => duplicateBuild(build.state.id)} disabled={builds.length >= MAX_BUILDS}>Дублировать</button>
                      <button type="button" onClick={() => removeBuild(build.state.id)} disabled={builds.length <= MIN_BUILDS}>Удалить</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <button type="button" className="compare-add-build" onClick={addBuild} disabled={builds.length >= MAX_BUILDS}>＋ Добавить сборку</button>
        </section>

        <section className="compare-results">
          <header className="compare-section-title"><div><small>FIRE SOLUTION</small><h2>Результат</h2></div><span>{distance} тайлов</span></header>
          <DistanceControl distance={distance} onChange={setDistance} />
          <div className="compare-legend" aria-label="Легенда графика">
            {derivedBuilds.map((build, index) => <span className={`series-${index + 1}`} key={build.state.id}><i aria-hidden="true" />{String(index + 1).padStart(2, "0")} · {build.weapon?.name ?? "Не выбрано"}</span>)}
          </div>
          <CompareChart builds={derivedBuilds} target={targetArmor} thresholds={thresholds} hitDirection={hitDirection} selectedDistance={distance} />
          <div className="compare-result-table" role="table" aria-label={`Результаты на дистанции ${distance} тайлов`}>
            <div className="compare-result-row is-head" role="row"><span>Сборка</span><span>Урон</span><span>БП</span><span>Выстрелов</span><span>Время</span></div>
            {derivedBuilds.map((build, index) => {
              const result = results[index];
              return <div className={`compare-result-row series-${index + 1}`} role="row" key={build.state.id}><span><i aria-hidden="true" />{String(index + 1).padStart(2, "0")} · {build.weapon?.name ?? "Не выбрано"}</span><span>{result ? finite(result.firstShotDamage) : "—"}</span><span>{result ? finite(result.armorPiercing) : "—"}</span><span>{result ? finite(result.hitsToDead) : "—"}</span><span>{result ? finite(result.timeToDeadSeconds, " с") : "—"}</span></div>;
            })}
          </div>
        </section>
      </div>

      {picker?.type === "weapon" && activePickerBuild && (
        <PickerModal title="Выбор оружия" onClose={() => setPicker(null)}><WeaponPicker catalog={catalog} selectedId={activePickerBuild.weapon?.id ?? null} onSelect={(id) => selectWeapon(picker.buildId, id)} /></PickerModal>
      )}
      {picker?.type === "attachment" && activePickerBuild && activePickerSlot && (
        <PickerModal title={activePickerSlot.name ?? activePickerSlot.slotName ?? "Обвес"} onClose={() => setPicker(null)}>
          <AttachmentPicker catalog={catalog} compatibleItemIds={(activePickerSlot.compatibleItemIds ?? []).filter((id) => isCompatibleAttachment(catalog, activePickerSlot, id, lockedIds))} selectedId={activePickerBuild.effectiveAttachmentBySlot[picker.slotId] ?? null} onSelect={(id) => selectAttachment(picker.buildId, picker.slotId, id)} />
        </PickerModal>
      )}
      {picker?.type === "target" && (
        <PickerModal title="Выбор цели" onClose={() => setPicker(null)}><TargetPicker catalog={catalog} mobCatalog={mobCatalog} selected={target} onSelect={selectTarget} /></PickerModal>
      )}
    </div>
  );
}

export function damageBuildSeed(state: DamageUrlState): DamageBuildUrlState {
  return {
    weaponId: state.weaponId,
    ammoIndex: state.ammoIndex,
    ammoModeIndex: state.ammoModeIndex,
    attachmentBySlot: state.attachmentBySlot,
    attachmentActiveBySlot: state.attachmentActiveBySlot,
  };
}
