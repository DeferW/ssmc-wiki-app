import {
  ammoProviderRows,
  armorLabel,
  asMultiplier,
  attachmentModifierRows,
  fireModeLabel,
  flattenReadable,
  formatDamage,
  formatMovementPenalty,
  formatNumber,
  formatValue,
  isMap,
  itemSizeGenitive,
  itemSizeLabel,
  pluralize,
  prettyJson,
  readableId,
  solutionLabel,
} from "../format";
import type { CatalogItem, JsonMap } from "../types";

export function StatsDetails({ item }: { item: CatalogItem }) {
  return (
    <>
      {item.weaponStats && <WeaponStats stats={item.weaponStats} />}
      {item.armorStats && <ArmorStats stats={item.armorStats} />}
      {item.attachmentStats && <AttachmentStats stats={item.attachmentStats} />}
      <CommonItemStats item={item} />
    </>
  );
}

function WeaponStats({ stats }: { stats: JsonMap }) {
  const recoil = isMap(stats.recoil) ? stats.recoil : {};
  const scatter = isMap(stats.scatter) ? stats.scatter : {};
  const accuracy = isMap(stats.accuracy) ? stats.accuracy : {};
  const wieldDelay = isMap(stats.wieldDelay) ? stats.wieldDelay : {};
  const fireModes = Array.isArray(stats.fireModes) ? stats.fireModes.map((mode) => fireModeLabel(String(mode))) : [];
  const rows: Array<[string, unknown]> = [
    ["Темп стрельбы", stats.roundsPerMinute != null ? `${formatNumber(stats.roundsPerMinute)} выстр./мин` : null],
    ["Режимы огня", fireModes.length ? fireModes.join(", ") : null],
    ["Основной режим", fireModes.length > 1 && stats.defaultFireMode ? fireModeLabel(String(stats.defaultFireMode)) : null],
    ["Очередь", stats.burstSize != null ? `${formatNumber(stats.burstSize)} выстр.` : null],
    ["Бронепробитие", stats.weaponArmorPiercing],
    ["Множитель урона", stats.damageMultiplier != null ? `×${formatNumber(stats.damageMultiplier)}` : null],
    ["Отдача · в упоре", recoil.wielded],
    ["Отдача · с рук", recoil.unwielded],
    ["Разброс · в упоре", scatter.wielded],
    ["Разброс · с рук", scatter.unwielded],
    ["Точность · в упоре", asMultiplier(accuracy.wieldedMultiplier)],
    ["Точность · с рук", asMultiplier(accuracy.unwieldedMultiplier)],
    ["Время вскидывания", wieldDelay.baseDelay != null ? `${formatNumber(wieldDelay.baseDelay)} с` : null],
    ["IFF", stats.iffEnabled],
  ];
  const provider = isMap(stats.ammoProvider) ? stats.ammoProvider : null;
  if (provider) {
    rows.push(["Ёмкость", provider.capacity]);
    rows.push(["Штатный боеприпас", provider.startingAmmoId]);
  }
  const movement = isMap(stats.wieldedMovement) ? stats.wieldedMovement : null;
  if (movement) {
    for (const [key, label] of [["base", "без брони"], ["light", "лёгкая броня"], ["medium", "средняя броня"], ["heavy", "тяжёлая броня"]] as const) {
      const value = movement[key];
      if (typeof value === "number" && value !== 1) rows.push([`Снижение скорости · ${label}`, `−${Math.round((1 - value) * 100)}%`]);
    }
  }
  const ammunition = Array.isArray(stats.ammunition) ? stats.ammunition.filter(isMap) : [];
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики оружия</h3>
      <StatGrid rows={rows} />
      {ammunition.length > 0 && (
        <div className="ammo-list">
          <h4>Магазины, боеприпасы и урон</h4>
          {ammunition.map((entry, index) => {
            const projectiles = Array.isArray(entry.projectiles) ? entry.projectiles.filter(isMap) : [];
            return (
              <article key={`${String(entry.ammoId)}:${index}`}>
                <div className="ammo-heading">
                  <strong title={String(entry.magazineName || entry.ammoName || entry.magazineId || entry.ammoId || "Боеприпас")}>{String(entry.magazineName || entry.ammoName || entry.magazineId || entry.ammoId || "Боеприпас")}</strong>
                  {entry.capacity != null && <span>{formatNumber(entry.capacity)} шт.</span>}
                </div>
                {projectiles.map((projectile, projectileIndex) => (
                  <div className="projectile-card" key={`${String(projectile.projectileId)}:${projectileIndex}`}>
                    <div className="damage-line">
                      <span>{formatDamage(projectile.effectiveDamage || projectile.damage)}</span>
                      {projectile.armorPiercing != null && <small>Бронепробитие {formatNumber(projectile.armorPiercing)}</small>}
                    </div>
                    <ProjectileRange projectile={projectile} />
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      )}
      <ReadableStatGroups
        groups={[
          ["Модификаторы режимов огня", stats.fireModeModifiers],
          ["Падение урона с расстоянием", stats.weaponDamageFalloff],
          ["Ближний бой", stats.melee],
          ["Требования к навыкам", stats.skillRequirements],
          ["Дополнительные параметры", stats.gunParameters],
        ]}
      />
    </section>
  );
}

function ArmorStats({ stats }: { stats: JsonMap }) {
  const protection = isMap(stats.protection) ? stats.protection : {};
  const movement = isMap(stats.movement) ? stats.movement : {};
  const protectionRows = Object.entries(protection)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => [armorLabel(key), value] as [string, unknown]);
  return (
    <section className="detail-section stats-section">
      <h3>Защита брони</h3>
      <StatGrid rows={[
        ["Снижение скорости", formatMovementPenalty(movement)],
      ]} />
      <h4 className="subsection-title">Сопротивления</h4>
      <ProtectionBars rows={protectionRows} />
    </section>
  );
}

function AttachmentStats({ stats }: { stats: JsonMap }) {
  const modifiers = isMap(stats.modifiers) ? stats.modifiers : {};
  const rows = attachmentModifierRows(modifiers);
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики обвеса</h3>
      <StatGrid rows={rows} />
    </section>
  );
}

function CommonItemStats({ item }: { item: CatalogItem }) {
  const properties = item.properties || {};
  const solutionManager = isMap(properties.SolutionContainerManager) ? properties.SolutionContainerManager : null;
  const solutions = solutionManager && isMap(solutionManager.solutions) ? solutionManager.solutions : {};
  const storage = isMap(item.storageStats) ? item.storageStats : null;
  const melee = isMap(properties.MeleeWeapon) ? properties.MeleeWeapon : null;
  const armor = isMap(properties.CMArmor) ? properties.CMArmor : null;
  const armorPiercing = isMap(properties.CMArmorPiercing) ? properties.CMArmorPiercing : null;
  const ammoProvider = ["BallisticAmmoProvider", "RevolverAmmoProvider", "CartridgeAmmo", "RMCFlamerTank"]
    .map((key) => [key, properties[key]] as [string, unknown])
    .find(([, value]) => isMap(value));

  const overviewRows: Array<[string, unknown]> = [
    ["Бронепробитие в ближнем бою", armorPiercing?.amount],
  ];
  const hasOverview = overviewRows.some(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <>
      {hasOverview && <section className="detail-section"><h3>Основные свойства</h3><StatGrid rows={overviewRows} /></section>}
      {Object.keys(solutions).length > 0 && (
        <section className="detail-section solution-section">
          <h3>Состав и объём</h3>
          <div className="solution-list">
            {Object.entries(solutions).map(([name, raw]) => {
              const solution = isMap(raw) ? raw : {};
              const reagents = Array.isArray(solution.reagents) ? solution.reagents.filter(isMap) : [];
              return (
                <article key={name}>
                  <div><strong>{solutionLabel(name)}</strong>{solution.maxVol != null && <span>{formatNumber(solution.maxVol)} ед.</span>}</div>
                  {reagents.length ? <ul>{reagents.map((reagent, index) => <li key={`${String(reagent.ReagentId)}:${index}`}><span>{readableId(String(reagent.ReagentId || "Реагент"))}</span><strong>{formatNumber(reagent.Quantity)} ед.</strong></li>)}</ul> : <small>Пусто</small>}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {storage && (
        <section className="detail-section">
          <h3>Хранилище</h3>
          <StorageSummary storage={storage} />
        </section>
      )}
      {melee && !item.weaponStats && (
        <section className="detail-section">
          <h3>Ближний бой</h3>
          <StatGrid rows={[
            ["Урон", isMap(melee.damage) && isMap(melee.damage.types) ? formatDamage(melee.damage.types) : null],
            ["Атак в секунду", melee.attackRate],
            ["Угол атаки", melee.angle != null ? `${formatNumber(melee.angle)}°` : null],
          ]} />
        </section>
      )}
      {armor && !item.armorStats && (
        <section className="detail-section">
          <h3>Дополнительная защита</h3>
          <ProtectionBars rows={Object.entries(armor).map(([key, value]) => [armorLabel(key), value] as [string, unknown])} />
        </section>
      )}
      {ammoProvider && !item.weaponStats && (
        <section className="detail-section">
          <h3>Боеприпасы</h3>
          <StatGrid rows={ammoProviderRows(ammoProvider[1])} />
        </section>
      )}
    </>
  );
}

function StorageSummary({ storage }: { storage: JsonMap }) {
  const capacities = Array.isArray(storage.capacities) ? storage.capacities.filter(isMap) : [];
  const limits = Array.isArray(storage.limits) ? storage.limits.filter(isMap) : [];
  const exactPlaces = typeof storage.exactPlaces === "number" ? storage.exactPlaces : null;
  const capacityText = capacities
    .map((entry) => `${formatNumber(entry.count)} ${itemSizeGenitive(String(entry.size || "Small"))}`)
    .join(" · ");
  const limitText = limits
    .map((entry) => typeof entry.count === "number" ? `до ${formatNumber(entry.count)} специальных` : null)
    .filter(Boolean)
    .join(" · ");
  return <StatGrid rows={[
    ["Вместимость", exactPlaces != null ? `${exactPlaces} ${pluralize(exactPlaces, "место", "места", "мест")}` : capacityText || null],
    ["По размерам", exactPlaces == null && capacityText ? capacityText : null],
    ["Максимальный размер", storage.maxItemSize ? itemSizeLabel(storage.maxItemSize) : null],
    ["Особые ограничения", limitText || null],
  ]} />;
}

function ProjectileRange({ projectile }: { projectile: JsonMap }) {
  const accuracy = isMap(projectile.accuracy) ? projectile.accuracy : {};
  const falloff = isMap(projectile.damageFalloff) ? projectile.damageFalloff : {};
  const thresholds: Array<{ kind: string; range?: unknown; falloff?: unknown }> = [
    ...(Array.isArray(accuracy.thresholds) ? accuracy.thresholds.filter(isMap).map((entry) => ({ kind: "Точность", range: entry.range, falloff: entry.falloff })) : []),
    ...(Array.isArray(falloff.thresholds) ? falloff.thresholds.filter(isMap).map((entry) => ({ kind: "Урон", range: entry.range, falloff: entry.falloff })) : []),
  ];
  if (accuracy.accuracy == null && !thresholds.length) return null;
  return (
    <div className="range-summary">
      {accuracy.accuracy != null && <span>Точность {formatNumber(accuracy.accuracy)}</span>}
      {thresholds.slice(0, 3).map((entry, index) => <span key={index}>{entry.kind}: после {formatNumber(entry.range)} тайл. −{formatNumber(entry.falloff)}</span>)}
    </div>
  );
}

function ProtectionBars({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => typeof value === "number" && value !== 0);
  if (!visible.length) return <p className="muted">Сопротивления не указаны.</p>;
  return (
    <div className="protection-bars">
      {visible.map(([label, value]) => {
        const amount = Number(value);
        return <div key={label}><span>{label}</span><div><i style={{ width: `${Math.min(100, Math.max(0, amount))}%` }} /></div><strong>{formatNumber(amount)}%</strong></div>;
      })}
    </div>
  );
}

function ReadableStatGroups({ groups }: { groups: Array<[string, unknown]> }) {
  const visible = groups.filter(([, value]) => value !== null && value !== undefined
    && (!Array.isArray(value) || value.length > 0)
    && (!isMap(value) || Object.keys(value).length > 0));
  if (!visible.length) return null;
  return (
    <div className="nested-stat-groups readable-groups">
      {visible.map(([title, value]) => (
        <details key={title}>
          <summary>{title}</summary>
          <div className="readable-detail"><ReadableValue value={value} /></div>
        </details>
      ))}
    </div>
  );
}

function ReadableValue({ value }: { value: unknown }) {
  const { rows, complex } = flattenReadable(value);
  return (
    <>
      {rows.length > 0 && <StatGrid rows={rows} />}
      {complex.length > 0 && <pre>{prettyJson(complex.length === 1 ? complex[0] : complex)}</pre>}
    </>
  );
}

function StatGrid({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="muted">Числовые характеристики не указаны.</p>;
  return (
    <dl className="stat-grid">
      {visible.map(([label, value]) => (
        <div key={label}><dt title={label}>{label}</dt><dd title={formatValue(value)}>{formatValue(value)}</dd></div>
      ))}
    </dl>
  );
}
