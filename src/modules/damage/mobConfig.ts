import { dataRoot } from "../../data/paths";

export const MOBS_DATA_ROOT = dataRoot(
  "mobs",
  import.meta.env.VITE_MOBS_DATA_ROOT,
);

export const MOBS_CATALOG_URL = new URL("catalog.json", MOBS_DATA_ROOT).toString();
