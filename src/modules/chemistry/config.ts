import { dataRoot } from "../../data/paths";

export const CHEMISTRY_DATA_ROOT = dataRoot(
  "chemistry",
  import.meta.env.VITE_CHEMISTRY_DATA_ROOT,
);

export const CHEMISTRY_CATALOG_URL = new URL(
  "catalog.json",
  CHEMISTRY_DATA_ROOT,
).toString();

export const CHEMISTRY_SECTIONS = [
  { id: "ordnance", label: "Боевая химия" },
  { id: "medicine", label: "Медицина" },
  { id: "drinks", label: "Напитки" },
  { id: "elements", label: "Элементы" },
  { id: "other", label: "Другие вещества" },
] as const;
