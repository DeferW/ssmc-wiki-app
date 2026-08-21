import { MAP_CATALOG_URL } from "./config";
import type { MapCatalog, MapOverlay, TileManifest } from "./types";

let catalogPromise: Promise<MapCatalog> | undefined;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  // JSON files are tiny mutable pointers on the main branch. Revalidate them;
  // only the much heavier immutable image tiles use force-cache in MapCanvas.
  const response = await fetch(url, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.json() as Promise<T>;
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

export async function loadTileManifest(url: string, signal: AbortSignal): Promise<TileManifest> {
  const value = await fetchJson<TileManifest>(url, signal);
  if (![1, 2, 3].includes(value.schemaVersion) || !Array.isArray(value.grids) || value.grids.length === 0) {
    throw new Error("Тайловый манифест имеет неподдерживаемый формат.");
  }
  return value;
}

export async function loadMapOverlay(url: string, signal: AbortSignal): Promise<MapOverlay> {
  const value = await fetchJson<MapOverlay>(url, signal);
  if (![1, 2, 3].includes(value.schemaVersion) || !value.prototypes || !value.occurrences) {
    throw new Error("Оверлей карты имеет неподдерживаемый формат.");
  }
  return value;
}
