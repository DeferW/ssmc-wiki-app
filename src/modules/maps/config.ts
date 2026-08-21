const configuredRoot = import.meta.env.VITE_MAP_DATA_ROOT
  ?? "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/maps/";

export const MAP_DATA_ROOT = configuredRoot.endsWith("/")
  ? configuredRoot
  : `${configuredRoot}/`;

export const MAP_CATALOG_URL = new URL("catalog.json", MAP_DATA_ROOT).toString();
