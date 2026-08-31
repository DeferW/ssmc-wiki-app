import { fetchRemoteJson } from "../../data/remoteJson";
import { MAP_CATALOG_URL, MAP_STATIC_ITEMS_URL } from "./config";
import type { MapCatalog, MapOverlay, MapStaticItemCatalog, TileManifest } from "./types";

let catalogPromise: Promise<MapCatalog> | undefined;
let staticItemsPromise: Promise<MapStaticItemCatalog> | undefined;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  // JSON files are tiny mutable pointers on the main branch. Revalidate them;
  // only the much heavier immutable image tiles use force-cache in MapCanvas.
  return await fetchRemoteJson(url, { signal, cache: "no-cache" }) as T;
}

function requireCatalog(value: MapCatalog): MapCatalog {
  if (value.schemaVersion !== 1 || !Array.isArray(value.maps) || value.maps.length === 0) {
    throw new Error("Каталог карт имеет неподдерживаемый формат.");
  }
  return value;
}

export function loadMapCatalog(): Promise<MapCatalog> {
  catalogPromise ??= fetchJson<MapCatalog>(MAP_CATALOG_URL).then(requireCatalog);
  return catalogPromise;
}

export function loadMapStaticItems(): Promise<MapStaticItemCatalog> {
  staticItemsPromise ??= fetchJson<MapStaticItemCatalog>(MAP_STATIC_ITEMS_URL).then((value) => {
    if (value.schemaVersion !== 1 || !value.items || !Array.isArray(value.publicCatalog?.itemIds)) {
      throw new Error("Каталог предметов карт имеет неподдерживаемый формат.");
    }
    return value;
  });
  return staticItemsPromise;
}

export async function loadTileManifest(url: string, signal: AbortSignal): Promise<TileManifest> {
  const value = await fetchJson<TileManifest>(url, signal);
  if (![1, 2, 3].includes(value.schemaVersion) || !Array.isArray(value.grids) || value.grids.length === 0) {
    throw new Error("Тайловый манифест имеет неподдерживаемый формат.");
  }
  return value;
}

export async function loadMapOverlay(url: string, signal: AbortSignal): Promise<MapOverlay> {
  const value = await fetchJson<MapOverlay>(url, signal);
  if (![1, 2, 3, 4, 5].includes(value.schemaVersion) || !value.prototypes || !value.occurrences) {
    throw new Error("Оверлей карты имеет неподдерживаемый формат.");
  }
  return value;
}
