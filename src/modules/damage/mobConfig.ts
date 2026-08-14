export const MOBS_DATA_ROOT =
  import.meta.env.VITE_MOBS_DATA_ROOT
  ?? "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/mobs/";

export const MOBS_CATALOG_URL = new URL("catalog.json", MOBS_DATA_ROOT).toString();
