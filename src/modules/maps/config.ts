const configuredRoot = import.meta.env.VITE_MAP_DATA_ROOT
  ?? "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/maps/";

export const MAP_DATA_ROOT = configuredRoot.endsWith("/")
  ? configuredRoot
  : `${configuredRoot}/`;

// Increment only when the published map contract changes. Besides documenting
// compatibility this gives GitHub Raw metadata a new browser-cache key.
export const MAP_DATA_CONTRACT = "6";

export function mapDataUrl(relativePath: string): string {
  const url = new URL(relativePath, MAP_DATA_ROOT);
  url.searchParams.set("v", MAP_DATA_CONTRACT);
  return url.toString();
}

export const MAP_CATALOG_URL = mapDataUrl("catalog.json");
