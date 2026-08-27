import { useCallback, useEffect, useState } from "react";
import { fetchRemoteJson } from "../../data/remoteJson";
import { MOBS_CATALOG_URL } from "./mobConfig";
import type { MobCatalog } from "./mobTypes";

let catalogCache: MobCatalog | null = null;
let inflight: Promise<MobCatalog> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateMobCatalog(value: unknown): MobCatalog {
  if (!isRecord(value)) throw new Error("Каталог мобов имеет неверный формат");
  const catalog = value as Partial<MobCatalog>;
  if (catalog.schemaVersion !== 1) throw new Error("Приложению требуется mob catalog schema 1");
  if (!isRecord(catalog.marine) || !isRecord(catalog.marine.thresholds) || !isRecord(catalog.xenoCastes)) {
    throw new Error("В каталоге мобов отсутствуют обязательные блоки");
  }
  return catalog as MobCatalog;
}

function loadMobCatalog(force = false): Promise<MobCatalog> {
  if (catalogCache && !force) return Promise.resolve(catalogCache);
  if (inflight && !force) return inflight;
  inflight = fetchRemoteJson(MOBS_CATALOG_URL, { cache: force ? "reload" : "default" })
    .then(validateMobCatalog)
    .then((catalog) => {
      catalogCache = catalog;
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useMobCatalog() {
  const [mobCatalog, setMobCatalog] = useState<MobCatalog | null>(catalogCache);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!catalogCache);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;
    loadMobCatalog(requestKey > 0)
      .then((result) => {
        if (active) setMobCatalog(result);
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
  return { mobCatalog, error, loading, retry };
}
