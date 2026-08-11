import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from "react-router-dom";

const DATA_ROOT =
  "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/";
const DATA_URL = `${DATA_ROOT}equipment-catalog.json`;

type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  image?: string;
  types?: string[];
  tags?: string[];
  componentTypes?: string[];
  properties?: Record<string, unknown>;
  attachmentSlots?: Array<{
    id: string;
    name: string;
    compatibleItemIds: string[];
    installedItemIds?: string[];
  }>;
  attachableTo?: Array<{
    slotId: string;
    slotName: string;
    weaponIds: string[];
  }>;
  magazineSlots?: Array<{
    id: string;
    name: string;
    compatibleItemIds: string[];
    loadedItemIds?: string[];
  }>;
  compatibleWeaponIds?: string[];
  loadoutVariants?: Array<{
    prototypeId: string;
    contentItemIds: string[];
  }>;
};

type Relation = {
  from: string;
  to: string;
  type: string;
  quantity?: number;
};

type PublicCatalog = {
  itemIds: string[];
  categories: Record<string, string[]>;
  unwrappedCaseIds: string[];
};

type Catalog = {
  gameCommit: string;
  items: Record<string, CatalogItem>;
  relations: Relation[];
  publicCatalog?: PublicCatalog;
  tradeEntries?: Array<{ itemId: string }>;
};

const modules = [
  {
    slug: "equipment",
    title: "Снаряжение",
    text: "Оружие, боеприпасы, обвесы и другое доступное снаряжение морпехов.",
    status: "Работает",
  },
  {
    slug: "weapon-builder",
    title: "Конструктор оружия",
    text: "Выбор оружия, совместимых обвесов и итоговых характеристик сборки.",
    status: "Следующий этап",
  },
  {
    slug: "damage",
    title: "Калькулятор урона",
    text: "Урон на выбранной дистанции с falloff, бронёй и бронепробитием.",
    status: "Запланировано",
  },
  {
    slug: "compare",
    title: "Сравнение",
    text: "Два или несколько предметов рядом, без прыжков между вкладками вики.",
    status: "Запланировано",
  },
  {
    slug: "loadout",
    title: "Комплект бойца",
    text: "Оружие, броня, пояс, подсумки и расходники в одной сохраняемой сборке.",
    status: "Идея",
  },
  {
    slug: "chemistry",
    title: "Химический планировщик",
    text: "Расчёт реагентов и пошаговый маршрут приготовления по уже собранным данным.",
    status: "Идея",
  },
];

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">SSMC Wiki App</Link>
        <nav aria-label="Основная навигация">
          <NavLink to="/" end>Главная</NavLink>
          <NavLink to="/equipment">Снаряжение</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/tool/:slug" element={<ToolPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function Home() {
  return (
    <main className="page">
      <section className="intro">
        <p className="eyebrow">Инструменты Space Stories: Marine Corps</p>
        <h1>Выберите раздел</h1>
        <p>
          Отдельное приложение для тех вещей, которым тесно внутри MediaWiki:
          каталогов, расчётов, сравнений и конструкторов.
        </p>
      </section>

      <section className="module-grid" aria-label="Разделы приложения">
        {modules.map((module) => {
          const href = module.slug === "equipment" ? "/equipment" : `/tool/${module.slug}`;
          return (
            <Link className="module-card" to={href} key={module.slug}>
              <span className="status">{module.status}</span>
              <h2>{module.title}</h2>
              <p>{module.text}</p>
              <span className="card-link">Открыть →</span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function Equipment() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "live" | "error">("loading");
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = searchParams.get("q") || "";
  const selectedCategories = searchParams.getAll("category");
  const selectedSizes = searchParams.getAll("size");
  const selectedSlots = searchParams.getAll("slot");
  const compatibleWeapon = searchParams.get("weapon") || "";
  const contentsOnly = searchParams.get("contents") === "1";
  const describedOnly = searchParams.get("described") === "1";
  const sort = searchParams.get("sort") || "name";
  const selectedId = searchParams.get("item");

  useEffect(() => {
    const controller = new AbortController();
    fetch(DATA_URL, { signal: controller.signal, cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((data) => {
        setCatalog(data);
        setLoadState("live");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const publicIds = useMemo(() => {
    if (!catalog) return [];
    if (catalog.publicCatalog?.itemIds?.length) return catalog.publicCatalog.itemIds;
    const directIds = [...new Set((catalog.tradeEntries || []).map((entry) => entry.itemId))];
    const result = new Set<string>();
    for (const id of directIds) {
      const item = catalog.items[id];
      const isCase = item && /кейс/iu.test(item.name);
      if (!isCase) {
        result.add(id);
        continue;
      }
      for (const relation of catalog.relations) {
        if (relation.from === id && relation.type === "contains") result.add(relation.to);
      }
    }
    return [...result];
  }, [catalog]);

  const categories = useMemo(
    () => [...new Set(publicIds.map((id) => catalog?.items[id]?.category).filter(Boolean) as string[])].sort(),
    [catalog, publicIds],
  );

  const sizes = useMemo(
    () => [...new Set(publicIds.map((id) => itemSize(catalog?.items[id])).filter(Boolean) as string[])]
      .sort((a, b) => sizeOrder(a) - sizeOrder(b) || a.localeCompare(b, "ru")),
    [catalog, publicIds],
  );

  const attachmentSlots = useMemo(
    () => [...new Set(publicIds.flatMap((id) =>
      (catalog?.items[id]?.attachableTo || []).map((slot) => slot.slotName),
    ))].sort((a, b) => a.localeCompare(b, "ru")),
    [catalog, publicIds],
  );

  const compatibleWeapons = useMemo(() => {
    if (!catalog) return [];
    const weaponIds = new Set<string>();
    for (const id of publicIds) {
      const item = catalog.items[id];
      for (const weaponId of item?.compatibleWeaponIds || []) weaponIds.add(weaponId);
      for (const slot of item?.attachableTo || []) {
        for (const weaponId of slot.weaponIds) weaponIds.add(weaponId);
      }
    }
    return [...weaponIds]
      .filter((id) => catalog.items[id])
      .sort((a, b) => catalog.items[a].name.localeCompare(catalog.items[b].name, "ru"));
  }, [catalog, publicIds]);

  const contentContainers = useMemo(() => {
    if (!catalog) return new Set<string>();
    const result = new Set<string>();
    for (const relation of catalog.relations) {
      if (["contains", "slotItem", "bundleItem"].includes(relation.type)) result.add(relation.from);
    }
    for (const id of publicIds) {
      if (catalog.items[id]?.loadoutVariants?.length) result.add(id);
    }
    return result;
  }, [catalog, publicIds]);

  const matchesNonCategoryFilters = (id: string, ignoredFacet?: "size" | "slot") => {
    const item = catalog?.items[id];
    if (!item) return false;
    const normalized = query.trim().toLocaleLowerCase("ru");
    const matchesQuery = !normalized || [item.name, item.description, id]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("ru").includes(normalized));
    const size = itemSize(item);
    const itemSlots = new Set((item.attachableTo || []).map((slot) => slot.slotName));
    const matchesSize = ignoredFacet === "size" || !selectedSizes.length || selectedSizes.includes(size || "");
    const matchesSlot = ignoredFacet === "slot" || !selectedSlots.length || selectedSlots.some((slot) => itemSlots.has(slot));
    const matchesWeapon = !compatibleWeapon || itemCompatibleWith(item, compatibleWeapon);
    const matchesContents = !contentsOnly || contentContainers.has(id);
    const matchesDescription = !describedOnly || Boolean(item.description?.trim());
    return matchesQuery && matchesSize && matchesSlot && matchesWeapon && matchesContents && matchesDescription;
  };

  const visibleIds = useMemo(() => {
    if (!catalog) return [];
    return publicIds
      .filter((id) => {
        const item = catalog.items[id];
        const matchesCategory = !selectedCategories.length || selectedCategories.includes(item.category || "");
        return matchesCategory && matchesNonCategoryFilters(id);
      })
      .sort((a, b) => {
        const first = catalog.items[a];
        const second = catalog.items[b];
        if (sort === "category") {
          const byCategory = (first.category || "").localeCompare(second.category || "", "ru");
          if (byCategory) return byCategory;
        }
        return first.name.localeCompare(second.name, "ru") || a.localeCompare(b);
      });
  }, [catalog, publicIds, query, selectedCategories.join("\u0000"), selectedSizes.join("\u0000"), selectedSlots.join("\u0000"), compatibleWeapon, contentsOnly, describedOnly, sort, contentContainers]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesNonCategoryFilters(id)) continue;
      const name = catalog?.items[id]?.category;
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
  }, [catalog, publicIds, query, selectedSizes.join("\u0000"), selectedSlots.join("\u0000"), compatibleWeapon, contentsOnly, describedOnly, contentContainers]);

  const sizeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesNonCategoryFilters(id, "size")) continue;
      const size = itemSize(catalog?.items[id]);
      if (size) counts.set(size, (counts.get(size) || 0) + 1);
    }
    return counts;
  }, [catalog, publicIds, query, selectedSlots.join("\u0000"), compatibleWeapon, contentsOnly, describedOnly, contentContainers]);

  const slotCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesNonCategoryFilters(id, "slot")) continue;
      for (const slot of catalog?.items[id]?.attachableTo || []) {
        counts.set(slot.slotName, (counts.get(slot.slotName) || 0) + 1);
      }
    }
    return counts;
  }, [catalog, publicIds, query, selectedSizes.join("\u0000"), compatibleWeapon, contentsOnly, describedOnly, contentContainers]);

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
      values.has(value) ? values.delete(value) : values.add(value);
      next.delete(name);
      for (const entry of [...values].sort((a, b) => a.localeCompare(b, "ru"))) next.append(name, entry);
      next.delete("item");
    });
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (sort !== "name") next.set("sort", sort);
    setSearchParams(next, { replace: true });
  }

  const activeFilters = [
    ...selectedCategories.map((value) => ({ key: `category:${value}`, label: value, clear: () => toggleParam("category", value) })),
    ...selectedSizes.map((value) => ({ key: `size:${value}`, label: `Размер: ${sizeLabel(value)}`, clear: () => toggleParam("size", value) })),
    ...selectedSlots.map((value) => ({ key: `slot:${value}`, label: value, clear: () => toggleParam("slot", value) })),
    ...(compatibleWeapon && catalog?.items[compatibleWeapon]
      ? [{ key: "weapon", label: `Для: ${catalog.items[compatibleWeapon].name}`, clear: () => setParam("weapon", null) }]
      : []),
    ...(contentsOnly ? [{ key: "contents", label: "С содержимым", clear: () => setParam("contents", null) }] : []),
    ...(describedOnly ? [{ key: "described", label: "С описанием", clear: () => setParam("described", null) }] : []),
  ];

  const selectedItem = selectedId && catalog ? catalog.items[selectedId] : null;
  const selectedRelations = selectedId && catalog
    ? catalog.relations.filter((relation) =>
      (relation.from === selectedId || relation.to === selectedId)
      && !["compatibleAttachment", "compatibleMagazine"].includes(relation.type),
    )
    : [];

  useEffect(() => {
    if (!selectedId && !filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filtersOpen) setFiltersOpen(false);
      else setParam("item", null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedId, filtersOpen]);

  return (
    <main className="page catalog-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Арсенал морпехов</p>
          <h1>Каталог снаряжения</h1>
          <p>Оружие, боеприпасы, обвесы и другое снаряжение в одном месте.</p>
        </div>
      </div>

      {loadState === "loading" && <p className="notice">Загружаю актуальный каталог…</p>}
      {loadState === "error" && (
        <p className="notice warning">Не удалось загрузить каталог. Попробуйте обновить страницу чуть позже.</p>
      )}

      {catalog && (
        <>
          <div className="catalog-layout">
            {filtersOpen && <button className="filter-backdrop" aria-label="Закрыть фильтры" onClick={() => setFiltersOpen(false)} />}
            <aside className={`filter-sidebar${filtersOpen ? " is-open" : ""}`} aria-label="Фильтры каталога">
              <div className="filter-sidebar-heading">
                <strong>Фильтры</strong>
                <button className="filter-close" onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры">×</button>
              </div>

              <label className="filter-search">
                <span>Поиск</span>
                <input
                  type="search"
                  placeholder="Название или описание"
                  value={query}
                  onChange={(event) => setParam("q", event.target.value || null)}
                />
              </label>

              <fieldset className="filter-group">
                <legend>Категории</legend>
                <div className="filter-options category-options">
                  {categories.map((name) => (
                    <label className="check-option" key={name}>
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(name)}
                        disabled={!selectedCategories.includes(name) && !categoryCounts.get(name)}
                        onChange={() => toggleParam("category", name)}
                      />
                      <span>{name}</span>
                      <small>{categoryCounts.get(name) || 0}</small>
                    </label>
                  ))}
                </div>
              </fieldset>

              {sizes.length > 0 && (
                <fieldset className="filter-group">
                  <legend>Размер предмета</legend>
                  <div className="filter-options">
                    {sizes.map((value) => (
                      <label className="check-option" key={value}>
                        <input
                          type="checkbox"
                          checked={selectedSizes.includes(value)}
                          disabled={!selectedSizes.includes(value) && !sizeCounts.get(value)}
                          onChange={() => toggleParam("size", value)}
                        />
                        <span>{sizeLabel(value)}</span>
                        <small>{sizeCounts.get(value) || 0}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {attachmentSlots.length > 0 && (
                <fieldset className="filter-group">
                  <legend>Место установки обвеса</legend>
                  <div className="filter-options">
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
                </fieldset>
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

              <fieldset className="filter-group">
                <legend>Дополнительно</legend>
                <div className="filter-options">
                  <label className="check-option">
                    <input type="checkbox" checked={contentsOnly} onChange={() => setParam("contents", contentsOnly ? null : "1")} />
                    <span>Содержит предметы</span>
                  </label>
                  <label className="check-option">
                    <input type="checkbox" checked={describedOnly} onChange={() => setParam("described", describedOnly ? null : "1")} />
                    <span>Есть описание</span>
                  </label>
                </div>
              </fieldset>

              <button className="reset-filters" onClick={clearFilters} disabled={!query && !activeFilters.length}>Сбросить фильтры</button>
            </aside>

            <div className="catalog-results">
              <div className="results-toolbar">
                <div>
                  <button className="mobile-filter-button" onClick={() => setFiltersOpen(true)}>
                    Фильтры{activeFilters.length ? ` · ${activeFilters.length}` : ""}
                  </button>
                  <span className="results-line">Найдено: <strong>{visibleIds.length}</strong> из {publicIds.length}</span>
                </div>
                <label className="sort-control">
                  <span>Сортировка</span>
                  <select value={sort} onChange={(event) => setParam("sort", event.target.value)}>
                    <option value="name">По названию</option>
                    <option value="category">По категории</option>
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

              <section className="equipment-grid" aria-live="polite">
                {visibleIds.map((id) => {
                  const item = catalog.items[id];
                  const size = itemSize(item);
                  return (
                    <button className="equipment-card" key={id} onClick={() => setParam("item", id)}>
                      <span className="equipment-section">{item.category || "Снаряжение"}</span>
                      <Sprite item={item} />
                      <strong>{capitalizeName(item.name)}</strong>
                      {size && <small className="equipment-meta">{sizeLabel(size)}</small>}
                    </button>
                  );
                })}
              </section>
              {!visibleIds.length && <p className="empty-state">Ничего не найдено. Даже подозрительного ящика.</p>}
            </div>
          </div>
        </>
      )}

      {selectedItem && catalog && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setParam("item", null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Карточка предмета" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setParam("item", null)} aria-label="Закрыть">×</button>
            <div className="drawer-sprite"><Sprite item={selectedItem} /></div>
            <p className="eyebrow">{selectedItem.category || "Снаряжение"}</p>
            <h2>{capitalizeName(selectedItem.name)}</h2>
            <p>{selectedItem.description || "Описание пока отсутствует в локализации."}</p>
            <CompatibilityDetails item={selectedItem} catalog={catalog} onSelect={(id) => setParam("item", id)} />
            {selectedRelations.length > 0 && <h3>Содержимое и связи</h3>}
            {selectedRelations.length ? (
              <ul className="relations">
                {selectedRelations.map((relation, index) => {
                  const outgoing = relation.from === selectedItem.id;
                  const relatedId = outgoing ? relation.to : relation.from;
                  const related = catalog.items[relatedId];
                  return (
                    <li key={`${relation.from}:${relation.type}:${relation.to}:${index}`}>
                      <span>{relationLabel(relation.type, outgoing)}</span>
                      <strong>{capitalizeName(related?.name || relatedId)}</strong>
                      {relation.quantity && relation.quantity > 1 ? <small>Количество: {relation.quantity}</small> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}

function Sprite({ item }: { item: CatalogItem }) {
  if (!item.image) return <span className="sprite-placeholder" aria-hidden="true">?</span>;
  return (
    <span className="sprite-frame">
      <img
        src={`${DATA_ROOT}${item.image}`}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function CompatibilityDetails({
  item,
  catalog,
  onSelect,
}: {
  item: CatalogItem;
  catalog: Catalog;
  onSelect: (id: string) => void;
}) {
  const groups = [
    ...(item.attachmentSlots || []).map((slot) => ({
      title: `Обвесы · ${slot.name}`,
      ids: slot.compatibleItemIds,
    })),
    ...(item.magazineSlots || []).map((slot) => ({
      title: slot.name || "Совместимые магазины",
      ids: slot.compatibleItemIds,
    })),
    ...(item.attachableTo || []).map((slot) => ({
      title: `Устанавливается: ${slot.slotName}`,
      ids: slot.weaponIds,
    })),
    ...(item.compatibleWeaponIds?.length
      ? [{ title: "Совместимое оружие", ids: item.compatibleWeaponIds }]
      : []),
  ].map((group) => ({
    ...group,
    ids: [...new Set(group.ids)].filter((id) => catalog.items[id]),
  })).filter((group) => group.ids.length);

  if (!groups.length) return null;
  return (
    <section className="compatibility-section">
      <h3>Совместимость</h3>
      <div className="compatibility-groups">
        {groups.map((group) => (
          <div key={`${group.title}:${group.ids.join(":")}`}>
            <h4>{group.title}</h4>
            <div className="item-link-list">
              {group.ids.map((id) => (
                <button key={id} onClick={() => onSelect(id)}>{catalog.items[id].name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolPlaceholder() {
  const { slug } = useParams();
  const module = modules.find((item) => item.slug === slug);
  if (!module) return <NotFound />;
  return (
    <main className="page placeholder-page">
      <p className="eyebrow">Макет раздела</p>
      <h1>{module.title}</h1>
      <p>{module.text}</p>
      <div className="placeholder-box">
        Здесь появится рабочий интерфейс. Пока этот экран нужен, чтобы проверить
        структуру приложения и навигацию до того, как мы начнём строить сам инструмент.
      </div>
      <Link className="button-link" to="/">← Вернуться на главную</Link>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page placeholder-page">
      <h1>Такого раздела пока нет</h1>
      <Link className="button-link" to="/">Вернуться на главную</Link>
    </main>
  );
}

function capitalizeName(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\d/u.test(character)) return value;
    if (/\p{L}/u.test(character)) {
      return value.slice(0, index) + character.toLocaleUpperCase("ru") + value.slice(index + 1);
    }
  }
  return value;
}

function itemSize(item?: CatalogItem) {
  const properties = item?.properties?.Item;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const size = (properties as Record<string, unknown>).size;
  return typeof size === "string" && size ? size : null;
}

function sizeLabel(value: string) {
  const labels: Record<string, string> = {
    Tiny: "Крошечный",
    Small: "Маленький",
    Normal: "Средний",
    Large: "Большой",
    Huge: "Огромный",
    Ginormous: "Гигантский",
  };
  return labels[value] || value;
}

function sizeOrder(value: string) {
  const order = ["Tiny", "Small", "Normal", "Large", "Huge", "Ginormous"];
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function itemCompatibleWith(item: CatalogItem, weaponId: string) {
  if (item.compatibleWeaponIds?.includes(weaponId)) return true;
  return (item.attachableTo || []).some((slot) => slot.weaponIds.includes(weaponId));
}

function relationLabel(type: string, outgoing: boolean) {
  const labels: Record<string, [string, string]> = {
    contains: ["Содержит", "Находится внутри"],
    slotItem: ["Содержит", "Находится внутри"],
    bundleItem: ["В комплекте", "Входит в комплект"],
    loadedWith: ["Заряжено", "Используется как боеприпас"],
    installedAttachment: ["Установлен обвес", "Установлен на"],
    compatibleAttachment: ["Совместимый обвес", "Совместимо с оружием"],
    compatibleMagazine: ["Совместимый магазин", "Подходит к оружию"],
    fires: ["Стреляет", "Используется в боеприпасе"],
    variant: ["Вариант", "Является вариантом"],
    refillableBy: ["Заполняется", "Используется для заполнения"],
  };
  return (labels[type] || ["Использует", "Используется в"])[outgoing ? 0 : 1];
}

export default App;
