import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { automaticCategory, useAdminOverrides } from "../../admin/equipment/useAdminOverrides";
import { CATEGORY_ORDER, HIDDEN_CATEGORY } from "./config";
import { useCatalog } from "./catalogStore";
import { capitalizeName, categoryIndex, isCatalogItemVisible, itemMatches } from "./format";
import { usePanelSettings } from "./usePanelSettings";
import { CatalogSettings } from "./components/CatalogSettings";
import { DetailsPanel } from "./components/DetailsPanel";
import { FilterPanel } from "./components/FilterPanel";
import { ItemSprite } from "./components/ItemSprite";

export function EquipmentPage({ adminMode = false }: { adminMode?: boolean }) {
  const { catalog, error, loading, retry } = useCatalog();
  const admin = useAdminOverrides(adminMode, catalog);
  const { panelPosition, setPanelPosition } = usePanelSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedAdminIds, setSelectedAdminIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState<string>(CATEGORY_ORDER[0]);

  const query = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(query);
  const selectedCategories = searchParams.getAll("category");
  const selectedId = searchParams.get("item");
  const sort = searchParams.get("sort") === "category" ? "category" : "name";

  const setParams = useCallback((mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const setQuery = (value: string) => {
    setParams((next) => {
      if (value) next.set("q", value); else next.delete("q");
      next.delete("item");
    });
  };

  const toggleCategory = (category: string) => {
    setParams((next) => {
      const values = new Set(next.getAll("category"));
      if (values.has(category)) values.delete(category); else values.add(category);
      next.delete("category");
      for (const value of CATEGORY_ORDER) if (values.has(value)) next.append("category", value);
      next.delete("item");
    });
  };

  const openCategory = (category: string) => {
    setParams((next) => {
      next.delete("category");
      next.append("category", category);
      next.delete("item");
    });
    setFiltersOpen(false);
  };

  const clearCategories = () => {
    setParams((next) => {
      next.delete("category");
      next.delete("item");
    });
  };

  const closeItem = useCallback(() => setParams((next) => next.delete("item")), [setParams]);
  const selectItem = useCallback((id: string) => setParams((next) => next.set("item", id)), [setParams]);

  const allIds = useMemo(() => catalog?.publicCatalog.itemIds ?? [], [catalog]);

  const effectiveCategory = useCallback((id: string) => {
    const item = catalog?.items[id];
    return adminMode && admin.draft[id]?.category
      ? admin.draft[id].category
      : item?.category ?? "Другое";
  }, [admin.draft, adminMode, catalog]);

  const publicIds = useMemo(() => {
    if (!catalog) return [];
    return allIds.filter((id) => isCatalogItemVisible(effectiveCategory(id), adminMode));
  }, [adminMode, allIds, catalog, effectiveCategory]);

  const categories = useMemo(() => catalog ? Object.keys(catalog.publicCatalog.categories) : [], [catalog]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!catalog) return counts;
    for (const id of publicIds) {
      const item = catalog.items[id];
      if (!itemMatches(item, deferredQuery)) continue;
      const category = effectiveCategory(id);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [catalog, publicIds, deferredQuery, effectiveCategory]);

  const filteredIds = useMemo(() => {
    if (!catalog) return [];
    return publicIds
      .filter((id) => {
        const item = catalog.items[id];
        return itemMatches(item, deferredQuery)
          && (!selectedCategories.length || selectedCategories.includes(effectiveCategory(id)));
      })
      .sort((firstId, secondId) => {
        const first = catalog.items[firstId];
        const second = catalog.items[secondId];
        if (sort === "category") {
          const categoryOrder = categoryIndex(effectiveCategory(firstId)) - categoryIndex(effectiveCategory(secondId));
          if (categoryOrder) return categoryOrder;
        }
        return first.name.localeCompare(second.name, "ru") || firstId.localeCompare(secondId);
      });
  }, [catalog, deferredQuery, publicIds, selectedCategories, sort, effectiveCategory]);

  const selectedItem = selectedId && catalog && catalog.items[selectedId]
    ? catalog.items[selectedId]
    : null;
  const displayedSelectedItem = selectedItem && adminMode
    ? { ...selectedItem, category: effectiveCategory(selectedItem.id) }
    : selectedItem;
  const appliedOverrides = useMemo(() => new Set(catalog?.overrides?.appliedItemIds ?? []), [catalog]);
  const selectedVisibleCount = filteredIds.filter((id) => selectedAdminIds.has(id)).length;
  const allVisibleSelected = filteredIds.length > 0 && selectedVisibleCount === filteredIds.length;

  const toggleAdminSelection = (id: string) => {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedAdminIds((current) => {
      const next = new Set(current);
      for (const id of filteredIds) {
        if (allVisibleSelected) next.delete(id); else next.add(id);
      }
      return next;
    });
  };

  const applyBulkCategory = () => {
    admin.setManyCategories(selectedAdminIds, bulkCategory);
    setSelectedAdminIds(new Set());
  };

  const resetSelectedOverrides = () => {
    admin.resetMany(selectedAdminIds);
    setSelectedAdminIds(new Set());
  };

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">{adminMode ? "USCM // ADMIN DRAFT" : "USCM // EQUIPMENT DATABASE"}</p>
          <h1>{adminMode ? "Редактор каталога" : "Каталог снаряжения"}</h1>
          <p>{adminMode
            ? "Публичный черновик категорий. Запись в GitHub доступна только по паролю."
            : "Полевые характеристики, состав комплектов, совместимость и источники получения."}</p>
          <Link className="admin-mode-link" to={adminMode ? "/equipment" : "/equipment/admin"}>
            {adminMode ? "Обычный каталог" : "Admin-режим"}
          </Link>
        </div>
        <div className="catalog-meta">
          <span>STATUS</span><strong>{loading ? "SYNC" : error ? "ERROR" : "ONLINE"}</strong>
          {catalog && <small>BUILD {catalog.gameCommit.slice(0, 8).toUpperCase()}</small>}
        </div>
      </section>

      <div className="catalog-controls">
        <label className="catalog-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Поиск по каталогу</span>
          <input
            id="catalog-search-input"
            type="text"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, описанию или ID…"
            autoComplete="off"
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">×</button>}
        </label>
        <CatalogSettings position={panelPosition} onPositionChange={setPanelPosition} />
      </div>

      {adminMode && (
        <section className="admin-toolbar" aria-label="Управление overrides">
          <header>
            <div><span>OVERRIDE WORKSPACE</span><strong>{Object.keys(admin.draft).length} изменений · {selectedAdminIds.size} выбрано</strong></div>
            <button type="button" onClick={toggleAllVisible} disabled={!admin.hydrated || !filteredIds.length}>
              {allVisibleSelected ? "Снять выбор" : "Выбрать найденные"}
            </button>
          </header>
          <div className="admin-actions">
            <label className="bulk-category">
              <span>Категория группы</span>
              <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
                {CATEGORY_ORDER.map((category) => <option value={category} key={category}>{category}</option>)}
              </select>
            </label>
            <button type="button" onClick={applyBulkCategory} disabled={!admin.hydrated || !selectedAdminIds.size}>Применить</button>
            <button type="button" onClick={resetSelectedOverrides} disabled={!admin.hydrated || !selectedAdminIds.size}>Вернуть автоматически</button>
            <label className="admin-password">
              <span>Пароль администратора</span>
              <input
                type="password"
                value={admin.password}
                onChange={(event) => admin.setPassword(event.target.value)}
                placeholder="Нужен только для записи"
                autoComplete="current-password"
              />
            </label>
            <button className="admin-save" type="button" onClick={() => void admin.save()} disabled={!admin.hydrated || admin.state === "saving"}>
              {admin.state === "saving" ? "Перезапись…" : "Перезаписать overrides"}
            </button>
            <button type="button" onClick={admin.download}>Скачать JSON</button>
          </div>
          <p className={`admin-status is-${admin.state}`} role="status">{admin.message}</p>
          <small>Пароль хранится только в памяти вкладки. Все действия до ввода пароля остаются локальным черновиком.</small>
        </section>
      )}

      {loading && !catalog && <StatusPanel title="Синхронизация" text="Загружаю актуальный каталог снаряжения…" />}
      {error && !catalog && <StatusPanel title="Ошибка загрузки" text={error} action={retry} />}

      {catalog && (
        <div className="catalog-layout">
          <FilterPanel
            categories={categories}
            counts={categoryCounts}
            selected={selectedCategories}
            open={filtersOpen}
            includeHidden={adminMode}
            onSelect={toggleCategory}
            onOpen={openCategory}
            onClose={() => setFiltersOpen(false)}
            onReset={clearCategories}
          />

          <section className="catalog-results">
            <div className="results-toolbar">
              <div>
                <button className="mobile-filter-button" type="button" onClick={() => setFiltersOpen(true)}>
                  Разделы{selectedCategories.length ? ` · ${selectedCategories.length}` : ""}
                </button>
                <span>Найдено <strong>{filteredIds.length}</strong> из {publicIds.length}</span>
              </div>
              <label>
                <span>Сортировка</span>
                <select value={sort} onChange={(event) => {
                  setParams((next) => {
                    if (event.target.value === "category") next.set("sort", "category"); else next.delete("sort");
                    next.delete("item");
                  });
                }}>
                  <option value="name">По названию</option>
                  <option value="category">По разделам</option>
                </select>
              </label>
            </div>

            {selectedCategories.length > 0 && (
              <div className="active-filters">
                {selectedCategories.map((category) => (
                  <button type="button" key={category} onClick={() => toggleCategory(category)}>{category}<span>×</span></button>
                ))}
                <button type="button" className="clear-chip" onClick={clearCategories}>Очистить</button>
              </div>
            )}

            <div className="equipment-grid" aria-live="polite">
              {filteredIds.map((id) => {
                const item = catalog.items[id];
                const category = effectiveCategory(id);
                const adminSelected = selectedAdminIds.has(id);
                const hasOverride = adminMode ? Boolean(admin.draft[id]) : item.edited || appliedOverrides.has(id);
                return (
                  <article className={`equipment-card${selectedId === id ? " is-selected" : ""}${adminMode ? " is-admin" : ""}${adminSelected ? " is-admin-selected" : ""}${category === HIDDEN_CATEGORY ? " is-hidden" : ""}`} key={id}>
                    {adminMode && (
                      <label className="admin-card-select" title="Добавить предмет в групповой выбор">
                        <input type="checkbox" checked={adminSelected} onChange={() => toggleAdminSelection(id)} />
                        <span className="sr-only">Выбрать {item.name}</span>
                      </label>
                    )}
                    <button className="equipment-card-main" type="button" onClick={() => selectItem(id)} aria-haspopup="dialog">
                      <span className="equipment-card-top">
                        <span>{category}</span>
                        {hasOverride && <i title="Предмет присутствует в overrides">EDITED</i>}
                      </span>
                      <ItemSprite item={item} />
                      <strong>{capitalizeName(item.name)}</strong>
                      <small>{item.id}</small>
                    </button>
                    {adminMode && (
                      <div className="card-admin-controls">
                        <label>
                          <span>Назначить раздел</span>
                          <select
                            value={category}
                            disabled={!admin.hydrated}
                            onChange={(event) => admin.setCategory(id, event.target.value, item)}
                          >
                            {CATEGORY_ORDER.map((value) => <option value={value} key={value}>{value}</option>)}
                          </select>
                        </label>
                        <button type="button" disabled={!admin.hydrated || !admin.draft[id]} onClick={() => admin.reset(id)}>
                          Вернуть автоматически · {automaticCategory(item)}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {!filteredIds.length && <div className="empty-state">Совпадений не найдено.</div>}
          </section>
        </div>
      )}

      {displayedSelectedItem && catalog && (
        <DetailsPanel
          item={displayedSelectedItem}
          catalog={catalog}
          position={panelPosition}
          onClose={closeItem}
          onSelect={selectItem}
        />
      )}
    </main>
  );
}

function StatusPanel({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return (
    <div className="status-panel" role="status">
      <span>DATABASE MESSAGE</span><strong>{title}</strong><p>{text}</p>
      {action && <button type="button" onClick={action}>Повторить</button>}
    </div>
  );
}
