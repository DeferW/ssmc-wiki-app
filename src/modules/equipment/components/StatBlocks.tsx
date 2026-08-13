import type { ReactNode } from "react";
import { formatCost, formatDamage, formatNumber, formatValue, isMap, readableId, slotLabel } from "../format";
import type { Catalog, CatalogItem, JsonMap } from "../types";

export function ItemStats({ item, catalog }: { item: CatalogItem; catalog: Catalog }) {
  return (
    <>
      <AvailabilityBlock item={item} catalog={catalog} />
      {item.weaponStats && <WeaponBlock stats={item.weaponStats} />}
      {item.armorStats && <ArmorBlock stats={item.armorStats} />}
      {item.attachmentStats && <AttachmentBlock stats={item.attachmentStats} />}
      {item.storageStats && <StorageBlock stats={item.storageStats} />}
      {item.solutionStats && <SolutionBlock stats={item.solutionStats} />}
      {item.communicationStats && <CommunicationBlock stats={item.communicationStats} catalog={catalog} />}
      {item.equipmentSlots?.length ? (
        <DetailSection title="Ношение">
          <StatGrid rows={[["Слоты", item.equipmentSlots.map(slotLabel).join(", ")]]} />
        </DetailSection>
      ) : null}
    </>
  );
}

function AvailabilityBlock({ item, catalog }: { item: CatalogItem; catalog: Catalog }) {
  const offers = item.availability ?? [];
  if (!offers.length) return null;
  return (
    <DetailSection title="Получение">
      <div className="offer-list">
        {offers.map((offer, index) => {
          const source = catalog.sources[offer.vendorId];
          const price = offer.sourceType === "cargo" ? formatCost(offer.cost) : formatCost(offer.points);
          return (
            <article key={offer.tradeKey ?? `${offer.vendorId}:${index}`}>
              <div>
                <strong>{source?.name || offer.vendorId}</strong>
                <span>{offer.sourceType === "cargo" ? "Карго" : "Торговый автомат"}</span>
              </div>
              {offer.sectionName && <small>{offer.sectionName}</small>}
              {price && <b>{price}</b>}
            </article>
          );
        })}
      </div>
    </DetailSection>
  );
}

function WeaponBlock({ stats }: { stats: JsonMap }) {
  const recoil = isMap(stats.recoil) ? stats.recoil : {};
  const scatter = isMap(stats.scatter) ? stats.scatter : {};
  const accuracy = isMap(stats.accuracy) ? stats.accuracy : {};
  const provider = isMap(stats.ammoProvider) ? stats.ammoProvider : {};
  const fireModes = Array.isArray(stats.fireModes) ? stats.fireModes.map((mode) => readableId(String(mode))).join(", ") : null;
  const ammunition = Array.isArray(stats.ammunition) ? stats.ammunition.filter(isMap) : [];
  return (
    <DetailSection title="Оружие">
      <StatGrid rows={[
        ["Темп стрельбы", stats.roundsPerMinute != null ? `${formatNumber(stats.roundsPerMinute)} выстр./мин` : null],
        ["Режимы огня", fireModes],
        ["Очередь", stats.burstSize != null ? `${formatNumber(stats.burstSize)} выстр.` : null],
        ["Ёмкость", provider.capacity],
        ["Бронепробитие", stats.weaponArmorPiercing],
        ["Множитель урона", stats.damageMultiplier != null ? `×${formatNumber(stats.damageMultiplier)}` : null],
        ["Отдача · в упоре", recoil.wielded],
        ["Отдача · с рук", recoil.unwielded],
        ["Разброс · в упоре", scatter.wielded],
        ["Разброс · с рук", scatter.unwielded],
        ["Точность · в упоре", accuracy.wieldedMultiplier != null ? `×${formatNumber(accuracy.wieldedMultiplier)}` : null],
      ]} />
      {ammunition.length > 0 && (
        <div className="ammo-list">
          <h4>Боеприпасы и урон</h4>
          {ammunition.slice(0, 18).map((entry, index) => {
            const projectiles = Array.isArray(entry.projectiles) ? entry.projectiles.filter(isMap) : [];
            return (
              <article key={`${String(entry.magazineId ?? entry.ammoId)}:${index}`}>
                <div className="ammo-heading">
                  <strong>{String(entry.magazineName ?? entry.ammoName ?? entry.magazineId ?? entry.ammoId ?? "Боеприпас")}</strong>
                  {entry.capacity != null && <span>{formatNumber(entry.capacity)} шт.</span>}
                </div>
                {projectiles.map((projectile, projectileIndex) => (
                  <p key={`${String(projectile.projectileId)}:${projectileIndex}`}>
                    {formatDamage(projectile.effectiveDamage ?? projectile.damage) ?? "Урон не указан"}
                    {projectile.armorPiercing != null && <small> · БП {formatNumber(projectile.armorPiercing)}</small>}
                  </p>
                ))}
              </article>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
}

function ArmorBlock({ stats }: { stats: JsonMap }) {
  const protection = isMap(stats.protection) ? stats.protection : {};
  const labels: Record<string, string> = {
    xenoArmor: "Ксено-урон", frontalArmor: "Спереди", sideArmor: "Сбоку",
    melee: "Ближний бой", bullet: "Пули", bio: "Биозащита", explosionArmor: "Взрывы",
  };
  const rows = Object.entries(protection)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => [labels[key] ?? readableId(key), value] as [string, number]);
  return (
    <DetailSection title="Защита">
      {rows.length ? <div className="protection-bars">{rows.map(([label, amount]) => (
        <div key={label}>
          <span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, amount))}%` }} /></i><strong>{formatNumber(amount)}%</strong>
        </div>
      ))}</div> : <p className="muted">Числовая защита не указана.</p>}
    </DetailSection>
  );
}

function AttachmentBlock({ stats }: { stats: JsonMap }) {
  const modifiers = isMap(stats.modifiers) ? stats.modifiers : {};
  const rows: Array<[string, unknown]> = [];
  for (const [component, raw] of Object.entries(modifiers)) {
    if (!isMap(raw)) continue;
    const values = Array.isArray(raw.modifiers) ? raw.modifiers.filter(isMap) : [raw];
    for (const value of values) {
      for (const [key, modifier] of Object.entries(value)) {
        if (typeof modifier !== "number" && typeof modifier !== "boolean" && typeof modifier !== "string") continue;
        rows.push([`${readableId(component)} · ${readableId(key)}`, modifier]);
      }
    }
  }
  return <DetailSection title="Обвес"><StatGrid rows={rows.slice(0, 24)} /></DetailSection>;
}

function StorageBlock({ stats }: { stats: JsonMap }) {
  const capacities = Array.isArray(stats.capacities) ? stats.capacities.filter(isMap) : [];
  const capacityText = capacities.map((entry) => `${formatNumber(entry.count)} × ${readableId(String(entry.size ?? ""))}`).join(" · ");
  return (
    <DetailSection title="Хранилище">
      <StatGrid rows={[
        ["Точных мест", stats.exactPlaces],
        ["Вместимость", capacityText || null],
        ["Максимальный размер", stats.maxItemSize ? readableId(String(stats.maxItemSize)) : null],
        ["Ячеек сетки", stats.gridCells],
      ]} />
    </DetailSection>
  );
}

function SolutionBlock({ stats }: { stats: JsonMap }) {
  const solutions = Array.isArray(stats.solutions) ? stats.solutions.filter(isMap) : [];
  if (!solutions.length) return null;
  return (
    <DetailSection title="Содержимое раствора">
      <div className="solution-list">
        {solutions.map((solution, index) => {
          const reagents = Array.isArray(solution.reagents) ? solution.reagents.filter(isMap) : [];
          return (
            <article key={`${String(solution.id)}:${index}`}>
              <div><strong>{readableId(String(solution.id ?? "Раствор"))}</strong>{solution.maxVolume != null && <span>{formatNumber(solution.maxVolume)} ед.</span>}</div>
              {reagents.length ? <ul>{reagents.map((reagent, reagentIndex) => (
                <li key={`${String(reagent.id)}:${reagentIndex}`}><span>{readableId(String(reagent.id))}</span><b>{formatNumber(reagent.quantity)} ед.</b></li>
              ))}</ul> : <small>Пусто</small>}
            </article>
          );
        })}
      </div>
    </DetailSection>
  );
}

function CommunicationBlock({ stats, catalog }: { stats: JsonMap; catalog: Catalog }) {
  const ids = Array.isArray(stats.installedKeyIds) ? stats.installedKeyIds.map(String) : [];
  return (
    <DetailSection title="Связь">
      <StatGrid rows={[
        ["Установленные ключи", ids.map((id) => catalog.items[id]?.name ?? readableId(id)).join(", ") || null],
      ]} />
    </DetailSection>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

function StatGrid({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="muted">Характеристики не указаны.</p>;
  return (
    <dl className="stat-grid">
      {visible.map(([label, value], index) => (
        <div key={`${label}:${index}`}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
      ))}
    </dl>
  );
}
