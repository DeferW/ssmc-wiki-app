import { dataRoot } from "../../data/paths";

export const MAP_DATA_ROOT = dataRoot("maps", import.meta.env.VITE_MAP_DATA_ROOT);

// Increment only when the published map contract changes. Besides documenting
// compatibility this also gives mutable metadata a new browser-cache key.
export const MAP_DATA_CONTRACT = "7";

export function mapDataUrl(relativePath: string): string {
  const url = new URL(relativePath, MAP_DATA_ROOT);
  url.searchParams.set("v", MAP_DATA_CONTRACT);
  return url.toString();
}

export const MAP_CATALOG_URL = mapDataUrl("catalog.json");
