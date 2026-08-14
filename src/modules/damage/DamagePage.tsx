import { useMemo, useState } from "react";
import { useCatalog } from "../equipment/catalogStore";
import { formatDamage, formatNumber, isMap } from "../equipment/format";
import type { CatalogItem, JsonMap } from "../equipment/types";
import {
  collectRangedModifierEntries,
  foldAttachmentModifiers,
  isGunAttachment,
  isToggleableAttachment,
  statDelta,
} from "./attachmentModifiers";
import type { EquippedAttachment, StatDirection, WeaponModifiableStats } from "./attachmentModifiers";
import type { HitDirection } from "./damageMath";
import { useMobCatalog } from "./mobCatalogStore";
import { targetArmorFrom, targetThresholdsFrom } from "./target";
import type { TargetSelection } from "./target";
import { applyXenoAbilityBonuses, toggleXenoAbility, XENO_DEFENSIVE_ABILITIES } from "./xenoAbilities";
import { AmmoPicker, ammoProjectiles } from "./components/AmmoPicker";
import { AttachmentPicker } from "./components/AttachmentPicker";
import { ItemSlot } from "./components/ItemSlot";
import { PickerModal } from "./components/PickerModal";
import { TargetPicker } from "./components/TargetPicker";
import { TargetSlot } from "./components/TargetSlot";
import { WeaponPicker } from "./components/WeaponPicker";

type PickerState = { type: "weapon" } | { type: "attachment"; slotId: string } | { type: "target" } | null;

function numberField(container: unknown, key: string): number | undefined {
  return isMap(container) && typeof container[key] === "number" ? (container[key] as number) : undefined;
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

export function DamagePage() {
  const { catalog, error, loading, retry } = useCatalog();
  const { mobCatalog, error: mobError, loading: mobLoading } = useMobCatalog();
  const [selectedWeaponId, setSelectedWeaponId] = useState<string | null>(null);
  const [selectedAmmoIndex, setSelectedAmmoIndex] = useState(0);
  const [attachmentBySlot, setAttachmentBySlot] = useState<Record<string, string>>({});
  const [attachmentActiveBySlot, setAttachmentActiveBySlot] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [hitDirection, setHitDirection] = useState<HitDirection>("front");
  const [activeAbilities, setActiveAbilities] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<PickerState>(null);

  const selectedWeapon = selectedWeaponId && catalog ? catalog.items[selectedWeaponId] : null;
  const attachmentSlots = useMemo(() => selectedWeapon?.attachmentSlots ?? [], [selectedWeapon]);

  const ammunition = useMemo(() => {
    const raw = selectedWeapon?.weaponStats?.ammunition;
    return Array.isArray(raw) ? raw.filter(isMap) : [];
  }, [selectedWeapon]);
  const selectedAmmo: JsonMap | undefined = ammunition[selectedAmmoIndex];
  const projectiles = useMemo(() => ammoProjectiles(selectedAmmo), [selectedAmmo]);

  const selectWeapon = (id: string) => {
    setSelectedWeaponId(id);
    setSelectedAmmoIndex(0);
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
      const itemId = slotId ? attachmentBySlot[slotId] : undefined;
      const item = itemId ? catalog.items[itemId] : undefined;
      if (item) result.push({ item, active: slotId ? Boolean(attachmentActiveBySlot[slotId]) : false });
    }
    return result;
  }, [attachmentSlots, attachmentBySlot, attachmentActiveBySlot, catalog]);

  const weaponStats = selectedWeapon?.weaponStats;
  const baseStats: WeaponModifiableStats | null = selectedWeapon ? {
    damageMultiplier: numberField(weaponStats, "damageMultiplier") ?? 1,
    accuracyWieldedMultiplier: numberField(isMap(weaponStats) ? weaponStats.accuracy : undefined, "wieldedMultiplier") ?? 0,
    scatterWielded: numberField(isMap(weaponStats) ? weaponStats.scatter : undefined, "wielded") ?? 0,
    recoilWielded: numberField(isMap(weaponStats) ? weaponStats.recoil : undefined, "wielded") ?? 0,
    shotsPerSecond: numberField(weaponStats, "shotsPerSecond") ?? 0,
  } : null;

  const modifiedStats = baseStats
    ? foldAttachmentModifiers(baseStats, collectRangedModifierEntries(equippedAttachments, selectedWeapon?.tags ?? []))
    : null;

  const selectTarget = (selection: TargetSelection) => {
    setTarget(selection);
    setActiveAbilities(new Set());
    setPicker(null);
  };

  const toggleAbility = (name: string) => {
    if (!target || target.kind !== "xeno") return;
    const casteId = target.casteId;
    setActiveAbilities((current) => toggleXenoAbility(casteId, current, name));
  };

  const baseTargetArmor = useMemo(() => targetArmorFrom(target, catalog, mobCatalog), [target, catalog, mobCatalog]);
  const targetThresholds = useMemo(() => targetThresholdsFrom(target, mobCatalog), [target, mobCatalog]);
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

      {loading && !catalog && <div className="status-panel" role="status"><span>DATABASE MESSAGE</span><strong>Синхронизация</strong><p>Загружаю каталог снаряжения…</p></div>}
      {error && !catalog && (
        <div className="status-panel" role="status">
          <span>DATABASE MESSAGE</span><strong>Ошибка загрузки</strong><p>{error}</p>
          <button type="button" onClick={retry}>Повторить</button>
        </div>
      )}

      {catalog && (
        <section className="damage-loadout">
          <div className="loadout-row">
            <ItemSlot
              label="Оружие"
              item={selectedWeapon}
              onOpen={() => setPicker({ type: "weapon" })}
              onClear={selectedWeapon ? clearWeapon : undefined}
            />
            {selectedWeapon && attachmentSlots.map((slot) => {
              const slotId = slot.id ?? slot.slotId ?? "";
              const item: CatalogItem | null = attachmentBySlot[slotId] ? catalog.items[attachmentBySlot[slotId]] ?? null : null;
              const toggleable = item ? isToggleableAttachment(item) && !isGunAttachment(item) : false;
              const active = Boolean(attachmentActiveBySlot[slotId]);
              return (
                <div className="attachment-slot-wrap" key={slotId}>
                  <ItemSlot
                    label={slot.name ?? slot.slotName ?? "Обвес"}
                    item={item}
                    compact
                    onOpen={() => setPicker({ type: "attachment", slotId })}
                    onClear={item ? () => clearAttachment(slotId) : undefined}
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

          {selectedWeapon && baseStats && modifiedStats && (
            <dl className="stat-grid">
              <StatRow label="Точность" from={baseStats.accuracyWieldedMultiplier} to={modifiedStats.accuracyWieldedMultiplier} direction="higher-better" format={(value) => `×${formatNumber(value)}`} />
              <StatRow label="Разброс" from={baseStats.scatterWielded} to={modifiedStats.scatterWielded} direction="lower-better" format={(value) => formatNumber(value)} />
              <StatRow label="Отдача" from={baseStats.recoilWielded} to={modifiedStats.recoilWielded} direction="lower-better" format={(value) => formatNumber(value)} />
              <StatRow label="Скорострельность" from={baseStats.shotsPerSecond} to={modifiedStats.shotsPerSecond} direction="higher-better" format={(value) => `${formatNumber(value)} выстр./с`} />
              <StatRow label="Множитель урона" from={baseStats.damageMultiplier} to={modifiedStats.damageMultiplier} direction="higher-better" format={(value) => `×${formatNumber(value)}`} />
            </dl>
          )}

          {selectedWeapon && (
            ammunition.length > 0 ? (
              <>
                <h3>Боеприпас</h3>
                <AmmoPicker ammunition={ammunition} selectedIndex={selectedAmmoIndex} onSelect={setSelectedAmmoIndex} />

                <div className="projectile-list">
                  {projectiles.map((projectile, index) => (
                    <article key={`${String(projectile.projectileId)}:${index}`}>
                      <strong>{String(projectile.name ?? "Снаряд")}</strong>
                      <dl className="stat-grid">
                        <div><dt>Урон</dt><dd>{formatDamage(projectile.effectiveDamage ?? projectile.damage) ?? "—"}</dd></div>
                        {projectile.armorPiercing != null && (
                          <div><dt>Бронепробитие</dt><dd>{formatNumber(projectile.armorPiercing)}</dd></div>
                        )}
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">У этого оружия нет вариантов боеприпасов в каталоге.</p>
            )
          )}

          {selectedWeapon && (
            <p className="muted damage-todo-note">
              Дистанция — в следующем срезе. Урон патрона пока не учитывает бонус обвесов к множителю.
            </p>
          )}
        </section>
      )}

      {catalog && (
        <section className="damage-loadout">
          <div className="loadout-row">
            <TargetSlot
              label="Цель"
              selection={target}
              catalog={catalog}
              mobCatalog={mobCatalog}
              onOpen={() => setPicker({ type: "target" })}
              onClear={target ? () => setTarget(null) : undefined}
            />
          </div>

          {mobLoading && !mobCatalog && <p className="muted">Загружаю данные о мобах…</p>}
          {mobError && !mobCatalog && <p className="muted">Ошибка загрузки данных о мобах: {mobError}</p>}

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

      {picker?.type === "weapon" && catalog && (
        <PickerModal title="Выбор оружия" onClose={() => setPicker(null)}>
          <WeaponPicker catalog={catalog} selectedId={selectedWeaponId} onSelect={selectWeapon} />
        </PickerModal>
      )}

      {picker?.type === "attachment" && catalog && activePickerSlot && (
        <PickerModal title={activePickerSlot.name ?? activePickerSlot.slotName ?? "Обвес"} onClose={() => setPicker(null)}>
          <AttachmentPicker
            catalog={catalog}
            compatibleItemIds={activePickerSlot.compatibleItemIds ?? []}
            selectedId={attachmentBySlot[picker.slotId] ?? null}
            onSelect={(id) => selectAttachment(picker.slotId, id)}
          />
        </PickerModal>
      )}

      {picker?.type === "target" && catalog && mobCatalog && (
        <PickerModal title="Выбор цели" onClose={() => setPicker(null)}>
          <TargetPicker catalog={catalog} mobCatalog={mobCatalog} selected={target} onSelect={selectTarget} />
        </PickerModal>
      )}
    </main>
  );
}
