import { useCallback, useEffect, useState } from "react";
import { fetchRemoteJson } from "../../data/remoteJson";
import { CATALOG_URL } from "./config";
import type { Catalog } from "./types";
import { loadMapStaticItems } from "../maps/api";
import { mapDataUrl } from "../maps/config";

let catalogCache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCatalog(value: unknown): Catalog {
  if (!isRecord(value)) throw new Error("Каталог имеет неверный формат");
  const catalog = value as Partial<Catalog>;
  if (catalog.schemaVersion !== 4) throw new Error("Приложению требуется catalog schema 4");
  if (
    typeof catalog.gameCommit !== "string"
    || !isRecord(catalog.items)
    || !isRecord(catalog.sources)
    || !isRecord(catalog.publicCatalog)
    || !Array.isArray(catalog.publicCatalog.itemIds)
    || !isRecord(catalog.publicCatalog.categories)
  ) {
    throw new Error("В каталоге отсутствуют обязательные блоки");
  }
  for (const [id, item] of Object.entries(catalog.items)) {
    if (!isRecord(item) || item.id !== id || typeof item.name !== "string") {
      throw new Error(`Предмет ${id} имеет неверный формат`);
    }
  }
  if (!catalog.publicCatalog.itemIds.every((id) => typeof id === "string" && Boolean(catalog.items?.[id]))) {
    throw new Error("Публичный каталог ссылается на отсутствующие предметы");
  }
  return catalog as Catalog;
}

function mergeMapItems(catalog: Catalog, mapCatalog: Awaited<ReturnType<typeof loadMapStaticItems>> | null): Catalog {
  if (!mapCatalog) return catalog;
  const items = { ...catalog.items };
  for (const [id, item] of Object.entries(mapCatalog.items)) {
    const mapImage = item.image ? mapDataUrl(item.image) : undefined;
    items[id] = items[id]
      ? {
          ...items[id],
          category: item.category,
          types: item.types,
          classification: item.classification,
          image: items[id].image ?? mapImage,
        }
      : { ...item, image: mapImage };
  }
  const itemIds = [...catalog.publicCatalog.itemIds];
  for (const id of mapCatalog.publicCatalog.itemIds) if (!itemIds.includes(id)) itemIds.push(id);
  const categoryNames = new Set([
    ...Object.keys(catalog.publicCatalog.categories),
    ...Object.keys(mapCatalog.publicCatalog.categories),
  ]);
  const categories = Object.fromEntries([...categoryNames].map((category) => [category, [] as string[]]));
  for (const id of itemIds) {
    const category = items[id].category ?? "Другое";
    (categories[category] ??= []).push(id);
  }
  return {
    ...catalog,
    items,
    publicCatalog: { ...catalog.publicCatalog, itemIds, categories },
    counts: { ...catalog.counts, publicItems: itemIds.length, catalogItems: Object.keys(items).length },
  };
}

function loadCatalog(force = false): Promise<Catalog> {
  if (catalogCache && !force) return Promise.resolve(catalogCache);
  if (inflight && !force) return inflight;
  inflight = Promise.all([
    fetchRemoteJson(CATALOG_URL, { cache: force ? "reload" : "default" }).then(validateCatalog),
    loadMapStaticItems().catch(() => null),
  ])
    .then(([catalog, mapCatalog]) => mergeMapItems(catalog, mapCatalog))
    .then((catalog) => {
      catalogCache = catalog;
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(catalogCache);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!catalogCache);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;
    loadCatalog(requestKey > 0)
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Неизвестная ошибка");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [requestKey]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRequestKey((value) => value + 1);
  }, []);
  return { catalog, error, loading, retry };
}
