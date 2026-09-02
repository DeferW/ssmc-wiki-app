import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCatalog } from "../equipment/catalogStore";
import { formatNumber, isMap, readableId } from "../equipment/format";
import type { CatalogItem, JsonMap } from "../equipment/types";
import {
  collectRangedModifierEntries,
  foldAttachmentModifiers,
  isGunAttachment,
  isToggleableAttachment,
  statDelta,
} from "./attachmentModifiers";
import type { EquippedAttachment, StatDirection, WeaponModifiableStats } from "./attachmentModifiers";
import { aimedShotAbilityFrom } from "./aimedShot";
import type { AimedShotEffectConfig } from "./aimedShot";
import { isCompatibleAttachment, lockedIntegratedAttachmentIds } from "./attachmentEligibility";
import type { DamageFalloffThreshold, DamageTypeMap, HitDirection, HoloTargetingConfig, OverheatConfig } from "./damageMath";
import { useMobCatalog } from "./mobCatalogStore";
import { targetArmorFrom, targetSizeFrom, targetThresholdsFrom } from "./target";
import type { TargetSelection } from "./target";
import { applyXenoAbilityBonuses, toggleXenoAbility, XENO_DEFENSIVE_ABILITIES } from "./xenoAbilities";
import { WEAPON_GUN_STACKS } from "./weaponGunStacks";
import { canDamageAnyTarget } from "./weaponEligibility";
import { readDamageUrlState, writeDamageUrlState } from "./urlState";
import { AimedShotCard } from "./components/AimedShotCard";
import { AmmoModePicker, AmmoPicker, ammoProjectiles } from "./components/AmmoPicker";
import { AttachmentPicker } from "./components/AttachmentPicker";
import { DistanceControl } from "./components/DistanceControl";
import { ItemSlot } from "./components/ItemSlot";
import { PickerModal } from "./components/PickerModal";
import { ResultPanel } from "./components/ResultPanel";
import { TargetPicker } from "./components/TargetPicker";
import { TargetSlot } from "./components/TargetSlot";
import { WeaponPicker } from "./components/WeaponPicker";
import { DamageComparison, damageBuildSeed } from "./components/DamageComparison";

type PickerState = { type: "weapon" } | { type: "attachment"; slotId: string } | { type: "target" } | null;

function numberField(container: unknown, key: string): number | undefined {
  return isMap(container) && typeof container[key] === "number" ? (container[key] as number) : undefined;
}

function damageTypeMapFrom(value: unknown): DamageTypeMap {
  if (!isMap(value)) return {};
  const result: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(value)) {
    if (typeof amount === "number") result[type] = amount;
  }
  return result;
}

function scaleDamage(damage: DamageTypeMap, ratio: number): DamageTypeMap {
  const result: DamageTypeMap = {};
  for (const [type, amount] of Object.entries(damage)) result[type] = amount * ratio;
  return result;
}

function aimedShotEffectFrom(projectile: JsonMap | undefined): AimedShotEffectConfig | undefined {
  const raw = projectile?.aimedShotEffect;
  if (!isMap(raw) || typeof raw.extraHits !== "number") return undefined;
  return {
    extraHits: raw.extraHits,
    fireStacksOnHit: typeof raw.fireStacksOnHit === "number" ? raw.fireStacksOnHit : undefined,
    blindDuration: typeof raw.blindDuration === "number" ? raw.blindDuration : undefined,
    slowDuration: typeof raw.slowDuration === "number" ? raw.slowDuration : undefined,
    superSlowDuration: typeof raw.superSlowDuration === "number" ? raw.superSlowDuration : undefined,
  };
}

function damageFalloffFrom(projectile: JsonMap | undefined): JsonMap | undefined {
  if (isMap(projectile?.damageFalloff)) return projectile.damageFalloff;
  return undefined;
}

function falloffThresholdsFrom(projectile: JsonMap | undefined, rangeFlat = 0): DamageFalloffThreshold[] {
  const raw = damageFalloffFrom(projectile)?.thresholds;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMap).map((entry) => ({
    range: (typeof entry.range === "number" ? entry.range : 0) + rangeFlat,
    falloff: typeof entry.falloff === "number" ? entry.falloff : 0,
    ignoreModifiers: entry.ignoreModifiers === true,
  }));
}

function DamageBreakdown({ damage }: { damage: DamageTypeMap }) {
  const labels: Record<string, string> = {
    Blunt: "Дробящий",
    Slash: "Режущий",
    Piercing: "Колющий",
    Heat: "Термический",
    Caustic: "Кислотный",
    Structural: "Структурный",
  };
  const entries = Object.entries(damage).filter(([, amount]) => amount !== 0);
  if (!entries.length) return <>—</>;
  return (
    <span className={`damage-type-values${entries.length === 1 ? " is-single" : ""}`}>
      {entries.map(([type, amount]) => <span key={type}><small>{labels[type] ?? readableId(type)}</small><b>{formatNumber(amount)}</b></span>)}
    </span>
  );
}

function FalloffRows({ projectile, rangeFlat, weaponMultiplier }: {
  projectile: JsonMap;
  rangeFlat: number;
  weaponMultiplier: number;
}) {
  const falloff = damageFalloffFrom(projectile);
  if (!falloff) return null;

  const thresholds = falloffThresholdsFrom(projectile, rangeFlat);
  const minimumPercent = (numberField(falloff, "minRemainingDamageMult") ?? 0.05) * 100;
  const gradual = thresholds
    .map((threshold) => ({
      ...threshold,
      effectiveFalloff: threshold.falloff * (threshold.ignoreModifiers ? 1 : weaponMultiplier),
    }))
    .filter((threshold) => threshold.effectiveFalloff > 0 && threshold.effectiveFalloff < 999);
  const hardLimits = thresholds.filter((threshold) => {
    const effective = threshold.falloff * (threshold.ignoreModifiers ? 1 : weaponMultiplier);
    return effective >= 999;
  });

  return (
    <>
      {gradual.length > 0 && (
        <div>
          <dt>Падение урона</dt>
          <dd className="falloff-values">
            {gradual.map((threshold, index) => (
              <span key={`${threshold.range}:${threshold.falloff}:${index}`}>
                {threshold.range > 0 ? `После ${formatNumber(threshold.range)} т.` : "С первого тайла"}: −{formatNumber(threshold.effectiveFalloff)} за тайл
              </span>
            ))}
          </dd>
        </div>
      )}
      {hardLimits.length > 0 && (
        <div>
          <dt>Предельная дальность</dt>
          <dd className="falloff-values">
            {hardLimits.map((threshold, index) => (
              <span key={`${threshold.range}:${threshold.falloff}:${index}`}>
                После {formatNumber(threshold.range)} т. остаётся минимум {formatNumber(minimumPercent)}%
              </span>
            ))}
          </dd>
        </div>
      )}
    </>
  );
}

function overheatConfigFrom(stats: JsonMap | undefined): OverheatConfig | undefined {
  const raw = isMap(stats?.overheat) ? stats.overheat : undefined;
  if (!raw) return undefined;
  const maxHeat = numberField(raw, "maxHeat");
  const heatPerShot = numberField(raw, "heatPerShot");
  if (maxHeat == null || heatPerShot == null) return undefined;
  return {
    maxHeat,
    heatPerShot,
    cooldownRate: numberField(raw, "cooldownRate") ?? 0,
    emergencyCooldownMultiplier: numberField(raw, "emergencyCooldownMultiplier") ?? 0,
    emergencyCooldownDelaySeconds: numberField(raw, "emergencyCooldownDelaySeconds") ?? 0,
  };
}

function holoTargetingConfigFrom(projectile: JsonMap | undefined): HoloTargetingConfig | undefined {
  const raw = isMap(projectile?.holoTargeting) ? projectile.holoTargeting : undefined;
  if (!raw) return undefined;
  const stacksPerHit = numberField(raw, "stacksPerHit");
  const maxStacks = numberField(raw, "maxStacks");
  const decayPerSecond = numberField(raw, "decayPerSecond");
  const decayDelaySeconds = numberField(raw, "decayDelaySeconds");
  const damageMultiplierPerStack = numberField(raw, "damageMultiplierPerStack");
  if (
    stacksPerHit == null
    || maxStacks == null
    || decayPerSecond == null
    || decayDelaySeconds == null
    || damageMultiplierPerStack == null
  ) return undefined;
  return { stacksPerHit, maxStacks, decayPerSecond, decayDelaySeconds, damageMultiplierPerStack };
}

function sustainedShotsToOverheat(overheat: OverheatConfig | undefined, shotsPerSecond: number) {
  if (!overheat || shotsPerSecond <= 0) return null;
  const netHeatPerSecond = shotsPerSecond * overheat.heatPerShot - overheat.cooldownRate;
  return netHeatPerSecond > 0
    ? Math.ceil((overheat.maxHeat / netHeatPerSecond) * shotsPerSecond)
    : null;
}

function StatRow({ label, from, to, direction, format }: {
  label: string;
  from: number;
  to: number;
  direction: StatDirection;
  format: (value: number) => string;
}) {
  const delta = statDelta(from, to, direction);
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {delta ? (
          <span className={`stat-delta ${delta.better ? "is-better" : "is-worse"}`}>
            {format(from)} <i aria-hidden="true">→</i> {format(to)}
          </span>
        ) : format(to)}
      </dd>
    </div>
  );
}

function DamagePanelHeader({ index, eyebrow, title, description }: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="damage-panel-header">
      <span className="damage-panel-index" aria-hidden="true">{index}</span>
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
        <small>{description}</small>
      </div>
    </header>
  );
}

export function DamagePage() {
  const { catalog, error, loading, retry } = useCatalog();
  const { mobCatalog, error: mobError, loading: mobLoading } = useMobCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialUrlState] = useState(() => readDamageUrlState(searchParams));
  const [viewMode, setViewMode] = useState<"single" | "compare">(() => searchParams.get("view") === "compare" ? "compare" : "single");
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | null>(initialUrlState.weaponId);
  const [selectedAmmoIndex, setSelectedAmmoIndex] = useState(initialUrlState.ammoIndex);
  const [selectedAmmoModeIndex, setSelectedAmmoModeIndex] = useState(initialUrlState.ammoModeIndex);
  const [attachmentBySlot, setAttachmentBySlot] = useState<Record<string, string>>(initialUrlState.attachmentBySlot);
  const [attachmentActiveBySlot, setAttachmentActiveBySlot] = useState<Record<string, boolean>>(initialUrlState.attachmentActiveBySlot);
  const [target, setTarget] = useState<TargetSelection | null>(initialUrlState.target);
  const [targetMatured, setTargetMatured] = useState(initialUrlState.targetMatured);
  const [hitDirection, setHitDirection] = useState<HitDirection>(initialUrlState.hitDirection);
  const [activeAbilities, setActiveAbilities] = useState<Set<string>>(initialUrlState.activeAbilities);
  const [distance, setDistance] = useState(initialUrlState.distance);
  const [picker, setPicker] = useState<PickerState>(null);

  const selectedWeaponCandidate = selectedWeaponId && catalog ? catalog.items[selectedWeaponId] : null;
  const selectedWeapon = selectedWeaponCandidate?.category === "Оружие" && canDamageAnyTarget(selectedWeaponCandidate)
    ? selectedWeaponCandidate
    : null;
  const attachmentSlots = useMemo(() => {
    if (!selectedWeapon) return [];
    const holder = selectedWeapon.properties?.AttachableHolder;
    const rawSlots = isMap(holder?.slots) ? holder.slots : {};
    return (selectedWeapon.attachmentSlots ?? []).map((slot) => {
      const slotId = slot.id ?? slot.slotId ?? "";
      const rawSlot = isMap(rawSlots[slotId]) ? rawSlots[slotId] : {};
      return {
        ...slot,
        locked: slot.locked ?? rawSlot.locked === true,
        startingItemId: slot.startingItemId
          ?? (typeof rawSlot.startingAttachable === "string" ? rawSlot.startingAttachable : slot.installedItemIds?.[0]),
      };
    });
  }, [selectedWeapon]);
  const lockedIntegratedIds = useMemo(
    () => catalog ? lockedIntegratedAttachmentIds(catalog) : new Set<string>(),
    [catalog],
  );
  const effectiveAttachmentBySlot = useMemo(() => {
    if (!catalog) return {};
    const result: Record<string, string> = {};
    for (const slot of attachmentSlots) {
      if (slot.locked) continue;
      const slotId = slot.id ?? slot.slotId;
      const itemId = slotId ? attachmentBySlot[slotId] : undefined;
      if (slotId && itemId && isCompatibleAttachment(catalog, slot, itemId, lockedIntegratedIds)) {
        result[slotId] = itemId;
      }
    }
    return result;
  }, [attachmentBySlot, attachmentSlots, catalog, lockedIntegratedIds]);

  const ammunition = useMemo(() => {
    const raw = selectedWeapon?.weaponStats?.ammunition;
    return Array.isArray(raw) ? raw.filter(isMap) : [];
  }, [selectedWeapon]);
  const effectiveAmmoIndex = selectedAmmoIndex >= 0 && selectedAmmoIndex < ammunition.length ? selectedAmmoIndex : 0;
  const selectedAmmo: JsonMap | undefined = ammunition[effectiveAmmoIndex];
  const projectiles = useMemo(() => ammoProjectiles(selectedAmmo), [selectedAmmo]);
  const ammoModes = useMemo(() => {
    const raw = selectedWeapon?.weaponStats?.ammoModes;
    return Array.isArray(raw) ? raw.filter(isMap) : [];
  }, [selectedWeapon]);
  const effectiveAmmoModeIndex = selectedAmmoModeIndex >= 0 && selectedAmmoModeIndex < ammoModes.length
    ? selectedAmmoModeIndex
    : 0;
  const selectedAmmoMode = ammoModes[effectiveAmmoModeIndex];

  useEffect(() => {
    if (!catalog || viewMode !== "single") return;
    setSearchParams(writeDamageUrlState({
      weaponId: selectedWeapon?.id ?? null,
      ammoIndex: effectiveAmmoIndex,
      ammoModeIndex: effectiveAmmoModeIndex,
      attachmentBySlot: effectiveAttachmentBySlot,
      attachmentActiveBySlot,
      target,
      targetMatured,
      hitDirection,
      activeAbilities,
      distance,
    }), { replace: true });
  }, [
    activeAbilities,
    attachmentActiveBySlot,
    catalog,
    distance,
    effectiveAmmoIndex,
    effectiveAmmoModeIndex,
    effectiveAttachmentBySlot,
    hitDirection,
    selectedWeapon,
    setSearchParams,
    target,
    targetMatured,
    viewMode,
  ]);

  const selectWeapon = (id: string) => {
    setSelectedWeaponId(id);
    setSelectedAmmoIndex(0);
    const defaultMode = catalog?.items[id]?.weaponStats?.defaultAmmoModeIndex;
    setSelectedAmmoModeIndex(typeof defaultMode === "number" ? defaultMode : 0);
    setAttachmentBySlot({});
    setAttachmentActiveBySlot({});
    setPicker(null);
  };

  const clearWeapon = () => {
    setSelectedWeaponId(null);
    setAttachmentBySlot({});
    setAttachmentActiveBySlot({});
  };

  const selectAttachment = (slotId: string, itemId: string) => {
    setAttachmentBySlot((current) => ({ ...current, [slotId]: itemId }));
    setPicker(null);
  };

  const clearAttachment = (slotId: string) => {
    setAttachmentBySlot((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
    setAttachmentActiveBySlot((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  };

  const toggleAttachmentActive = (slotId: string) => {
    setAttachmentActiveBySlot((current) => ({ ...current, [slotId]: !current[slotId] }));
  };

  const equippedAttachments: EquippedAttachment[] = useMemo(() => {
    if (!catalog) return [];
    const result: EquippedAttachment[] = [];
    for (const slot of attachmentSlots) {
      const slotId = slot.id ?? slot.slotId;
      const itemId = slot.locked
        ? slot.startingItemId ?? slot.installedItemIds?.[0]
        : slotId ? effectiveAttachmentBySlot[slotId] : undefined;
      const item = itemId ? catalog.items[itemId] : undefined;
      if (item) result.push({ item, active: slotId ? Boolean(attachmentActiveBySlot[slotId]) : false });
    }
    return result;
  }, [attachmentSlots, effectiveAttachmentBySlot, attachmentActiveBySlot, catalog]);

  const weaponStats = selectedWeapon?.weaponStats;
  const weaponFalloff = isMap(selectedWeapon?.properties?.RMCWeaponDamageFalloff)
    ? selectedWeapon.properties.RMCWeaponDamageFalloff
    : undefined;
  const baseStats: WeaponModifiableStats | null = selectedWeapon ? {
    damageMultiplier: numberField(weaponStats, "damageMultiplier") ?? 1,
    accuracyWieldedMultiplier: numberField(isMap(weaponStats) ? weaponStats.accuracy : undefined, "wieldedMultiplier") ?? 1,
    scatterWielded: numberField(isMap(weaponStats) ? weaponStats.scatter : undefined, "wielded") ?? 0,
    recoilWielded: numberField(isMap(weaponStats) ? weaponStats.recoil : undefined, "wielded") ?? 0,
    shotsPerSecond: numberField(weaponStats, "shotsPerSecond") ?? 0,
    damageFalloffMultiplier: numberField(weaponFalloff, "falloffMultiplier") ?? 1,
    rangeFlat: numberField(weaponFalloff, "rangeFlat") ?? 0,
  } : null;

  const modifiedStats = baseStats
    ? foldAttachmentModifiers(baseStats, collectRangedModifierEntries(equippedAttachments, selectedWeapon?.tags ?? []))
    : null;

  // effectiveDamage in the catalog already has the weapon's own damageMultiplier
  // baked in; attachments only change that multiplier, so the attachment-adjusted
  // damage is the catalog value rescaled by the ratio of modified to base multiplier.
  const damageRatio = baseStats && modifiedStats && baseStats.damageMultiplier > 0
    ? modifiedStats.damageMultiplier / baseStats.damageMultiplier
    : 1;
  const selectedProjectile = projectiles[0];
  const projectilesPerShot = typeof selectedProjectile?.projectilesPerShot === "number"
    ? Math.max(1, Math.floor(selectedProjectile.projectilesPerShot))
    : 1;
  const adjustedEffectiveDamage = scaleDamage(
    damageTypeMapFrom(selectedAmmoMode?.damage ?? selectedProjectile?.effectiveDamage ?? selectedProjectile?.damage),
    damageRatio,
  );
  const falloffThresholds = falloffThresholdsFrom(selectedProjectile, modifiedStats?.rangeFlat ?? 0);
  const weaponFalloffMultiplier = modifiedStats?.damageFalloffMultiplier ?? 1;
  const armorPiercing = typeof selectedAmmoMode?.armorPiercing === "number"
    ? selectedAmmoMode.armorPiercing
    : typeof selectedProjectile?.armorPiercing === "number" ? selectedProjectile.armorPiercing : 0;
  const overheat = overheatConfigFrom(weaponStats);
  const holoTargeting = holoTargetingConfigFrom(selectedProjectile);
  const estimatedShotsToOverheat = sustainedShotsToOverheat(overheat, modifiedStats?.shotsPerSecond ?? 0);
  // directFeed ammo (XM88's manually-chambered rounds, shotgun shells) loads
  // one round at a time or from a box, not a swappable magazine — "capacity"
  // there means the box/tube size, not a reload unit worth counting.
  const hasMagazine = selectedAmmo != null && selectedAmmo.directFeed !== true;
  const magazineCapacity = hasMagazine && typeof selectedAmmo?.capacity === "number" ? selectedAmmo.capacity : null;

  const aimedShotAbilityRaw = isMap(weaponStats?.aimedShot) ? weaponStats.aimedShot : undefined;
  const hasAimedShot = weaponStats != null && "aimedShot" in weaponStats;
  const hasFocusedShooting = weaponStats?.hasFocusedShooting === true;
  const aimedShotEffect = aimedShotEffectFrom(selectedProjectile);

  const selectTarget = (selection: TargetSelection) => {
    setTarget(selection);
    setTargetMatured(false);
    setActiveAbilities(new Set());
    setPicker(null);
  };

  const clearTarget = () => {
    setTarget(null);
    setTargetMatured(false);
    setActiveAbilities(new Set());
  };

  const toggleAbility = (name: string) => {
    if (!target || target.kind !== "xeno") return;
    const casteId = target.casteId;
    setActiveAbilities((current) => toggleXenoAbility(casteId, current, name));
  };

  const baseTargetArmor = useMemo(() => targetArmorFrom(target, catalog, mobCatalog), [target, catalog, mobCatalog]);
  const selectedXenoCaste = target?.kind === "xeno" ? mobCatalog?.xenoCastes[target.casteId] : undefined;
  const canMature = selectedXenoCaste?.maturedThresholds != null;
  const effectiveTargetMatured = canMature && targetMatured;
  const targetThresholds = useMemo(
    () => targetThresholdsFrom(target, mobCatalog, effectiveTargetMatured),
    [effectiveTargetMatured, target, mobCatalog],
  );
  const targetSize = useMemo(() => targetSizeFrom(target, mobCatalog), [target, mobCatalog]);
  const xenoAbilities = target?.kind === "xeno" ? XENO_DEFENSIVE_ABILITIES[target.casteId] : undefined;
  const targetArmor = target?.kind === "xeno" && baseTargetArmor?.kind === "xeno"
    ? applyXenoAbilityBonuses(baseTargetArmor, target.casteId, activeAbilities)
    : baseTargetArmor;

  const activePickerSlot = picker?.type === "attachment"
    ? attachmentSlots.find((slot) => (slot.id ?? slot.slotId) === picker.slotId)
    : null;

  return (
    <main className="damage-page">
      <section className="damage-hero">
        <div>
          <p className="eyebrow">USCM // TTK CALCULATOR</p>
          <h1>Калькулятор урона</h1>
          <p>Оружие, боеприпасы, дистанция и броня цели — расчёт урона и времени до убийства.</p>
        </div>
        <div className="catalog-meta">
          <span>STATUS</span><strong>{loading ? "SYNC" : error ? "ERROR" : "ONLINE"}</strong>
          {catalog && <small>BUILD {catalog.gameCommit.slice(0, 8).toUpperCase()}</small>}
        </div>
      </section>

      <div className="damage-view-switch" role="tablist" aria-label="Режим калькулятора">
        <button type="button" role="tab" aria-selected={viewMode === "single"} className={viewMode === "single" ? "is-active" : ""} onClick={() => setViewMode("single")}>Одна сборка</button>
        <button type="button" role="tab" aria-selected={viewMode === "compare"} className={viewMode === "compare" ? "is-active" : ""} onClick={() => setViewMode("compare")}>Сравнение</button>
      </div>

      {loading && !catalog && <div className="status-panel" role="status"><span>DATABASE MESSAGE</span><strong>Синхронизация</strong><p>Загружаю каталог снаряжения…</p></div>}
      {error && !catalog && (
        <div className="status-panel" role="status">
          <span>DATABASE MESSAGE</span><strong>GitHub не отвечает</strong><p>{error}</p>
          <button type="button" onClick={retry}>Повторить</button>
        </div>
      )}

      {viewMode === "single" ? <div className="damage-workspace">
      {catalog && (
        <section className="damage-loadout damage-weapon-card">
          <DamagePanelHeader
            index="01"
            eyebrow="WEAPON SYSTEM"
            title="Оружие"
            description="Основное оружие, совместимые обвесы и боеприпасы."
          />

          <div className="primary-slot-row">
            <ItemSlot
              label="Выбрать оружие"
              item={selectedWeapon}
              onOpen={() => setPicker({ type: "weapon" })}
              onClear={selectedWeapon ? clearWeapon : undefined}
            />
          </div>

          {selectedWeapon && attachmentSlots.length > 0 && (
            <section className="damage-section attachment-section">
              <header className="damage-section-header">
                <h3>Обвесы</h3>
                <span>{attachmentSlots.length} слота</span>
              </header>
              <div className="attachment-rack">
                {attachmentSlots.map((slot) => {
                  const slotId = slot.id ?? slot.slotId ?? "";
                  const itemId = slot.locked
                    ? slot.startingItemId ?? slot.installedItemIds?.[0]
                    : effectiveAttachmentBySlot[slotId];
                  const item: CatalogItem | null = itemId ? catalog.items[itemId] ?? null : null;
                  const toggleable = item ? isToggleableAttachment(item) && !isGunAttachment(item) : false;
                  const active = Boolean(attachmentActiveBySlot[slotId]);
                  return (
                    <div className="attachment-slot-wrap" key={slotId}>
                      <ItemSlot
                        label={slot.name ?? slot.slotName ?? "Обвес"}
                        item={item}
                        compact
                        locked={slot.locked}
                        onOpen={slot.locked ? undefined : () => setPicker({ type: "attachment", slotId })}
                        onClear={item && !slot.locked ? () => clearAttachment(slotId) : undefined}
                        tooltipItem={item ?? undefined}
                      />
                      {toggleable && (
                        <button
                          type="button"
                          className={`attachment-toggle${active ? " is-active" : ""}`}
                          onClick={() => toggleAttachmentActive(slotId)}
                        >
                          {active ? "Активен" : "Неактивен"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {selectedWeapon && baseStats && modifiedStats && (
            <dl className="stat-grid">
              <StatRow label="Точность" from={baseStats.accuracyWieldedMultiplier} to={modifiedStats.accuracyWieldedMultiplier} direction="higher-better" format={(value) => `×${formatNumber(value)}`} />
              <StatRow label="Разброс" from={baseStats.scatterWielded} to={modifiedStats.scatterWielded} direction="lower-better" format={(value) => formatNumber(value)} />
              <StatRow label="Отдача" from={baseStats.recoilWielded} to={modifiedStats.recoilWielded} direction="lower-better" format={(value) => formatNumber(value)} />
              <StatRow label="Скорострельность" from={baseStats.shotsPerSecond} to={modifiedStats.shotsPerSecond} direction="higher-better" format={(value) => `${formatNumber(value)} выстр./с`} />
              <StatRow label="Множитель урона" from={baseStats.damageMultiplier} to={modifiedStats.damageMultiplier} direction="higher-better" format={(value) => `×${formatNumber(value)}`} />
              <StatRow label="Падение урона" from={baseStats.damageFalloffMultiplier} to={modifiedStats.damageFalloffMultiplier} direction="lower-better" format={(value) => `×${formatNumber(value)}`} />
              <StatRow label="Дальность" from={baseStats.rangeFlat} to={modifiedStats.rangeFlat} direction="higher-better" format={(value) => `${value > 0 ? "+" : ""}${formatNumber(value)} т.`} />
            </dl>
          )}

          {overheat && modifiedStats && (
            <section className="damage-overheat-summary" aria-label="Нагрев оружия">
              <h3>Нагрев</h3>
              <dl className="stat-grid">
                <div><dt>Предел нагрева</dt><dd>{formatNumber(overheat.maxHeat)}</dd></div>
                <div><dt>За выстрел</dt><dd>+{formatNumber(overheat.heatPerShot)}</dd></div>
                <div><dt>Остывание</dt><dd>{formatNumber(overheat.cooldownRate)} ед./с</dd></div>
                {estimatedShotsToOverheat != null && <div><dt>Непрерывная очередь</dt><dd>≈ {estimatedShotsToOverheat} выстр.</dd></div>}
                <div><dt>Аварийная пауза</dt><dd>{formatNumber(overheat.emergencyCooldownDelaySeconds)} с</dd></div>
              </dl>
            </section>
          )}

          {selectedWeapon && (
            ammunition.length > 0 ? (
              <>
                <h3>Боеприпас</h3>
                <AmmoPicker ammunition={ammunition} selectedIndex={effectiveAmmoIndex} onSelect={setSelectedAmmoIndex} />
                {ammoModes.length > 0 && (
                  <>
                    <h3>Режим боеприпаса</h3>
                    <AmmoModePicker modes={ammoModes} selectedIndex={effectiveAmmoModeIndex} onSelect={setSelectedAmmoModeIndex} />
                  </>
                )}

                <div className="projectile-list">
                  {projectiles.map((projectile, index) => (
                    <article key={`${String(projectile.projectileId)}:${index}`}>
                      <strong>{String(projectile.name ?? "Снаряд")}</strong>
                      <dl className="stat-grid">
                        <div>
                          <dt>Урон</dt>
                          <dd><DamageBreakdown damage={scaleDamage(damageTypeMapFrom(selectedAmmoMode?.damage ?? projectile.effectiveDamage ?? projectile.damage), damageRatio)} /></dd>
                        </div>
                        {typeof projectile.projectilesPerShot === "number" && projectile.projectilesPerShot > 1 && (
                          <>
                            <div><dt>Снарядов за выстрел</dt><dd>{formatNumber(projectile.projectilesPerShot)}</dd></div>
                            <div>
                              <dt>Полный урон выстрела</dt>
                              <dd><DamageBreakdown damage={scaleDamage(
                                 damageTypeMapFrom(selectedAmmoMode?.damage ?? projectile.effectiveDamage ?? projectile.damage),
                                 damageRatio * projectile.projectilesPerShot,
                              )} /></dd>
                            </div>
                            {typeof projectile.spreadDegrees === "number" && (
                              <div><dt>Разброс снарядов</dt><dd>{formatNumber(projectile.spreadDegrees)}°</dd></div>
                            )}
                          </>
                        )}
                        {(selectedAmmoMode?.armorPiercing != null || projectile.armorPiercing != null) && (
                          <div><dt>Бронепробитие</dt><dd>{formatNumber(selectedAmmoMode?.armorPiercing ?? projectile.armorPiercing)}</dd></div>
                        )}
                        <FalloffRows
                          projectile={projectile}
                          rangeFlat={modifiedStats?.rangeFlat ?? 0}
                          weaponMultiplier={modifiedStats?.damageFalloffMultiplier ?? 1}
                        />
                        {isMap(projectile.holoTargeting) && (
                          <>
                            <div>
                              <dt>НТ-метка за попадание</dt>
                              <dd>
                                +{formatNumber(projectile.holoTargeting.stacksPerHit)} стаков · +{formatNumber(
                                  Number(projectile.holoTargeting.stacksPerHit)
                                    * Number(projectile.holoTargeting.damageMultiplierPerStack)
                                    * 100,
                                )}% урона
                              </dd>
                            </div>
                            <div>
                              <dt>Предел НТ-метки</dt>
                              <dd>
                                {formatNumber(projectile.holoTargeting.maxStacks)} стаков · +{formatNumber(
                                  Number(projectile.holoTargeting.maxStacks)
                                    * Number(projectile.holoTargeting.damageMultiplierPerStack)
                                    * 100,
                                )}% урона
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                      {isMap(projectile.holoTargeting) && (
                        <p className="holo-targeting-note">
                          Усиливает весь входящий урон, включая это же попадание. Через {formatNumber(projectile.holoTargeting.decayDelaySeconds)} с без попаданий теряет по {formatNumber(projectile.holoTargeting.decayPerSecond)} стаков в секунду.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">У этого оружия нет вариантов боеприпасов в каталоге.</p>
            )
          )}
        </section>
      )}

      {catalog && (
        <section className="damage-loadout damage-target-card">
          <DamagePanelHeader
            index="02"
            eyebrow="TARGET PROFILE"
            title="Цель"
            description="Противник, броня, направление атаки и пороги здоровья."
          />

          <div className="primary-slot-row">
            <TargetSlot
              label="Выбрать цель"
              selection={target}
              catalog={catalog}
              mobCatalog={mobCatalog}
              matured={effectiveTargetMatured}
              onOpen={() => setPicker({ type: "target" })}
              onClear={target ? clearTarget : undefined}
            />
          </div>

          {mobLoading && !mobCatalog && <p className="muted">Загружаю данные о мобах…</p>}
          {mobError && !mobCatalog && <p className="muted">Ошибка загрузки данных о мобах: {mobError}</p>}

          {canMature && (
            <div className="target-stage-control">
              <header>
                <span>Стадия развития</span>
                <small>Королева созревает через 10 минут после появления</small>
              </header>
              <div className="direction-control maturity-control" role="radiogroup" aria-label="Стадия развития королевы">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!effectiveTargetMatured}
                  className={!effectiveTargetMatured ? "is-active" : ""}
                  onClick={() => setTargetMatured(false)}
                >
                  Незрелая
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveTargetMatured}
                  className={effectiveTargetMatured ? "is-active" : ""}
                  onClick={() => setTargetMatured(true)}
                >
                  Зрелая
                </button>
              </div>
            </div>
          )}

          {target && targetArmor?.kind === "xeno" && (
            <div className="direction-control" role="radiogroup" aria-label="Направление попадания">
              {(["front", "side", "back"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={hitDirection === value}
                  className={hitDirection === value ? "is-active" : ""}
                  onClick={() => setHitDirection(value)}
                >
                  {value === "front" ? "Спереди" : value === "side" ? "Сбоку" : "Сзади"}
                </button>
              ))}
            </div>
          )}

          {xenoAbilities && xenoAbilities.length > 0 && (
            <div className="loadout-row">
              {xenoAbilities.map((ability) => {
                const active = activeAbilities.has(ability.name);
                return (
                  <button
                    key={ability.name}
                    type="button"
                    className={`attachment-toggle${active ? " is-active" : ""}`}
                    onClick={() => toggleAbility(ability.name)}
                  >
                    {ability.name}: {active ? "Активна" : "Неактивна"}
                  </button>
                );
              })}
            </div>
          )}

          {target && targetArmor && (
            <dl className="stat-grid">
              {targetArmor.kind === "marine" ? (
                <>
                  <div><dt>Броня · пули</dt><dd>{formatNumber(targetArmor.bullet)}</dd></div>
                  <div><dt>Броня · ближний бой</dt><dd>{formatNumber(targetArmor.melee)}</dd></div>
                  <div><dt>Броня · био</dt><dd>{formatNumber(targetArmor.bio)}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Базовая броня</dt><dd>{formatNumber(baseTargetArmor?.kind === "xeno" ? baseTargetArmor.xenoArmor : targetArmor.xenoArmor)}</dd></div>
                  {xenoAbilities?.filter((ability) => activeAbilities.has(ability.name) && ability.xenoArmorBonus !== 0).map((ability) => (
                    <div key={ability.name}><dt>{ability.name} (бонус к базовой)</dt><dd>+{formatNumber(ability.xenoArmorBonus)}</dd></div>
                  ))}
                  {targetArmor.frontalArmor !== 0 && <div><dt>Броня спереди (бонус)</dt><dd>{targetArmor.frontalArmor > 0 ? "+" : ""}{formatNumber(targetArmor.frontalArmor)}</dd></div>}
                  {targetArmor.sideArmor !== 0 && <div><dt>Броня сбоку (бонус)</dt><dd>{targetArmor.sideArmor > 0 ? "+" : ""}{formatNumber(targetArmor.sideArmor)}</dd></div>}
                  <div>
                    <dt>Итоговая броня ({hitDirection === "front" ? "спереди" : hitDirection === "side" ? "сбоку" : "сзади"})</dt>
                    <dd>{formatNumber(Math.max(targetArmor.xenoArmor + (hitDirection === "front" ? targetArmor.frontalArmor : hitDirection === "side" ? targetArmor.sideArmor : 0), 0))}</dd>
                  </div>
                  <div><dt>Игнорирует бронепробитие</dt><dd>{targetArmor.immuneToArmorPiercing ? "Да" : "Нет"}</dd></div>
                </>
              )}
              {targetThresholds && (
                <>
                  <div><dt>Критическое состояние</dt><dd>{targetThresholds.critical != null ? formatNumber(targetThresholds.critical) : "—"}</dd></div>
                  <div><dt>Смерть</dt><dd>{formatNumber(targetThresholds.dead)}</dd></div>
                </>
              )}
            </dl>
          )}
        </section>
      )}

      {catalog && (
        <section className="damage-loadout damage-result-card">
          <DamagePanelHeader
            index="03"
            eyebrow="FIRE SOLUTION"
            title="Расчёт"
            description="Дистанция, урон, расход боеприпасов и время поражения."
          />
          {selectedWeapon && selectedProjectile && target && targetArmor && targetThresholds ? (
            <>
              <h3>Дистанция</h3>
              <DistanceControl distance={distance} onChange={setDistance} />
              <ResultPanel
                effectiveDamage={adjustedEffectiveDamage}
                projectilesPerShot={projectilesPerShot}
                distance={distance}
                falloffThresholds={falloffThresholds}
                weaponFalloffMultiplier={weaponFalloffMultiplier}
                baseArmorPiercing={armorPiercing}
                baseDamageMultiplier={modifiedStats?.damageMultiplier ?? 1}
                baseShotsPerSecond={modifiedStats?.shotsPerSecond ?? 0}
                weaponCategory="bullet"
                target={targetArmor}
                hitDirection={hitDirection}
                thresholds={targetThresholds}
                magazineCapacity={magazineCapacity}
                gunStacks={selectedWeapon ? WEAPON_GUN_STACKS[selectedWeapon.id] : undefined}
                overheat={overheat}
                holoTargeting={holoTargeting}
              />
              {hasAimedShot && aimedShotEffect && (
                <AimedShotCard
                  ability={aimedShotAbilityFrom(aimedShotAbilityRaw)}
                  hasFocusedShooting={hasFocusedShooting}
                  effect={aimedShotEffect}
                  distance={distance}
                  effectiveDamage={adjustedEffectiveDamage}
                  falloffThresholds={falloffThresholds}
                  weaponFalloffMultiplier={weaponFalloffMultiplier}
                  armorPiercing={armorPiercing}
                  weaponCategory="bullet"
                  target={targetArmor}
                  hitDirection={hitDirection}
                  targetSize={targetSize}
                  criticalThreshold={targetThresholds.critical ?? null}
                />
              )}
            </>
          ) : (
            <div className="damage-panel-empty">
              <span>CALCULATION STANDBY</span>
              <strong>Ожидание данных</strong>
              <p>Заполните панели оружия и цели — результат появится здесь автоматически.</p>
            </div>
          )}
        </section>
      )}
      </div> : catalog && mobCatalog ? (
        <DamageComparison catalog={catalog} mobCatalog={mobCatalog} seed={damageBuildSeed({
          weaponId: selectedWeapon?.id ?? null,
          ammoIndex: effectiveAmmoIndex,
          ammoModeIndex: effectiveAmmoModeIndex,
          attachmentBySlot: effectiveAttachmentBySlot,
          attachmentActiveBySlot,
          target,
          targetMatured,
          hitDirection,
          activeAbilities,
          distance,
        })} />
      ) : (
        <div className="status-panel" role="status"><span>DATABASE MESSAGE</span><strong>Синхронизация</strong><p>Загружаю данные для сравнения…</p></div>
      )}

      {viewMode === "single" && picker?.type === "weapon" && catalog && (
        <PickerModal title="Выбор оружия" onClose={() => setPicker(null)}>
          <WeaponPicker catalog={catalog} selectedId={selectedWeapon?.id ?? null} onSelect={selectWeapon} />
        </PickerModal>
      )}

      {viewMode === "single" && picker?.type === "attachment" && catalog && activePickerSlot && (
        <PickerModal title={activePickerSlot.name ?? activePickerSlot.slotName ?? "Обвес"} onClose={() => setPicker(null)}>
          <AttachmentPicker
            catalog={catalog}
            compatibleItemIds={activePickerSlot.compatibleItemIds ?? []}
            selectedId={effectiveAttachmentBySlot[picker.slotId] ?? null}
            onSelect={(id) => selectAttachment(picker.slotId, id)}
          />
        </PickerModal>
      )}

      {viewMode === "single" && picker?.type === "target" && catalog && mobCatalog && (
        <PickerModal title="Выбор цели" onClose={() => setPicker(null)}>
          <TargetPicker catalog={catalog} mobCatalog={mobCatalog} selected={target} onSelect={selectTarget} />
        </PickerModal>
      )}
    </main>
  );
}
