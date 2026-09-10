import { dataRoot } from "../../data/paths";

export const MAP_DATA_ROOT = dataRoot("maps", import.meta.env.VITE_MAP_DATA_ROOT);

export function mapDataUrl(relativePath: string, revision?: string): string {
  const url = new URL(relativePath, MAP_DATA_ROOT);
  if (revision) url.searchParams.set("v", revision);
  return url.toString();
}

export const MAP_CATALOG_URL = mapDataUrl("catalog.json");
export const MAP_STATIC_ITEMS_URL = mapDataUrl("static-items.json");
