import { CATEGORY_ORDER } from "./constants";
import type { CatalogItem, JsonMap } from "./types";

export function isMap(value: unknown): value is JsonMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
}

export function capitalizeName(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\d/u.test(character)) return value;
    if (/\p{L}/u.test(character)) return value.slice(0, index) + character.toLocaleUpperCase("ru") + value.slice(index + 1);
  }
  return value;
}

export function categoryIndex(category?: string) {
  const index = CATEGORY_ORDER.indexOf(category as typeof CATEGORY_ORDER[number]);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function itemCompatibleWith(item: CatalogItem, weaponId: string) {
  if (item.compatibleWeaponIds?.includes(weaponId)) return true;
  return (item.attachableTo || []).some((slot) => (slot.weaponIds || []).includes(weaponId));
}

export function formatNumber(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value) : String(value ?? "");
}

export function formatValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).join(", ");
  if (typeof value === "string") {
    const translated = value.split(",").map((entry) => enumLabel(entry.trim())).join(", ");
    return translated || "—";
  }
  return String(value ?? "—");
}

export function descriptionText(value: unknown): string {
  if (typeof value === "string") return value.trim() || "Нет описания";
  if (isMap(value)) {
    const text = Object.values(value).find((entry) => typeof entry === "string" && entry.trim());
    return typeof text === "string" ? text.trim() : "Нет описания";
  }
  return "Нет описания";
}

export function signedNumber(value: unknown, suffix = "") {
  if (typeof value !== "number") return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value))}${suffix}`;
}

export function signedPercent(value: unknown) {
  return typeof value === "number" ? signedNumber(Math.round(value * 100), "%") : null;
}

export function attachmentCondition(value: unknown) {
  if (!isMap(value)) return "Всегда";
  return [
    value.activeOnly === true ? "включён" : null,
    value.inactiveOnly === true ? "выключен" : null,
    value.wieldedOnly === true ? "в упоре" : null,
    value.unwieldedOnly === true ? "с рук" : null,
  ].filter(Boolean).join(", ") || "Всегда";
}

export function attachmentModifierRows(modifiers: JsonMap): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [];
  const append = (label: string, value: unknown, condition: string) => {
    if (value !== null && value !== undefined && value !== "") {
      rows.push([condition === "Всегда" ? label : `${label} · ${condition}`, value]);
    }
  };
  for (const raw of Object.values(modifiers)) {
    if (!isMap(raw)) continue;
    const lists = [raw.modifiers, raw.fireModeMods].filter(Array.isArray) as unknown[][];
    if (!lists.length) lists.push([raw]);
    for (const list of lists) {
      for (const entry of list.filter(isMap)) {
        const condition = attachmentCondition(entry.conditions);
        append("Точность", signedPercent(entry.accuracyAddMult), condition);
        append("Урон", signedPercent(entry.damageAddMult), condition);
        append("Падение урона", signedPercent(entry.damageFalloffAddMult), condition);
        append("Разброс", signedNumber(entry.scatterFlat), condition);
        append("Разброс очереди", signedNumber(entry.burstScatterAddMult), condition);
        append("Отдача", signedNumber(entry.recoilFlat), condition);
        append("Задержка выстрела", signedNumber(entry.fireDelayFlat, " с"), condition);
        append("Патронов в очереди", signedNumber(entry.shotsPerBurstFlat), condition);
        append("Скорость ходьбы", signedPercent(entry.walk), condition);
        append("Скорость бега", signedPercent(entry.sprint), condition);
        append("Время вскидывания", signedNumber(entry.delay, " с"), condition);
        append("Размер оружия", signedNumber(entry.size), condition);
        if (isMap(entry.bonusDamage)) {
          const damage = isMap(entry.bonusDamage.types) ? entry.bonusDamage.types : entry.bonusDamage;
          append("Урон в ближнем бою", formatDamage(damage), condition);
        }
        if (entry.extraFireModes != null) append("Добавляет режим", formatValue(entry.extraFireModes), condition);
      }
    }
  }
  return rows;
}

export function ammoProviderRows(value: unknown): Array<[string, unknown]> {
  const provider = isMap(value) ? value : {};
  return [
    ["Вместимость", provider.capacity != null ? `${formatNumber(provider.capacity)} шт.` : null],
    ["Боеприпас", provider.proto ? readableId(String(provider.proto)) : null],
    ["Расход за выстрел", provider.fireCost],
  ];
}

export function flattenReadable(value: unknown, path: string[] = []): { rows: Array<[string, unknown]>; complex: unknown[] } {
  const rows: Array<[string, unknown]> = [];
  const complex: unknown[] = [];
  if (!isMap(value)) {
    if (Array.isArray(value) && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
      rows.push([path.map(statLabel).join(" · ") || "Значение", value]);
    } else if (["string", "number", "boolean"].includes(typeof value)) {
      rows.push([path.map(statLabel).join(" · ") || "Значение", value]);
    } else if (value != null) complex.push(value);
    return { rows, complex };
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if ((key === "damage" || key === "bonusDamage") && isMap(child)) {
      const damage = isMap(child.types) ? child.types : child;
      rows.push([nextPath.map(statLabel).join(" · "), formatDamage(damage)]);
      continue;
    }
    if (["string", "number", "boolean"].includes(typeof child)) {
      rows.push([nextPath.map(statLabel).join(" · "), formatFieldValue(key, child)]);
      continue;
    }
    if (Array.isArray(child) && child.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
      rows.push([nextPath.map(statLabel).join(" · "), child]);
      continue;
    }
    if (isMap(child)) {
      const nested = flattenReadable(child, nextPath);
      rows.push(...nested.rows);
      complex.push(...nested.complex);
      continue;
    }
    if (child != null) complex.push({ [key]: child });
  }
  return { rows, complex };
}

export function formatFieldValue(key: string, value: unknown) {
  if (typeof value !== "number") return value;
  if (/delay|cooldown|doAfter/i.test(key)) return `${formatNumber(value)} с`;
  if (/multiplier|modifier/i.test(key)) return `×${formatNumber(value)}`;
  if (/walk|sprint/i.test(key)) return asPercent(value);
  if (/angle|rotation/i.test(key)) return `${formatNumber(value)}°`;
  if (/range|radius/i.test(key)) return `${formatNumber(value)} тайл.`;
  return value;
}

export function statLabel(value: string) {
  const labels: Record<string, string> = {
    wielded: "В упоре", unwielded: "С рук", wieldedOnly: "Только в упоре", unwieldedOnly: "Только с рук",
    activeOnly: "Только во включённом состоянии", inactiveOnly: "Только в выключенном состоянии",
    accuracy: "Точность", wieldedMultiplier: "В упоре", unwieldedMultiplier: "С рук",
    recoilFlat: "Отдача", scatterFlat: "Разброс", accuracyAddMult: "Точность", damageAddMult: "Урон",
    fireDelay: "Задержка между выстрелами", maxScatterModifier: "Максимальный разброс",
    shotsToMaxScatter: "Выстрелов до максимального разброса", unwieldedScatterMultiplier: "Разброс с рук",
    useBurstScatterMult: "Учитывать разброс очереди", falloffMultiplier: "Множитель падения урона",
    attacksPerSecond: "Атак в секунду", angle: "Угол атаки", damage: "Урон", bonusDamage: "Дополнительный урон",
    baseDelay: "Базовая задержка", preventFiring: "Нельзя стрелять во время вскидывания",
    base: "Базовый", light: "Лёгкая броня", medium: "Средняя броня", heavy: "Тяжёлая броня",
    skills: "Навыки", weaponGroup: "Группа оружия", conditions: "Условия", modifiers: "Модификаторы",
    capacity: "Ёмкость", proto: "Боеприпас", cycleable: "Перезаряжается вручную", mayTransfer: "Можно извлечь патроны",
    maxRange: "Дальность", maxDuration: "Длительность", maxIntensity: "Интенсивность",
    FullAuto: "Автоматический", SemiAuto: "Одиночный", Burst: "Очередь",
  };
  return labels[value] || readableId(value);
}

export function enumLabel(value: string) {
  return fireModeLabel(value) !== value ? fireModeLabel(value) : ({
    light: "Лёгкий", medium: "Средний", heavy: "Тяжёлый", Handgun: "Пистолет", Rifle: "Винтовка",
    Small: "Маленький", Normal: "Обычный", Large: "Большой", Huge: "Огромный",
  } as Record<string, string>)[value] || slotLabel(value);
}

export function fireModeLabel(value: string) {
  return ({ SemiAuto: "Одиночный", Burst: "Очередь", FullAuto: "Автоматический" } as Record<string, string>)[value] || value;
}

export function slotLabel(value: string) {
  const labels: Record<string, string> = {
    Back: "Спина", back: "Спина", suitStorage: "Броня", suitstorage: "Броня",
    outerClothing: "Верхняя одежда", head: "Голова", eyes: "Глаза", ears: "Уши", mask: "Маска",
    belt: "Пояс", pocket: "Карман", gloves: "Перчатки", neck: "Шея", shoes: "Обувь", jumpsuit: "Униформа",
  };
  return labels[value] || value;
}

export function itemSizeLabel(value: unknown) {
  if (value == null) return null;
  return ({ Tiny: "Крошечный", Small: "Маленький", Normal: "Обычный", Large: "Большой", Huge: "Огромный", Ginormous: "Гигантский" } as Record<string, string>)[String(value)] || String(value);
}

export function solutionLabel(value: string) {
  return ({ pen: "Инъектор", drink: "Раствор", pack: "Пакет", food: "Содержимое", tank: "Резервуар" } as Record<string, string>)[value] || readableId(value);
}

export function readableId(value: string) {
  const known: Record<string, string> = {
    CMBicaridine: "Бикаридин", CMKelotane: "Келотан", CMTricordrazine: "Трикордразин", CMDexalin: "Дексалин",
    CMDylovene: "Диловен", CMInaprovaline: "Инапровалин", CMEpinephrine: "Эпинефрин", Blood: "Кровь",
    Fiber: "Волокно", RMCSkillFirearms: "Огнестрельное оружие", RMCSkillEngineer: "Инженерия",
    RMCSkillSmartGun: "Умное оружие", RMCSkillPolice: "Военная полиция",
  };
  if (known[value]) return known[value];
  return value.replace(/^RMC|^CM/, "").replace(/([a-zа-я])([A-ZА-Я])/g, "$1 $2").replace(/_/g, " ");
}

export function asMultiplier(value: unknown) {
  return typeof value === "number" ? `×${formatNumber(value)}` : null;
}

export function asPercent(value: unknown) {
  return typeof value === "number" ? `${formatNumber(value * 100)}%` : null;
}

export function formatMovementPenalty(movement: JsonMap) {
  const walk = typeof movement.walkModifier === "number" ? movement.walkModifier : null;
  const sprint = typeof movement.sprintModifier === "number" ? movement.sprintModifier : null;
  if (walk == null && sprint == null) return null;
  const penalty = (value: number) => `${Math.round((1 - value) * 100)}%`;
  if (walk != null && sprint != null && walk === sprint) return `−${penalty(walk)}`;
  return [
    walk != null ? `ходьба −${penalty(walk)}` : null,
    sprint != null ? `бег −${penalty(sprint)}` : null,
  ].filter(Boolean).join(" · ");
}

export function itemSizeGenitive(value: string) {
  return ({
    tiny: "крошечного",
    small: "маленького",
    normal: "обычного",
    large: "большого",
    huge: "огромного",
    ginormous: "гигантского",
  } as Record<string, string>)[value.toLocaleLowerCase()] || itemSizeLabel(value) || value;
}

export function pluralize(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function formatDamage(value: unknown) {
  if (!isMap(value)) return "Урон не указан";
  const entries = Object.entries(value).filter(([, amount]) => typeof amount === "number" && amount !== 0);
  return entries.length ? entries.map(([type, amount]) => `${damageLabel(type)} ${formatNumber(amount)}`).join(" · ") : "Урон не указан";
}

export function damageLabel(value: string) {
  const labels: Record<string, string> = { Blunt: "Дробящий", Slash: "Режущий", Piercing: "Колющий", Heat: "Термический", Caustic: "Кислотный" };
  return labels[value] || value;
}

export function armorLabel(value: string) {
  const labels: Record<string, string> = {
    xenoArmor: "Ксено-урон",
    frontalArmor: "Спереди",
    sideArmor: "Сбоку",
    melee: "Ближний бой",
    bullet: "Пули",
    laser: "Лазеры",
    bio: "Биозащита",
    explosionArmor: "Взрывы",
    acid: "Кислота",
  };
  return labels[value] || value;
}

export function componentLabel(value: string) {
  const labels: Record<string, string> = {
    AttachableWeaponRangedMods: "Стрельба",
    AttachableSpeedMods: "Скорость движения",
    AttachableWieldDelayMods: "Время вскидывания",
    AttachableMeleeMods: "Ближний бой",
  };
  return labels[value] || value;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
    .replaceAll('"conditions"', "условия")
    .replaceAll('"modifiers"', "модификаторы")
    .replaceAll('"', "");
}
