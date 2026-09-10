import { dataRoot } from "../../data/paths";
import categories from "../../../config/catalog-categories.json";

export const CATALOG_DATA_ROOT = dataRoot(
  "catalog",
  import.meta.env.VITE_CATALOG_DATA_ROOT,
);

export const CATALOG_URL = new URL("catalog.json", CATALOG_DATA_ROOT).toString();

export const CATEGORY_ORDER: readonly string[] = categories.map((category) => category.name);
export const HIDDEN_CATEGORY = categories.find((category) => category.id === "hidden")!.name;
