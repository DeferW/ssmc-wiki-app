import { useCallback, useEffect, useMemo, useState } from "react";
import type { Catalog, CatalogItem } from "../../modules/equipment/types";
import {
  loadAdminOverrides,
  makeAdminDocument,
  normalizeAdminDocument,
  saveAdminOverrides,
} from "./api";
import type { AdminOverrides, AdminOverridesDocument, AdminSyncState } from "./types";

const DRAFT_KEY = "ssmc.admin.catalog-overrides.v2";

export function automaticCategory(item: CatalogItem) {
  return item.classification?.automaticCategory ?? item.category ?? "Другое";
}

export function useAdminOverrides(enabled: boolean, catalog: Catalog | null) {
  const [storedDraft] = useState<AdminOverrides | null>(() => readLocalDraft());
  const [draft, setDraft] = useState<AdminOverrides>(() => storedDraft ?? {});
  const [dirty, setDirty] = useState(storedDraft !== null);
  const [sha, setSha] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<AdminSyncState>(enabled ? "loading" : "ready");
  const [message, setMessage] = useState(enabled ? "Загружаю overrides…" : "");
  const [hydrated, setHydrated] = useState(!enabled);

  useEffect(() => {
    if (!enabled || !catalog) return;
    const controller = new AbortController();
    const localDraft = storedDraft;
    loadAdminOverrides(controller.signal)
      .then((result) => {
        setSha(result.sha);
        setDraft(localDraft ?? result.overrides);
        setState("ready");
        setHydrated(true);
        if (localDraft) {
          setMessage("Восстановлен локальный черновик. Сохранённый SHA загружен для защиты от конфликтов.");
        } else if (result.fallback) {
          setMessage("Overrides и актуальный SHA загружены из ssmc-wiki-app через GitHub API.");
        } else {
          setMessage(result.exists ? "Сохранённые overrides загружены." : "Overrides ещё не созданы.");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDraft(localDraft ?? overridesFromCatalog(catalog));
        setState("error");
        setHydrated(true);
        setMessage(error instanceof Error ? `Не удалось загрузить overrides: ${error.message}` : "Не удалось загрузить overrides.");
      });
    return () => controller.abort();
  }, [enabled, catalog, storedDraft]);

  useEffect(() => {
    if (!enabled || !hydrated || !dirty) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(makeAdminDocument(draft)));
    } catch {
      // The draft remains available in memory when storage is blocked.
    }
  }, [dirty, draft, enabled, hydrated]);

  const setCategory = useCallback((id: string, category: string, item: CatalogItem) => {
    setDirty(true);
    setDraft((current) => {
      const next = { ...current };
      if (category === automaticCategory(item)) delete next[id];
      else next[id] = { category };
      return next;
    });
    setState("ready");
    setMessage("Изменение добавлено в локальный черновик.");
  }, []);

  const reset = useCallback((id: string) => {
    setDirty(true);
    setDraft((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setState("ready");
    setMessage("Предмет возвращён в автоматическую категорию и удалён из overrides.");
  }, []);

  const setManyCategories = useCallback((ids: Iterable<string>, category: string) => {
    if (!catalog) return;
    setDirty(true);
    setDraft((current) => {
      const next = { ...current };
      for (const id of ids) {
        const item = catalog.items[id];
        if (!item) continue;
        if (category === automaticCategory(item)) delete next[id];
        else next[id] = { category };
      }
      return next;
    });
    setState("ready");
    setMessage("Категория применена к выбранной группе.");
  }, [catalog]);

  const resetMany = useCallback((ids: Iterable<string>) => {
    setDirty(true);
    setDraft((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
    setState("ready");
    setMessage("Выбранные предметы удалены из overrides.");
  }, []);

  const save = useCallback(async () => {
    if (!password) {
      setState("error");
      setMessage("Введите пароль администратора перед перезаписью overrides.");
      return false;
    }
    setState("saving");
    setMessage("Перезаписываю catalog-overrides.json…");
    try {
      const result = await saveAdminOverrides(draft, sha, password);
      setSha(result.sha);
      setDirty(false);
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // A successful remote save must not be reported as failed because storage is blocked.
      }
      setState("saved");
      setMessage(result.created ? "Overrides созданы в GitHub." : "Overrides полностью перезаписаны в GitHub.");
      return true;
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить overrides.");
      return false;
    }
  }, [draft, password, sha]);

  const download = useCallback(() => {
    const blob = new Blob([`${JSON.stringify(makeAdminDocument(draft), null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "catalog-overrides.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [draft]);

  return useMemo(() => ({
    draft, password, setPassword, state, message, hydrated,
    setCategory, reset, setManyCategories, resetMany, save, download,
  }), [draft, password, state, message, hydrated, setCategory, reset, setManyCategories, resetMany, save, download]);
}

function readLocalDraft(): AdminOverrides | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const document = JSON.parse(raw) as AdminOverridesDocument;
    return normalizeAdminDocument(document);
  } catch {
    return null;
  }
}

function overridesFromCatalog(catalog: Catalog): AdminOverrides {
  const result: AdminOverrides = {};
  for (const id of catalog.overrides?.appliedItemIds ?? []) {
    const item = catalog.items[id];
    if (item?.category) result[id] = { category: item.category };
  }
  return result;
}
