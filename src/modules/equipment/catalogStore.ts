import { useCallback, useEffect, useState } from "react";
import { CATALOG_URL } from "./config";
import type { Catalog } from "./types";

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

function loadCatalog(force = false): Promise<Catalog> {
  if (catalogCache && !force) return Promise.resolve(catalogCache);
  if (inflight && !force) return inflight;
  inflight = fetch(CATALOG_URL, { cache: force ? "reload" : "default" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    })
    .then(validateCatalog)
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
