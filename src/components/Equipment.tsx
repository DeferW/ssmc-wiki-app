import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { makeAdminDocument, normalizeApiDocument, readAdminDraft, readApiError } from "../adminApi";
import { ADMIN_API_URL, ADMIN_DRAFT_KEY, CATEGORY_ORDER } from "../constants";
import { capitalizeName, categoryIndex, descriptionText, isMap, itemCompatibleWith, normalize } from "../format";
import type { AdminDraft, AdminOverride, AdminSyncState, CatalogItem } from "../types";
import { useCatalog } from "../useCatalog";
import { ItemDrawer } from "./ItemDrawer";
import { Sprite } from "./Sprite";

export function Equipment({ adminMode = false }: { adminMode?: boolean }) {
  const { catalog, loadState } = useCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<AdminDraft>(() => readAdminDraft());
  const [selectedAdminIds, setSelectedAdminIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState<string>(CATEGORY_ORDER[0]);
  const [adminPassword, setAdminPassword] = useState("");
  const [remoteSha, setRemoteSha] = useState<string | null>(null);
  const [adminSyncState, setAdminSyncState] = useState<AdminSyncState>(adminMode ? "loading" : "ready");
  const [adminSyncMessage, setAdminSyncMessage] = useState(adminMode ? "Загружаю сохранённые изменения…" : "");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const resultsTop = useRef<HTMLDivElement>(null);

  const query = searchParams.get("q") || "";
  const selectedCategories = searchParams.getAll("category");
  const selectedSlots = searchParams.getAll("slot");
  const compatibleWeapon = searchParams.get("weapon") || "";
  const sort = searchParams.get("sort") || "name";
  const showHidden = searchParams.get("hidden") === "1";
  const selectedId = searchParams.get("item");
  const changes = Object.entries(draft).filter(([, value]) => value.category || value.hidden !== undefined);

  useEffect(() => {
    if (!adminMode) return;
    const controller = new AbortController();
    const localDraft = readAdminDraft();
    const hasLocalDraft = Object.keys(localDraft).length > 0;

    fetch(ADMIN_API_URL, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || !isMap(result) || result.ok !== true) {
          throw new Error(readApiError(result, `HTTP ${response.status}`));
        }
        const remoteDraft = normalizeApiDocument(result.overrides);
        setRemoteSha(typeof result.sha === "string" ? result.sha : null);
        if (hasLocalDraft) {
          setDraft(localDraft);
          setAdminSyncMessage("Восстановлен локальный черновик. Сохранённая версия с GitHub загружена для проверки конфликта.");
        } else {
          setDraft(remoteDraft);
          setAdminSyncMessage(result.exists === true ? "Сохранённые изменения загружены из GitHub." : "Файл изменений ещё не создан. Первое сохранение создаст его.");
        }
        setAdminSyncState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAdminSyncState("error");
        setAdminSyncMessage(error instanceof Error ? `Не удалось загрузить изменения: ${error.message}` : "Не удалось загрузить изменения.");
      });

    return () => controller.abort();
  }, [adminMode]);

  useEffect(() => {
    if (!adminMode || typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(draft));
  }, [adminMode, draft]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 620);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function changeOverride(id: string, patch: AdminOverride) {
    setDraft((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function resetOverride(id: string) {
    setDraft((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function toggleAdminSelection(id: string) {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkOverride(patch: AdminOverride) {
    if (!selectedAdminIds.size) return;
    const affectedCount = selectedAdminIds.size;
    setDraft((current) => {
      const next = { ...current };
      for (const id of selectedAdminIds) next[id] = { ...next[id], ...patch };
      return next;
    });
    setSelectedAdminIds(new Set());
    setAdminSyncState("ready");
    setAdminSyncMessage(`Действие добавлено в черновик для ${affectedCount} предметов. Можно выбрать следующую группу.`);
  }

  function resetSelectedOverrides() {
    if (!selectedAdminIds.size) return;
    const affectedCount = selectedAdminIds.size;
    setDraft((current) => {
      const next = { ...current };
      for (const id of selectedAdminIds) delete next[id];
      return next;
    });
    setSelectedAdminIds(new Set());
    setAdminSyncState("ready");
    setAdminSyncMessage(`Изменения сброшены для ${affectedCount} предметов. Выбор очищен.`);
  }

  function exportOverrides() {
    const items = Object.fromEntries(changes);
    const blob = new Blob(
      [`${JSON.stringify({ schemaVersion: 1, items }, null, 2)}\n`],
      { type: "application/json;charset=utf-8" },
    );
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "equipment-overrides.json";
    link.click();
    URL.revokeObjectURL(href);
  }

  async function saveOverrides() {
    if (!adminPassword) {
      setAdminSyncState("error");
      setAdminSyncMessage("Введите пароль администратора.");
      return;
    }

    setAdminSyncState("saving");
    setAdminSyncMessage("Сохраняю изменения в GitHub…");

    try {
      const response = await fetch(ADMIN_API_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Password": adminPassword,
        },
        body: JSON.stringify({
          sha: remoteSha,
          overrides: makeAdminDocument(Object.fromEntries(changes)),
        }),
      });
      const result: unknown = await response.json();

      if (!response.ok || !isMap(result) || result.ok !== true) {
        if (response.status === 401) throw new Error("Неверный пароль администратора.");
        if (response.status === 409 || (isMap(result) && result.code === "SHA_CONFLICT")) {
          throw new Error("Файл уже изменился после загрузки страницы. Обновите страницу, проверьте изменения и повторите сохранение.");
        }
        throw new Error(readApiError(result, `HTTP ${response.status}`));
      }

      setRemoteSha(typeof result.sha === "string" ? result.sha : null);
      window.localStorage.removeItem(ADMIN_DRAFT_KEY);
      setAdminSyncState("saved");
      setAdminSyncMessage(result.created === true ? "Файл изменений создан в GitHub." : "Изменения сохранены в GitHub.");
    } catch (error: unknown) {
      setAdminSyncState("error");
      setAdminSyncMessage(error instanceof Error ? error.message : "Не удалось сохранить изменения.");
    }
  }

  const publicIds = useMemo(() => catalog?.publicCatalog.itemIds || [], [catalog]);

  const categories = useMemo(() => {
    if (!catalog) return [];
    const fromCatalog = Object.keys(catalog.publicCatalog.categories || {});
    return CATEGORY_ORDER.filter((name) => fromCatalog.includes(name));
  }, [catalog]);

  const attachmentSlots = useMemo(() => {
    if (!catalog) return [];
    return [...new Set(publicIds.flatMap((id) =>
      (catalog.items[id]?.attachableTo || []).map((slot) => slot.slotName || slot.name || ""),
    ).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  }, [catalog, publicIds]);

  const compatibleWeapons = useMemo(() => {
    if (!catalog) return [];
    const ids = new Set<string>();
    for (const id of publicIds) {
      const item = catalog.items[id];
      for (const weaponId of item?.compatibleWeaponIds || []) ids.add(weaponId);
      for (const slot of item?.attachableTo || []) {
        for (const weaponId of slot.weaponIds || []) ids.add(weaponId);
      }
    }
    return [...ids]
      .filter((id) => catalog.items[id])
      .sort((a, b) => catalog.items[a].name.localeCompare(catalog.items[b].name, "ru"));
  }, [catalog, publicIds]);

  function patchParams(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    update(next);
    setSearchParams(next, { replace: true });
  }

  function setParam(name: string, value: string | null) {
    patchParams((next) => {
      if (value) next.set(name, value);
      else next.delete(name);
      if (name !== "item") next.delete("item");
    });
  }

  function toggleParam(name: string, value: string) {
    patchParams((next) => {
      const values = new Set(next.getAll(name));
      if (values.has(value)) values.delete(value);
      else values.add(value);
      next.delete(name);
      for (const entry of values) next.append(name, entry);
      next.delete("item");
    });
  }

  function openCategory(category: string) {
    patchParams((next) => {
      next.delete("category");
      next.append("category", category);
      next.delete("item");
    });
    setFiltersOpen(false);
    window.requestAnimationFrame(() => resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function clearFilters() {
    setSearchParams(sort === "name" ? {} : { sort }, { replace: true });
  }

  function effectiveCategory(id: string, item: CatalogItem) {
    return adminMode && draft[id]?.category ? draft[id].category : item.category || "Другое";
  }

  const matchesItem = (id: string, ignoredFacet?: "category" | "slot") => {
    const item = catalog?.items[id];
    if (!item) return false;
    const normalized = normalize(query);
    const matchesQuery = !normalized || [item.name, descriptionText(item.description), id]
      .filter(Boolean)
      .some((value) => normalize(String(value)).includes(normalized));
    const slots = new Set((item.attachableTo || []).map((slot) => slot.slotName || slot.name || ""));
    const matchesCategory = ignoredFacet === "category" || !selectedCategories.length
      || selectedCategories.includes(effectiveCategory(id, item));
    const matchesSlot = ignoredFacet === "slot" || !selectedSlots.length
      || selectedSlots.some((slot) => slots.has(slot));
    const matchesWeapon = !compatibleWeapon || itemCompatibleWith(item, compatibleWeapon);
    const override = draft[id];
    const matchesVisibility = !adminMode || showHidden || override?.hidden !== true;
    return matchesQuery && matchesCategory && matchesSlot && matchesWeapon && matchesVisibility;
  };

  const visibleIds = catalog
    ? publicIds.filter((id) => matchesItem(id)).sort((a, b) => {
      const first = catalog.items[a];
      const second = catalog.items[b];
      if (sort === "category") {
        const order = categoryIndex(effectiveCategory(a, first)) - categoryIndex(effectiveCategory(b, second));
        if (order) return order;
      }
      return first.name.localeCompare(second.name, "ru") || a.localeCompare(b);
    })
    : [];

  const selectedVisibleCount = visibleIds.filter((id) => selectedAdminIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  function toggleAllVisible() {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  const categoryCounts = (() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesItem(id, "category")) continue;
      const item = catalog?.items[id];
      const category = item ? effectiveCategory(id, item) : null;
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  })();

  const slotCounts = (() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesItem(id, "slot")) continue;
      for (const slot of catalog?.items[id]?.attachableTo || []) {
        const name = slot.slotName || slot.name;
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      }
    }
    return counts;
  })();

  const activeFilters = [
    ...selectedCategories.map((value) => ({ key: `category:${value}`, label: value, clear: () => toggleParam("category", value) })),
    ...selectedSlots.map((value) => ({ key: `slot:${value}`, label: `Обвес: ${value}`, clear: () => toggleParam("slot", value) })),
    ...(compatibleWeapon && catalog?.items[compatibleWeapon]
      ? [{ key: "weapon", label: `Для: ${catalog.items[compatibleWeapon].name}`, clear: () => setParam("weapon", null) }]
      : []),
    ...(adminMode && showHidden
      ? [{ key: "hidden", label: "Показаны скрытые", clear: () => setParam("hidden", null) }]
      : []),
  ];

  const selectedItem = selectedId && catalog ? catalog.items[selectedId] : null;

  useEffect(() => {
    if (!filtersOpen && !selectedId) return;
    const previousOverflow = document.body.style.overflow;
    if (filtersOpen) document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filtersOpen) setFiltersOpen(false);
      else if (selectedId) {
        const next = new URLSearchParams(searchParams);
        next.delete("item");
        setSearchParams(next, { replace: true });
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId, filtersOpen, searchParams, setSearchParams]);

  return (
    <main className="page catalog-page">
      <div className="page-heading catalog-heading">
        <div>
          <p className="eyebrow">{adminMode ? "Режим администратора" : "Арсенал морпехов"}</p>
          <h1>{adminMode ? "Управление снаряжением" : "Каталог снаряжения"}</h1>
          <p>{adminMode
            ? "Тот же каталог, но с быстрым изменением категории и видимости прямо на карточках."
            : "Один поиск, понятные разделы и характеристики без похода в исходный YAML."}</p>
        </div>
        <Link className="button-link admin-entry" to={adminMode ? "/equipment" : "/equipment/admin"}>
          {adminMode ? "Выйти из админ-режима" : "Админ-режим"}
        </Link>
      </div>

      {adminMode && (
        <div className="admin-toolbar">
          <div className="admin-summary">
            <strong>{changes.length}</strong> изменений · <strong>{selectedAdminIds.size}</strong> выбрано
          </div>
          <button type="button" onClick={toggleAllVisible} disabled={!visibleIds.length}>
            {allVisibleSelected ? "Снять выбор с найденных" : "Выбрать все найденные"}
          </button>
          <button type="button" onClick={() => applyBulkOverride({ hidden: true })} disabled={!selectedAdminIds.size}>Не показывать</button>
          <button type="button" onClick={() => applyBulkOverride({ hidden: false })} disabled={!selectedAdminIds.size}>Показывать</button>
          <label className="bulk-category">
            <span>Перенести в</span>
            <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
              {CATEGORY_ORDER.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => applyBulkOverride({ category: bulkCategory })} disabled={!selectedAdminIds.size}>Применить</button>
          <button type="button" onClick={resetSelectedOverrides} disabled={!selectedAdminIds.size}>Сбросить выбранные</button>
          <label className="admin-password">
            <span>Пароль администратора</span>
            <input
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Введите перед сохранением"
              autoComplete="current-password"
            />
          </label>
          <button
            type="button"
            className="admin-save"
            onClick={saveOverrides}
            disabled={adminSyncState === "loading" || adminSyncState === "saving"}
          >
            {adminSyncState === "saving" ? "Сохраняю…" : "Сохранить в GitHub"}
          </button>
          <button type="button" className="admin-export" onClick={exportOverrides}>Скачать JSON</button>
          <p className={`admin-sync-status is-${adminSyncState}`} role="status">{adminSyncMessage}</p>
          <small>Пароль хранится только в памяти этой вкладки. Локальный черновик остаётся страховкой до успешного сохранения.</small>
        </div>
      )}

      <label className="catalog-search">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <span className="sr-only">Поиск по каталогу</span>
        <input
          type="search"
          placeholder="Поиск по названию, описанию или ID…"
          value={query}
          onChange={(event) => setParam("q", event.target.value || null)}
          autoComplete="off"
        />
        {query && <button type="button" onClick={() => setParam("q", null)} aria-label="Очистить поиск">×</button>}
      </label>

      {loadState === "loading" && <p className="notice">Загружаю актуальный каталог…</p>}
      {loadState === "error" && <p className="notice warning">Не удалось загрузить каталог. Попробуйте обновить страницу чуть позже.</p>}

      {catalog && (
        <div className="catalog-layout" ref={resultsTop}>
          {filtersOpen && <button className="filter-backdrop" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} />}
          <aside className={`filter-sidebar${filtersOpen ? " is-open" : ""}`} aria-label="Фильтры каталога">
            <div className="filter-sidebar-heading">
              <div>
                <strong>Разделы</strong>
                <small>Строка открывает раздел, квадрат добавляет его к выбору</small>
              </div>
              <button className="filter-close" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры">×</button>
            </div>

            <div className="category-options">
              {categories.map((name) => {
                const checked = selectedCategories.includes(name);
                const count = categoryCounts.get(name) || 0;
                return (
                  <div className={`category-row${checked ? " is-selected" : ""}`} key={name}>
                    <label className="category-check" title={`Добавить раздел «${name}» к выбору`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && !count}
                        onChange={() => toggleParam("category", name)}
                      />
                      <span aria-hidden="true" />
                    </label>
                    <button type="button" onClick={() => openCategory(name)} disabled={!count && !checked}>
                      <span>{name}</span>
                      <small>{count}</small>
                    </button>
                  </div>
                );
              })}
            </div>

            {adminMode && (
              <label className="check-option admin-visibility-filter">
                <input type="checkbox" checked={showHidden} onChange={(event) => setParam("hidden", event.target.checked ? "1" : null)} />
                <span>Показать скрытые</span>
              </label>
            )}

            {attachmentSlots.length > 0 && (
              <details className="filter-disclosure">
                <summary>Место установки обвеса</summary>
                <div className="filter-options compact-options">
                  {attachmentSlots.map((slot) => (
                    <label className="check-option" key={slot}>
                      <input
                        type="checkbox"
                        checked={selectedSlots.includes(slot)}
                        disabled={!selectedSlots.includes(slot) && !slotCounts.get(slot)}
                        onChange={() => toggleParam("slot", slot)}
                      />
                      <span>{slot}</span>
                      <small>{slotCounts.get(slot) || 0}</small>
                    </label>
                  ))}
                </div>
              </details>
            )}

            {compatibleWeapons.length > 0 && (
              <label className="filter-select">
                <span>Совместимо с оружием</span>
                <select value={compatibleWeapon} onChange={(event) => setParam("weapon", event.target.value || null)}>
                  <option value="">Любое оружие</option>
                  {compatibleWeapons.map((id) => <option value={id} key={id}>{catalog.items[id].name}</option>)}
                </select>
              </label>
            )}

            <button className="reset-filters" onClick={clearFilters} disabled={!query && !activeFilters.length}>Сбросить выбор</button>
          </aside>

          <div className="catalog-results">
            <div className="results-toolbar">
              <div>
                <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>
                  Разделы{activeFilters.length ? ` · ${activeFilters.length}` : ""}
                </button>
                <span className="results-line">Показано <strong>{visibleIds.length}</strong> из {publicIds.length}</span>
              </div>
              <label className="sort-control">
                <span>Сортировка</span>
                <select value={sort} onChange={(event) => setParam("sort", event.target.value)}>
                  <option value="name">По названию</option>
                  <option value="category">По разделам</option>
                </select>
              </label>
            </div>

            {activeFilters.length > 0 && (
              <div className="active-filters" aria-label="Активные фильтры">
                {activeFilters.map((filter) => (
                  <button key={filter.key} onClick={filter.clear}>{filter.label}<span aria-hidden="true">×</span></button>
                ))}
                <button className="clear-filter-chip" onClick={clearFilters}>Очистить всё</button>
              </div>
            )}

            <section className={`equipment-grid${adminMode ? " admin-grid" : ""}`} aria-live="polite">
                {visibleIds.map((id) => {
                  const item = catalog.items[id];
                  const isSelected = selectedItem?.id === id;
                  const override = draft[id];
                  const adminSelected = selectedAdminIds.has(id);
                  const hidden = override?.hidden === true;
                  return (
                    <article className={`equipment-card${isSelected ? " is-selected" : ""}${override ? " is-edited" : ""}${hidden ? " is-hidden" : ""}${adminSelected ? " is-admin-selected" : ""}`} key={id}>
                      {adminMode && (
                        <label className="admin-card-select" title="Добавить предмет в массовый выбор">
                          <input type="checkbox" checked={adminSelected} onChange={() => toggleAdminSelection(id)} />
                          <span aria-hidden="true" />
                        </label>
                      )}
                      <button className="equipment-card-main" onClick={() => setParam("item", id)} aria-haspopup="dialog">
                        <span className="equipment-section">{effectiveCategory(id, item)}</span>
                        <Sprite item={item} />
                        <strong>{capitalizeName(item.name)}</strong>
                        <small className="equipment-id">{item.id}</small>
                      </button>
                      {adminMode && (
                        <div className="card-admin-controls">
                          <label>
                            <span>Категория</span>
                            <select
                              value={effectiveCategory(id, item)}
                              onChange={(event) => changeOverride(id, { category: event.target.value })}
                            >
                              {CATEGORY_ORDER.map((category) => <option key={category}>{category}</option>)}
                            </select>
                          </label>
                          <button
                            type="button"
                            className={hidden ? "is-hidden" : ""}
                            onClick={() => changeOverride(id, { hidden: !hidden })}
                          >
                            {hidden ? "Показывать" : "Не показывать"}
                          </button>
                          <button type="button" onClick={() => resetOverride(id)} disabled={!override}>Сбросить</button>
                        </div>
                      )}
                    </article>
                  );
                })}
            </section>
            {!visibleIds.length && <p className="empty-state">Ничего не найдено. Даже подозрительного ящика.</p>}
          </div>
        </div>
      )}

      {selectedItem && catalog && (
        <ItemDrawer
          item={selectedItem}
          catalog={catalog}
          onClose={() => setParam("item", null)}
          onSelect={(id) => setParam("item", id)}
        />
      )}
      {showBackToTop && (
        <button className="back-to-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          ↑ К поиску
        </button>
      )}
    </main>
  );
}

export function AdminEquipment() {
  return <Equipment adminMode />;
}
