import { dataRoot } from "../../data/paths";

export const CATALOG_DATA_ROOT = dataRoot(
  "catalog",
  import.meta.env.VITE_CATALOG_DATA_ROOT,
);

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
