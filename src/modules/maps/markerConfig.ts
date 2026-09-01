import type { OverlayGroup, OverlayPoint } from "./types";

export type MarkerIcon =
  | "insert"
  | "spawn"
  | "comms"
  | "intel"
  | "weapon"
  | "ammo"
  | "attachment"
  | "defense"
  | "medical"
  | "tools"
  | "equipment"
  | "supply"
  | "loot"
  | "fauna"
  | "remains"
  | "evacuation"
  | "teleport"
  | "boundary"
  | "decor"
  | "technical"
  | "unknown";

export type MarkerCategoryDefinition = {
  key: string;
  label: string;
  detail: string;
  icon: MarkerIcon;
  symbol: string;
  groups?: OverlayGroup[];
  layer?: "insert";
};

export const MARKER_CATEGORIES: MarkerCategoryDefinition[] = [
  { key: "inserts", label: "Инсерты", detail: "вариативные участки карты", icon: "insert", symbol: "⌗", layer: "insert" },
  { key: "communications", label: "Связь", detail: "возможные позиции вышек связи", icon: "comms", symbol: "⌁", groups: ["misc-communications"] },
  { key: "spawns", label: "Точки появления", detail: "роли, отряды и криокапсулы", icon: "spawn", symbol: "♙", groups: ["misc-spawns"] },
  { key: "evacuation", label: "Эвакуация", detail: "капсулы и спасательные шлюпки", icon: "evacuation", symbol: "↗", groups: ["misc-evacuation"] },
  { key: "teleports", label: "Переходы и телепорты", detail: "точки назначения и перехода", icon: "teleport", symbol: "◎", groups: ["misc-teleports"] },
  { key: "intel", label: "Разведданные", detail: "документы, отчёты и разведывательные цели", icon: "intel", symbol: "▤", groups: ["loot-intel"] },
  { key: "weapons", label: "Оружие", detail: "случайное стрелковое оружие", icon: "weapon", symbol: "⊕", groups: ["loot-weapons"] },
  { key: "ammo", label: "Боеприпасы", detail: "патроны, боезапас и взрывчатка", icon: "ammo", symbol: "▰", groups: ["loot-ammo"] },
  { key: "attachments", label: "Обвесы", detail: "случайные оружейные модули", icon: "attachment", symbol: "⊣", groups: ["loot-attachments"] },
  { key: "defense", label: "Оборонные системы", detail: "турели и тяжёлое вооружение", icon: "defense", symbol: "△", groups: ["loot-defense"] },
  { key: "medical", label: "Медицина", detail: "препараты и медицинские наборы", icon: "medical", symbol: "+", groups: ["loot-medical"] },
  { key: "tools", label: "Инструменты и энергия", detail: "инструменты, батареи и технические наборы", icon: "tools", symbol: "⚙", groups: ["loot-tools"] },
  { key: "equipment", label: "Экипировка", detail: "очки, броня и носимое снаряжение", icon: "equipment", symbol: "▽", groups: ["loot-equipment"] },
  { key: "supplies", label: "Снабжение и ящики", detail: "комплекты, контейнеры и ящики AEGIS", icon: "supply", symbol: "⊠", groups: ["loot-supplies"] },
  { key: "random", label: "Прочий случайный лут", detail: "прочие точки случайных предметов", icon: "loot", symbol: "※", groups: ["loot-other"] },
  { key: "fauna", label: "Живые существа", detail: "животные, обезьяны и космические карпы", icon: "fauna", symbol: "♣", groups: ["misc-fauna"] },
  { key: "remains", label: "Тела и следы", detail: "тела, кровь, останки и масляные пятна", icon: "remains", symbol: "✕", groups: ["misc-remains"] },
  { key: "environment", label: "Случайное окружение", detail: "постеры, растения, мусор и декор", icon: "decor", symbol: "✣", groups: ["misc-decor"] },
  { key: "boundaries", label: "Границы и запреты", detail: "туман, барьеры и ограничители транспорта", icon: "boundary", symbol: "⊘", groups: ["misc-boundaries"] },
  { key: "technical", label: "Служебные точки", detail: "редкие вспомогательные точки маппинга", icon: "technical", symbol: "⊙", groups: ["misc-technical"] },
  { key: "unknown", label: "Не распределено", detail: "новые маркеры, для которых ещё нет категории", icon: "unknown", symbol: "?", groups: ["misc-unclassified"] },
];

export const MARKER_STYLE: Partial<Record<OverlayGroup, { icon: MarkerIcon; color: string }>> = {
  "misc-spawns": { icon: "spawn", color: "#ff8585" },
  "misc-communications": { icon: "comms", color: "#69d7d0" },
  "misc-evacuation": { icon: "evacuation", color: "#f2b86b" },
  "misc-teleports": { icon: "teleport", color: "#b99af2" },
  "loot-intel": { icon: "intel", color: "#efcf70" },
  "loot-weapons": { icon: "weapon", color: "#f08072" },
  "loot-ammo": { icon: "ammo", color: "#e6a85e" },
  "loot-attachments": { icon: "attachment", color: "#d69fe8" },
  "loot-defense": { icon: "defense", color: "#ef7777" },
  "loot-medical": { icon: "medical", color: "#77dca2" },
  "loot-tools": { icon: "tools", color: "#83c8e6" },
  "loot-equipment": { icon: "equipment", color: "#a7d184" },
  "loot-supplies": { icon: "supply", color: "#ffd166" },
  "loot-other": { icon: "loot", color: "#d8bc78" },
  "misc-fauna": { icon: "fauna", color: "#e58a9b" },
  "misc-remains": { icon: "remains", color: "#d97070" },
  "misc-decor": { icon: "decor", color: "#a5b58e" },
  "misc-boundaries": { icon: "boundary", color: "#9bd5d2" },
  "misc-technical": { icon: "technical", color: "#d9a7ff" },
  "misc-unclassified": { icon: "unknown", color: "#b2bcb5" },
};

export function markerStyle(point: OverlayPoint): { icon: MarkerIcon; color: string } {
  if (point.category === "insert") return { icon: "insert", color: "#53c8e8" };
  return MARKER_STYLE[point.group] ?? { icon: "unknown", color: "#b2bcb5" };
}

export function markerCategory(point: OverlayPoint): MarkerCategoryDefinition | undefined {
  return MARKER_CATEGORIES.find((definition) => (
    point.category === "insert"
      ? definition.layer === "insert"
      : definition.groups?.includes(point.group)
  ));
}
