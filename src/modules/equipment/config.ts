export const CATALOG_DATA_ROOT =
  import.meta.env.VITE_CATALOG_DATA_ROOT
  ?? "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/catalog/";

export const CATALOG_URL = new URL("catalog.json", CATALOG_DATA_ROOT).toString();

export const CATEGORY_ORDER = [
  "Оружие",
  "Боезапас",
  "Обвесы",
  "Броня",
  "Экипировка",
  "Медицина",
  "Снаряжение",
  "Другое",
  "Скрытые",
] as const;

export const HIDDEN_CATEGORY = "Скрытые";
export const FIRST_PAGE_SIZE = 96;
export const PAGE_SIZE = 96;
