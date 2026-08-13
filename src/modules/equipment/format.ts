import { CATEGORY_ORDER } from "./config";
import type { Catalog, CatalogItem, JsonMap } from "./types";

export function isMap(value: unknown): value is JsonMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function capitalizeName(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/u.test(value[index])) return value;
    if (/\p{L}/u.test(value[index])) {
      return value.slice(0, index) + value[index].toLocaleUpperCase("ru") + value.slice(index + 1);
    }
  }
  return value;
}

export function descriptionText(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || /^\{\s*["']?\s*["']?\s*\}$/u.test(text)) return "Нет описания предмета";
    return text;
  }
  if (isMap(value)) {
    const text = Object.values(value).find((candidate) => typeof candidate === "string" && candidate.trim());
    if (typeof text === "string") return text.trim();
  }
  return "Нет описания предмета";
}

export function categoryIndex(category?: string) {
  const index = CATEGORY_ORDER.indexOf(category as typeof CATEGORY_ORDER[number]);
  return index < 0 ? CATEGORY_ORDER.length : index;
}

export function isCatalogItemVisible(category: string, includeHidden = false) {
  return includeHidden || category !== "Скрытые";
}

export function itemMatches(item: CatalogItem, query: string) {
  const needle = normalize(query);
  if (!needle) return true;
  return [item.name, item.id, descriptionText(item.description), ...(item.tags ?? [])]
    .some((candidate) => normalize(candidate).includes(needle));
}

export function formatNumber(value: unknown, digits = 2) {
  return typeof value === "number"
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value)
    : String(value ?? "");
}

export function formatValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "string") return readableId(value);
  return String(value ?? "—");
}

export function readableId(value: string) {
  const known: Record<string, string> = {
    CMBicaridine: "Бикаридин",
    CMKelotane: "Келотан",
    CMTricordrazine: "Трикордразин",
    CMDexalin: "Дексалин",
    CMDylovene: "Диловен",
    CMInaprovaline: "Инапровалин",
    CMEpinephrine: "Эпинефрин",
    Blood: "Кровь",
    SemiAuto: "Одиночный",
    Burst: "Очередь",
    FullAuto: "Автоматический",
    RMCSkillMedical: "Медицина",
    RMCSkillResearch: "Исследования",
    RMCSkillEngineer: "Инженерия",
    RMCSkillConstruction: "Строительство",
    RMCSkillJtac: "Наведение и связь",
    RMCSkillPowerLoader: "Погрузчик",
    RMCSkillPolice: "Военная полиция",
    RMCSkillSurgery: "Хирургия",
    RMCSkillIntel: "Разведка",
    RMCSkillVehicles: "Транспорт",
    RMCSkillOverwatch: "Командная консоль",
    RMCSkillVulture: "Орудие Vulture",
    Russian: "Русский язык",
    Japanese: "Японский язык",
    Chinese: "Китайский язык",
    German: "Немецкий язык",
    Spanish: "Испанский язык",
    French: "Французский язык",
    SignLanguage: "Язык жестов",
    Scandinavian: "Скандинавский язык",
    Xeno: "Язык ксенонидов",
    Primitive: "Примитивный язык",
    Tiny: "Крошечный",
    Small: "Маленький",
    Normal: "Средний",
    Large: "Большой",
    Huge: "Огромный",
    Ginormous: "Гигантский",
  };
  return known[value]
    ?? value.replace(/^RMC|^CM/, "").replace(/([a-zа-я])([A-ZА-Я])/g, "$1 $2").replaceAll("_", " ");
}

export function formatDamage(value: unknown) {
  if (!isMap(value)) return null;
  const labels: Record<string, string> = {
    Blunt: "Дробящий",
    Slash: "Режущий",
    Piercing: "Колющий",
    Heat: "Термический",
    Caustic: "Кислотный",
    Structural: "Структурный",
  };
  const entries = Object.entries(value).filter(([, amount]) => typeof amount === "number" && amount !== 0);
  return entries.length
    ? entries.map(([type, amount]) => `${labels[type] ?? readableId(type)} ${formatNumber(amount)}`).join(" · ")
    : null;
}

export function formatCost(value: unknown) {
  if (typeof value === "number") return `${formatNumber(value)} кредитов`;
  if (isMap(value)) {
    return Object.entries(value).map(([currency, amount]) => `${formatNumber(amount)} ${readableId(currency)}`).join(" · ");
  }
  return value == null ? null : formatValue(value);
}

export function slotLabel(value: string) {
  const labels: Record<string, string> = {
    Back: "Спина", back: "Спина", suitStorage: "Броня", suitstorage: "Броня",
    outerClothing: "Верхняя одежда", outerclothing: "Верхняя одежда", head: "Голова",
    eyes: "Глаза", ears: "Уши", mask: "Маска", belt: "Пояс", pocket: "Карман",
    gloves: "Перчатки", neck: "Шея", shoes: "Обувь", jumpsuit: "Униформа",
  };
  return labels[value] ?? readableId(value);
}

export function explicitStorageItemIds(item: CatalogItem, catalog: Catalog) {
  const storage = isMap(item.storageStats) ? item.storageStats : {};
  const whitelist = isMap(storage.whitelist) ? storage.whitelist : {};
  const hasExplicitWhitelist = Object.values(whitelist).some((value) => (
    Array.isArray(value) ? value.length > 0 : isMap(value) ? Object.keys(value).length > 0 : Boolean(value)
  ));
  if (!hasExplicitWhitelist || !Array.isArray(storage.acceptedItemIds)) return [];

  const accepted = [...new Set(storage.acceptedItemIds.map(String).filter((id) => catalog.items[id]))];
  const packed = new Set((item.relationships ?? [])
    .filter((relation) => relation.itemId && ["contains", "bundleItem", "slotItem"].includes(relation.type ?? ""))
    .map((relation) => relation.itemId as string));

  if (accepted.length === packed.size && accepted.every((id) => packed.has(id))) return [];
  return accepted;
}
