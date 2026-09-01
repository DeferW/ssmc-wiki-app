import type { ReactNode } from "react";
import { formatCost, formatDamage, formatNumber, formatValue, isMap, readableId, slotLabel } from "../format";
import type { Catalog, CatalogItem, JsonMap } from "../types";

type Row = [string, unknown];

export function ItemStats({ item, catalog }: { item: CatalogItem; catalog: Catalog }) {
  return (
    <>
      <AvailabilityBlock item={item} catalog={catalog} />
      {item.weaponStats && <WeaponBlock stats={item.weaponStats} />}
      {!item.weaponStats && <ProjectileBlock item={item} catalog={catalog} />}
      {item.armorStats && <ArmorBlock stats={item.armorStats} />}
      {item.attachmentStats && <AttachmentBlock stats={item.attachmentStats} />}
      {item.storageStats && <StorageBlock stats={item.storageStats} />}
      {item.solutionStats && <SolutionBlock stats={item.solutionStats} />}
      {item.communicationStats && <CommunicationBlock stats={item.communicationStats} catalog={catalog} />}
      {item.skillStats && <SkillBlock stats={item.skillStats} />}
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
  const ammoModes = Array.isArray(stats.ammoModes) ? stats.ammoModes.filter(isMap) : [];
  const overheat = isMap(stats.overheat) ? stats.overheat : {};
  const sustainedShots = sustainedShotsToOverheat(stats, overheat);
  return (
    <DetailSection title="Оружие">
      <StatGrid rows={[
        ["Темп стрельбы", stats.roundsPerMinute != null ? `${formatNumber(stats.roundsPerMinute)} выстр./мин` : null],
        ["Режимы огня", fireModes],
        ["Очередь", stats.burstSize != null ? `${formatNumber(stats.burstSize)} выстр.` : null],
        ["Ёмкость", provider.capacity],
        ["Множитель урона", stats.damageMultiplier != null ? `×${formatNumber(stats.damageMultiplier)}` : null],
        ["Отдача · в упоре", recoil.wielded],
        ["Отдача · с рук", recoil.unwielded],
        ["Разброс · в упоре", scatter.wielded],
        ["Разброс · с рук", scatter.unwielded],
        ["Точность · в упоре", accuracy.wieldedMultiplier != null ? `×${formatNumber(accuracy.wieldedMultiplier)}` : null],
      ]} />
      {ammoModes.length > 0 && (
        <div className="ammo-list">
          <h4>Режимы боеприпасов</h4>
          {ammoModes.map((mode, index) => (
            <article key={String(mode.id ?? index)}>
              <div className="ammo-heading">
                <strong>{ammoModeLabel(String(mode.nameId ?? mode.id ?? `Режим ${index + 1}`))}</strong>
                {index === Number(stats.defaultAmmoModeIndex ?? 0) && <span>По умолчанию</span>}
              </div>
              <p>
                {formatDamage(isMap(mode.damage) ? mode.damage : null) ?? "Урон не указан"}
                {mode.armorPiercing != null && <small> · БП {formatNumber(mode.armorPiercing)}</small>}
              </p>
            </article>
          ))}
        </div>
      )}
      {Object.keys(overheat).length > 0 && (
        <>
          <h4>Нагрев</h4>
          <StatGrid rows={[
            ["Предел нагрева", overheat.maxHeat],
            ["За выстрел", overheat.heatPerShot != null ? `+${formatNumber(overheat.heatPerShot)}` : null],
            ["Охлаждение", overheat.cooldownRate != null ? `${formatNumber(overheat.cooldownRate)}/с` : null],
            ["До перегрева непрерывной очередью", sustainedShots != null ? `≈ ${sustainedShots} выстр.` : overheat.shotsToOverheatFromCold != null ? `${formatNumber(overheat.shotsToOverheatFromCold)} выстр.` : null],
            ["Блокировка после перегрева", overheat.emergencyCooldownDelaySeconds != null ? `${formatNumber(overheat.emergencyCooldownDelaySeconds)} с` : null],
            ["Нагрев после аварийного охлаждения", emergencyHeat(overheat)],
            ["Урон оружию при перегреве", isMap(overheat.damage) ? formatDamage(overheat.damage) : null],
          ]} />
        </>
      )}
      {ammunition.length > 0 && (
        <div className="ammo-list">
          <h4>Боеприпасы и итоговый урон</h4>
          {ammunition.map((entry, index) => {
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
                    {Number(projectile.projectilesPerShot) > 1 && (
                      <small> · снарядов: {formatNumber(projectile.projectilesPerShot)} · полный урон {formatDamage(scaleDamageMap(projectile.effectiveDamage ?? projectile.damage, Number(projectile.projectilesPerShot)))}</small>
                    )}
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

function ProjectileBlock({ item, catalog }: { item: CatalogItem; catalog: Catalog }) {
  const projectiles = findProjectiles(item, catalog);
  if (!projectiles.length) return null;
  return (
    <DetailSection title="Боеприпас и урон">
      <div className="projectile-list">
        {projectiles.map((projectile) => {
          const properties = projectile.properties ?? {};
          const component = isMap(properties.Projectile) ? properties.Projectile : {};
          const damage = isMap(component.damage) && isMap(component.damage.types) ? component.damage.types : null;
          const piercing = isMap(properties.CMArmorPiercing) ? properties.CMArmorPiercing.amount : null;
          const accuracy = isMap(properties.RMCProjectileAccuracy) ? properties.RMCProjectileAccuracy.accuracy : null;
          const spread = isMap(properties.ProjectileSpread) ? properties.ProjectileSpread : null;
          const projectilesPerShot = spread && Number(spread.count) > 1 ? Number(spread.count) : 1;
          return (
            <article key={projectile.id}>
              <strong>{projectile.name === "BaseBullet" ? "Пуля" : projectile.name}</strong>
              <StatGrid rows={[
                ["Урон", formatDamage(damage)],
                ["Снарядов за выстрел", projectilesPerShot > 1 ? projectilesPerShot : null],
                ["Полный урон выстрела", projectilesPerShot > 1 ? formatDamage(scaleDamageMap(damage, projectilesPerShot)) : null],
                ["Разброс снарядов", projectilesPerShot > 1 && spread?.spread != null ? `${formatNumber(spread.spread)}°` : null],
                ["Бронепробитие", piercing],
                ["Точность", accuracy != null ? `${formatNumber(accuracy)}%` : null],
              ]} />
            </article>
          );
        })}
      </div>
    </DetailSection>
  );
}

function findProjectiles(item: CatalogItem, catalog: Catalog) {
  const queue = [item.id];
  const visited = new Set<string>();
  const projectiles: CatalogItem[] = [];
  while (queue.length && visited.size < 160) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    const current = catalog.items[id];
    if (!current) continue;
    if (isMap(current.properties?.Projectile)) projectiles.push(current);
    for (const child of current.containsItemIds ?? []) if (!visited.has(child)) queue.push(child);
    for (const path of current.ammunitionPaths ?? []) {
      if (!isMap(path) || !Array.isArray(path.projectileIds)) continue;
      for (const projectileId of path.projectileIds.map(String)) if (!visited.has(projectileId)) queue.push(projectileId);
    }
  }
  return projectiles;
}

function ArmorBlock({ stats }: { stats: JsonMap }) {
  const protection = isMap(stats.protection) ? stats.protection : {};
  const movement = isMap(stats.movement) ? stats.movement : {};
  const labels: Record<string, string> = {
    xenoArmor: "Ксено-урон", frontalArmor: "Спереди", sideArmor: "Сбоку",
    melee: "Ближний бой", bullet: "Пули", bio: "Биозащита", explosionArmor: "Взрывы",
  };
  const rows = Object.entries(protection)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => [labels[key] ?? readableId(key), value] as [string, number]);
  const walkPenalty = movementPenalty(movement.walkModifier);
  const sprintPenalty = movementPenalty(movement.sprintModifier);
  const samePenalty = walkPenalty != null && walkPenalty === sprintPenalty;
  return (
    <DetailSection title="Защита и мобильность">
      <StatGrid rows={[
        ["Замедление", samePenalty ? `-${walkPenalty}%` : null],
        ["Замедление ходьбы", !samePenalty && walkPenalty != null ? `-${walkPenalty}%` : null],
        ["Замедление бега", !samePenalty && sprintPenalty != null ? `-${sprintPenalty}%` : null],
      ]} />
      {rows.length ? <div className="protection-bars">{rows.map(([label, amount]) => (
        <div key={label}>
          <span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, amount))}%` }} /></i><strong>{formatNumber(amount)}</strong>
        </div>
      ))}</div> : <p className="muted">Числовая защита не указана.</p>}
    </DetailSection>
  );
}

function movementPenalty(value: unknown) {
  return typeof value === "number" && value < 1 ? Math.round((1 - value) * 100) : null;
}

function AttachmentBlock({ stats }: { stats: JsonMap }) {
  const modifiers = isMap(stats.modifiers) ? stats.modifiers : {};
  const groups: Array<{ title: string; rows: Array<{ label: string; value: string; condition?: string }> }> = [];
  for (const [component, raw] of Object.entries(modifiers)) {
    if (!isMap(raw)) continue;
    const entries = [
      ...(Array.isArray(raw.modifiers) ? raw.modifiers.filter(isMap) : []),
      ...(Array.isArray(raw.fireModeMods) ? raw.fireModeMods.filter(isMap) : []),
    ];
    const rows = entries.flatMap((entry) => attachmentRows(entry));
    if (rows.length) groups.push({ title: attachmentGroupLabel(component), rows });
  }
  const effects = Array.isArray(stats.effects) ? stats.effects.map(String).map(attachmentEffectLabel).filter(Boolean) : [];
  return (
    <DetailSection title="Эффекты обвеса">
      <div className="modifier-groups">
        {groups.map((group) => (
          <article key={group.title}>
            <h4>{group.title}</h4>
            {group.rows.map((row, index) => (
              <div className="modifier-row" key={`${row.label}:${index}`}>
                <span>{row.label}{row.condition && <small>{row.condition}</small>}</span>
                <b>{row.value}</b>
              </div>
            ))}
          </article>
        ))}
      </div>
      {effects.length > 0 && <div className="effect-tags">{effects.map((effect) => <span key={effect}>{effect}</span>)}</div>}
      {!groups.length && !effects.length && <p className="muted">Числовые эффекты не указаны.</p>}
    </DetailSection>
  );
}

function attachmentRows(entry: JsonMap) {
  const condition = conditionsText(entry.conditions);
  const rows: Array<{ label: string; value: string; condition?: string }> = [];
  const labels: Record<string, string> = {
    damageAddMult: "Урон", accuracyAddMult: "Точность", scatterAddMult: "Разброс",
    burstScatterAddMult: "Разброс очереди", fireDelayFlat: "Интервал между выстрелами",
    scatterFlat: "Разброс", recoilFlat: "Отдача", walk: "Скорость ходьбы",
    sprint: "Скорость бега", delay: "Время вскидывания", size: "Размер предмета",
    extraFireModes: "Добавляет режим огня", setFireMode: "Переключает режим огня",
    projectileSpeedFlat: "Скорость снаряда", damageFalloffAddMult: "Падение урона",
    rangeFlat: "Дальность", shotsPerBurstFlat: "Выстрелов в очереди",
  };
  for (const [key, raw] of Object.entries(entry)) {
    if (key === "conditions") continue;
    if (key === "bonusDamage") {
      const damage = isMap(raw) && isMap(raw.types) ? formatDamage(raw.types) : null;
      if (damage) rows.push({ label: "Урон в ближнем бою", value: damage, condition });
      continue;
    }
    if (!(key in labels) || (typeof raw !== "number" && typeof raw !== "string")) continue;
    let value = typeof raw === "string" ? readableId(raw) : signedNumber(raw);
    if (typeof raw === "number" && /AddMult$|^walk$|^sprint$/u.test(key)) value = signedPercent(raw);
    if (typeof raw === "number" && /Delay|^delay$/u.test(key)) value = `${signedNumber(raw)} с`;
    if (typeof raw === "number" && key === "size") value = `${signedNumber(raw)} ур.`;
    if (typeof raw === "number" && key === "projectileSpeedFlat") value = signedNumber(raw);
    if (typeof raw === "number" && key === "rangeFlat") value = `${signedNumber(raw)} клет.`;
    if (typeof raw === "number" && key === "shotsPerBurstFlat") value = `${signedNumber(raw)} выстр.`;
    rows.push({ label: labels[key], value, condition });
  }
  return rows;
}

function conditionsText(value: unknown) {
  if (!isMap(value)) return undefined;
  const labels: string[] = [];
  if (value.activeOnly === true) labels.push("когда включён");
  if (value.inactiveOnly === true) labels.push("когда выключен");
  if (value.wieldedOnly === true) labels.push("при удержании двумя руками");
  if (value.unwieldedOnly === true) labels.push("при стрельбе с одной руки");
  const whitelistFilter = isMap(value.whitelist) ? value.whitelist : null;
  const blacklistFilter = isMap(value.blacklist) ? value.blacklist : null;
  const whitelist = whitelistFilter && Array.isArray(whitelistFilter.tags)
    ? whitelistFilter.tags.map(String)
    : [];
  const blacklist = blacklistFilter && Array.isArray(blacklistFilter.tags)
    ? blacklistFilter.tags.map(String)
    : [];
  if (whitelist.length && whitelistFilter) labels.push(filterConditionText(whitelist, true, whitelistFilter));
  if (blacklist.length && blacklistFilter) labels.push(filterConditionText(blacklist, false, blacklistFilter));
  return labels.join(" · ") || undefined;
}

function scaleDamageMap(value: unknown, multiplier: number): JsonMap | null {
  if (!isMap(value)) return null;
  const scaled: JsonMap = {};
  for (const [type, amount] of Object.entries(value)) {
    if (typeof amount === "number") scaled[type] = amount * multiplier;
  }
  return Object.keys(scaled).length ? scaled : null;
}

function filterConditionText(tags: string[], allowed: boolean, filter: JsonMap) {
  const names = tags.map(weaponTagLabel);
  const conjunction = filter.requireAll === true ? " и " : " или ";
  return `${allowed ? "только для" : "кроме"}: ${names.join(conjunction)}`;
}

function weaponTagLabel(value: string) {
  const labels: Record<string, string> = {
    RMCWeaponShotgun: "дробовиков",
    CMM96SSniperRifle: "M96S",
    RMCWeaponLMGM60: "M60",
    RMCGunBipodFullAuto: "оружия с автоогнём от сошек",
    RMCWeaponPistolL14: "пистолета L14",
  };
  return labels[value] ?? readableId(value);
}

function ammoModeLabel(value: string) {
  const labels: Record<string, string> = {
    "rmc-toggleable-ammo-highly-precise": "Высокоточный режим",
    "rmc-toggleable-ammo-armor-shredding": "Бронебойный режим",
  };
  return labels[value] ?? readableId(value);
}

function sustainedShotsToOverheat(stats: JsonMap, overheat: JsonMap) {
  const shotsPerSecond = typeof stats.shotsPerSecond === "number" ? stats.shotsPerSecond : null;
  const maxHeat = typeof overheat.maxHeat === "number" ? overheat.maxHeat : null;
  const heatPerShot = typeof overheat.heatPerShot === "number" ? overheat.heatPerShot : null;
  const cooldownRate = typeof overheat.cooldownRate === "number" ? overheat.cooldownRate : 0;
  if (shotsPerSecond == null || maxHeat == null || heatPerShot == null) return null;
  const heatPerSecond = shotsPerSecond * heatPerShot - cooldownRate;
  return heatPerSecond > 0 ? Math.ceil((maxHeat / heatPerSecond) * shotsPerSecond) : null;
}

function emergencyHeat(overheat: JsonMap) {
  if (typeof overheat.maxHeat !== "number" || typeof overheat.emergencyCooldownMultiplier !== "number") return null;
  return formatNumber(overheat.maxHeat * overheat.emergencyCooldownMultiplier);
}

function attachmentGroupLabel(value: string) {
  const labels: Record<string, string> = {
    AttachableWeaponRangedMods: "Стрельба", AttachableWeaponMeleeMods: "Ближний бой",
    AttachableSpeedMods: "Передвижение", AttachableWieldDelayMods: "Вскидывание",
    AttachableSizeMods: "Габариты",
  };
  return labels[value] ?? readableId(value);
}

function attachmentEffectLabel(value: string) {
  const labels: Record<string, string> = {
    AttachableIFF: "Система свой-чужой", AttachableToggleable: "Можно включать и выключать",
    AttachableToggleableSimpleActivate: "Быстрая активация", AttachableTemporarySpeedMods: "Временное изменение скорости",
  };
  return labels[value] ?? readableId(value).replace(/^Attachable\s*/u, "");
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function signedPercent(value: number) {
  const amount = Math.round(value * 100);
  return `${amount > 0 ? "+" : ""}${amount}%`;
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
  const mechanics = isMap(stats.mechanics) ? stats.mechanics : {};
  const holder = isMap(mechanics.EncryptionKeyHolder) ? mechanics.EncryptionKeyHolder : {};
  const ownKey = isMap(mechanics.EncryptionKey) ? mechanics.EncryptionKey : {};
  const channels = new Set<string>(Array.isArray(ownKey.channels) ? ownKey.channels.map(String) : []);
  for (const id of ids) {
    const keyMechanics = catalog.items[id]?.communicationStats?.mechanics;
    const key = isMap(keyMechanics) && isMap(keyMechanics.EncryptionKey) ? keyMechanics.EncryptionKey : {};
    if (Array.isArray(key.channels)) for (const channel of key.channels) channels.add(String(channel));
  }
  const defaultChannel = typeof holder.defaultChannel === "string" ? holder.defaultChannel : null;
  if (defaultChannel) channels.add(defaultChannel);
  const multicast = isMap(mechanics.HeadsetMultiBroadcast) ? mechanics.HeadsetMultiBroadcast : {};
  const headset = isMap(mechanics.RMCHeadset) ? mechanics.RMCHeadset : {};
  return (
    <DetailSection title="Связь">
      <StatGrid rows={[
        ["Каналы передачи", [...channels].map(channelLabel).join(", ") || null],
        ["Канал по умолчанию", defaultChannel ? channelLabel(defaultChannel) : null],
        ["Слотов для ключей", holder.keySlots],
        ["Общая передача", multicast.cooldown != null ? `перезарядка ${formatNumber(multicast.cooldown)} с` : null],
        ["Дальность отображения текста", headset.radioTextIncrease != null ? `+${formatNumber(headset.radioTextIncrease)}` : null],
        ["Установленные ключи", ids.map((id) => catalog.items[id]?.name ?? readableId(id)).join(", ") || null],
      ]} />
    </DetailSection>
  );
}

function channelLabel(value: string) {
  const labels: Record<string, string> = {
    MarineCommon: "Общий", MarineAlpha: "Альфа", MarineBravo: "Браво", MarineCharlie: "Чарли",
    MarineDelta: "Дельта", MarineEcho: "Эхо", MarineFoxtrot: "Фокстрот", MarineCommand: "Командование",
    MarineEngineer: "Инженерный", MarineMedical: "Медицинский", MarineRequisition: "Снабжение",
    MarineMilitaryPolice: "Военная полиция", MarineIntel: "Разведка", MarineJTAC: "СКАТ",
  };
  return labels[value] ?? readableId(value);
}

function SkillBlock({ stats }: { stats: JsonMap }) {
  const skills = isMap(stats.skills) ? stats.skills : {};
  const caps = isMap(stats.skillCaps) ? stats.skillCaps : {};
  const rows: Row[] = Object.entries(skills).map(([skill, level]) => {
    const cap = caps[skill];
    const suffix = typeof cap === "number" ? `, максимум ${formatNumber(cap)}` : "";
    return [readableId(skill), `+${formatNumber(level)} ур.${suffix}`];
  });
  if (typeof stats.language === "string") rows.push(["Изучаемый язык", readableId(stats.language)]);
  if (typeof stats.jobTitle === "string") rows.push(["Новая должность", readableId(stats.jobTitle)]);
  return (
    <DetailSection title="Обучение">
      <StatGrid rows={rows} />
    </DetailSection>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

function StatGrid({ rows }: { rows: Row[] }) {
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
