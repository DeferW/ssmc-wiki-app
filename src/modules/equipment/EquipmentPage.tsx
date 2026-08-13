import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CATEGORY_ORDER, HIDDEN_CATEGORY } from "./config";
import { useCatalog } from "./catalogStore";
import { capitalizeName, categoryIndex, itemMatches } from "./format";
import { usePanelSettings } from "./usePanelSettings";
import { CatalogSettings } from "./components/CatalogSettings";
import { DetailsPanel } from "./components/DetailsPanel";
import { FilterPanel } from "./components/FilterPanel";
import { ItemSprite } from "./components/ItemSprite";

export function EquipmentPage() {
  const { catalog, error, loading, retry } = useCatalog();
  const { panelPosition, setPanelPosition } = usePanelSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const publicIds = useMemo(() => {
    if (!catalog) return [];
    return catalog.publicCatalog.itemIds.filter((id) => catalog.items[id]?.category !== HIDDEN_CATEGORY);
  }, [catalog]);

  const categories = useMemo(() => catalog ? Object.keys(catalog.publicCatalog.categories) : [], [catalog]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!catalog) return counts;
    for (const id of publicIds) {
      const item = catalog.items[id];
      if (!itemMatches(item, deferredQuery)) continue;
      const category = item.category ?? "Другое";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [catalog, publicIds, deferredQuery]);

  const filteredIds = useMemo(() => {
    if (!catalog) return [];
    return publicIds
      .filter((id) => {
        const item = catalog.items[id];
        return itemMatches(item, deferredQuery)
          && (!selectedCategories.length || selectedCategories.includes(item.category ?? "Другое"));
      })
      .sort((firstId, secondId) => {
        const first = catalog.items[firstId];
        const second = catalog.items[secondId];
        if (sort === "category") {
          const categoryOrder = categoryIndex(first.category) - categoryIndex(second.category);
          if (categoryOrder) return categoryOrder;
        }
        return first.name.localeCompare(second.name, "ru") || firstId.localeCompare(secondId);
      });
  }, [catalog, deferredQuery, publicIds, selectedCategories, sort]);

  const selectedItem = selectedId && catalog && publicIds.includes(selectedId)
    ? catalog.items[selectedId]
    : null;

  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">USCM // EQUIPMENT DATABASE</p>
          <h1>Каталог снаряжения</h1>
          <p>Полевые характеристики, состав комплектов, совместимость и источники получения.</p>
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

      {loading && !catalog && <StatusPanel title="Синхронизация" text="Загружаю актуальный каталог снаряжения…" />}
      {error && !catalog && <StatusPanel title="Ошибка загрузки" text={error} action={retry} />}

      {catalog && (
        <div className="catalog-layout">
          <FilterPanel
            categories={categories}
            counts={categoryCounts}
            selected={selectedCategories}
            open={filtersOpen}
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
                return (
                  <article className={`equipment-card${selectedId === id ? " is-selected" : ""}`} key={id}>
                    <button type="button" onClick={() => selectItem(id)} aria-haspopup="dialog">
                      <span className="equipment-card-top">
                        <span>{item.category ?? "Другое"}</span>
                        {item.edited && <i title="Категория изменена вручную">EDIT</i>}
                      </span>
                      <ItemSprite item={item} />
                      <strong>{capitalizeName(item.name)}</strong>
                      <small>{item.id}</small>
                    </button>
                  </article>
                );
              })}
            </div>

            {!filteredIds.length && <div className="empty-state">Совпадений не найдено.</div>}
          </section>
        </div>
      )}

      {selectedItem && catalog && (
        <DetailsPanel
          item={selectedItem}
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
