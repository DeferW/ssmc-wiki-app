import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from "react-router-dom";

const DATA_ROOT = "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/";
const DATA_URL = `${DATA_ROOT}equipment-catalog.json`;

const CATEGORY_ORDER = [
  "Оружие",
  "Боеприпасы",
  "Обвесы",
  "Взрывчатка",
  "Ближний бой",
  "Броня",
  "Экипировка",
  "Инструменты и оборудование",
  "Медицина",
  "Снаряжение",
  "Другое",
] as const;

type JsonMap = Record<string, unknown>;

type AttachmentSlot = {
  id?: string;
  slotId?: string;
  name?: string;
  slotName?: string;
  compatibleItemIds?: string[];
  installedItemIds?: string[];
  weaponIds?: string[];
};

type CatalogItem = {
  id: string;
  name: string;
  baseName?: string;
  description?: string;
  category?: string;
  image?: string;
  types?: string[];
  tags?: string[];
  componentTypes?: string[];
  equipmentSlots?: string[];
  properties?: Record<string, unknown>;
  classification?: {
    category?: string;
    categoryId?: string;
    confidence?: string;
    reason?: string;
  };
  attachmentSlots?: AttachmentSlot[];
  attachableTo?: AttachmentSlot[];
  magazineSlots?: AttachmentSlot[];
  compatibleWeaponIds?: string[];
  containsItemIds?: string[];
  weaponStats?: JsonMap;
  armorStats?: JsonMap;
  attachmentStats?: JsonMap;
};

type PublicCatalog = {
  itemIds: string[];
  categories: Record<string, string[]>;
  aliases?: Record<string, string>;
};

type Catalog = {
  schemaVersion: number;
  gameCommit: string;
  items: Record<string, CatalogItem>;
  publicCatalog: PublicCatalog;
  counts?: { publicItems?: number };
};

type AdminOverride = {
  category?: string;
  hidden?: boolean;
};

type AdminDraft = Record<string, AdminOverride>;

const modules = [
  {
    slug: "equipment",
    title: "Снаряжение",
    text: "Оружие, боеприпасы, обвесы и остальное оснащение морпехов.",
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
    text: "Несколько предметов рядом без прыжков между вкладками вики.",
    status: "Запланировано",
  },
  {
    slug: "loadout",
    title: "Комплект бойца",
    text: "Оружие, броня, пояс, подсумки и расходники в одной сборке.",
    status: "Идея",
  },
  {
    slug: "chemistry",
    title: "Химический планировщик",
    text: "Расчёт реагентов и пошаговый маршрут приготовления.",
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
        <Route path="/equipment/admin" element={<AdminEquipment />} />
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
        <p>Каталоги, расчёты, сравнения и конструкторы — всё, чему тесно внутри MediaWiki.</p>
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

function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "live" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(DATA_URL, { signal: controller.signal, cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((data) => {
        if (data.schemaVersion < 3 || !data.publicCatalog?.itemIds) {
          throw new Error("Unsupported equipment catalog schema");
        }
        setCatalog(data);
        setLoadState("live");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  return { catalog, loadState };
}

function Equipment() {
  const { catalog, loadState } = useCatalog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsTop = useRef<HTMLDivElement>(null);

  const query = searchParams.get("q") || "";
  const selectedCategories = searchParams.getAll("category");
  const selectedSlots = searchParams.getAll("slot");
  const compatibleWeapon = searchParams.get("weapon") || "";
  const sort = searchParams.get("sort") || "name";
  const selectedId = searchParams.get("item");

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

  const matchesItem = (id: string, ignoredFacet?: "category" | "slot") => {
    const item = catalog?.items[id];
    if (!item) return false;
    const normalized = normalize(query);
    const matchesQuery = !normalized || [item.name, item.description, id]
      .filter(Boolean)
      .some((value) => normalize(String(value)).includes(normalized));
    const slots = new Set((item.attachableTo || []).map((slot) => slot.slotName || slot.name || ""));
    const matchesCategory = ignoredFacet === "category" || !selectedCategories.length
      || selectedCategories.includes(item.category || "");
    const matchesSlot = ignoredFacet === "slot" || !selectedSlots.length
      || selectedSlots.some((slot) => slots.has(slot));
    const matchesWeapon = !compatibleWeapon || itemCompatibleWith(item, compatibleWeapon);
    return matchesQuery && matchesCategory && matchesSlot && matchesWeapon;
  };

  const visibleIds = catalog
    ? publicIds.filter((id) => matchesItem(id)).sort((a, b) => {
      const first = catalog.items[a];
      const second = catalog.items[b];
      if (sort === "category") {
        const order = categoryIndex(first.category) - categoryIndex(second.category);
        if (order) return order;
      }
      return first.name.localeCompare(second.name, "ru") || a.localeCompare(b);
    })
    : [];

  const categoryCounts = (() => {
    const counts = new Map<string, number>();
    for (const id of publicIds) {
      if (!matchesItem(id, "category")) continue;
      const category = catalog?.items[id]?.category;
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
  ];

  const selectedItem = selectedId && catalog ? catalog.items[selectedId] : null;

  useEffect(() => {
    if (!selectedId && !filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (filtersOpen) setFiltersOpen(false);
      else {
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
          <p className="eyebrow">Арсенал морпехов</p>
          <h1>Каталог снаряжения</h1>
          <p>Один поиск, понятные разделы и характеристики без похода в исходный YAML.</p>
        </div>
      </div>

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

            <section className="equipment-grid" aria-live="polite">
              {visibleIds.map((id) => {
                const item = catalog.items[id];
                return (
                  <button className="equipment-card" key={id} onClick={() => setParam("item", id)}>
                    <span className="equipment-section">{item.category || "Снаряжение"}</span>
                    <Sprite item={item} />
                    <strong>{capitalizeName(item.name)}</strong>
                    <small className="equipment-id">{item.id}</small>
                  </button>
                );
              })}
            </section>
            {!visibleIds.length && <p className="empty-state">Ничего не найдено. Даже подозрительного ящика.</p>}
          </div>
        </div>
      )}

      {selectedItem && catalog && (
        <ItemDialog
          item={selectedItem}
          catalog={catalog}
          visibleIds={visibleIds}
          onClose={() => setParam("item", null)}
          onSelect={(id) => setParam("item", id)}
        />
      )}
    </main>
  );
}

function ItemDialog({
  item,
  catalog,
  visibleIds,
  onClose,
  onSelect,
}: {
  item: CatalogItem;
  catalog: Catalog;
  visibleIds: string[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const index = visibleIds.indexOf(item.id);
  const previousId = index > 0 ? visibleIds[index - 1] : null;
  const nextId = index >= 0 && index < visibleIds.length - 1 ? visibleIds[index + 1] : null;
  const contained = (item.containsItemIds || []).filter((id) => catalog.items[id]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="item-dialog" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-toolbar">
          <div className="dialog-stepper" aria-label="Навигация между предметами">
            <button disabled={!previousId} onClick={() => previousId && onSelect(previousId)}>← <span>Предыдущий</span></button>
            <small>{index >= 0 ? `${index + 1} / ${visibleIds.length}` : ""}</small>
            <button disabled={!nextId} onClick={() => nextId && onSelect(nextId)}><span>Следующий</span> →</button>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="dialog-layout">
          <div className="dialog-summary">
            <div className="dialog-sprite"><Sprite item={item} eager /></div>
            <p className="eyebrow">{item.category || "Снаряжение"}</p>
            <h2 id="item-dialog-title">{capitalizeName(item.name)}</h2>
            <code className="prototype-id">{item.id}</code>
            <p className="item-description">{item.description || "Описание пока отсутствует в локализации."}</p>
          </div>

          <div className="dialog-details">
            <StatsDetails item={item} />
            <CompatibilityDetails item={item} catalog={catalog} onSelect={onSelect} />
            {contained.length > 0 && (
              <section className="detail-section">
                <h3>Содержит</h3>
                <ItemLinkList ids={contained} catalog={catalog} onSelect={onSelect} />
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatsDetails({ item }: { item: CatalogItem }) {
  if (item.weaponStats) return <WeaponStats stats={item.weaponStats} />;
  if (item.armorStats) return <ArmorStats stats={item.armorStats} />;
  if (item.attachmentStats) return <AttachmentStats stats={item.attachmentStats} />;
  return null;
}

function WeaponStats({ stats }: { stats: JsonMap }) {
  const rows: Array<[string, unknown]> = [
    ["Темп стрельбы", stats.roundsPerMinute != null ? `${formatNumber(stats.roundsPerMinute)} выстр./мин` : null],
    ["Выстрелов в секунду", stats.shotsPerSecond],
    ["Режим по умолчанию", stats.defaultFireMode],
    ["Бронепробитие оружия", stats.weaponArmorPiercing],
    ["Размер очереди", stats.burstSize],
    ["Множитель урона", stats.damageMultiplier],
    ["Режимы огня", Array.isArray(stats.fireModes) ? stats.fireModes.join(", ") : null],
    ["IFF", stats.iffEnabled],
    ["Стрельба с двух рук", stats.dualWielding],
  ];
  const provider = isMap(stats.ammoProvider) ? stats.ammoProvider : null;
  if (provider) {
    rows.push(["Ёмкость", provider.capacity]);
    rows.push(["Штатный боеприпас", provider.startingAmmoId]);
  }
  const ammunition = Array.isArray(stats.ammunition) ? stats.ammunition.filter(isMap) : [];
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики оружия</h3>
      <StatGrid rows={rows} />
      {ammunition.length > 0 && (
        <div className="ammo-list">
          <h4>Боеприпасы и урон</h4>
          {ammunition.map((entry, index) => {
            const projectiles = Array.isArray(entry.projectiles) ? entry.projectiles.filter(isMap) : [];
            return (
              <article key={`${String(entry.ammoId)}:${index}`}>
                <strong>{String(entry.ammoName || entry.ammoId || "Боеприпас")}</strong>
                {projectiles.map((projectile, projectileIndex) => (
                  <div className="damage-line" key={`${String(projectile.projectileId)}:${projectileIndex}`}>
                    <span>{formatDamage(projectile.damage)}</span>
                    {projectile.armorPiercing != null && <small>Бронепробитие: {formatNumber(projectile.armorPiercing)}</small>}
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      )}
      <NestedStatGroups
        groups={[
          ["Отдача", stats.recoil],
          ["Разброс", stats.scatter],
          ["Точность", stats.accuracy],
          ["Модификаторы режимов огня", stats.fireModeModifiers],
          ["Падение урона с расстоянием", stats.weaponDamageFalloff],
          ["Ближний бой", stats.melee],
          ["Время вскидывания", stats.wieldDelay],
          ["Скорость с оружием", stats.wieldedMovement],
          ["Требования к навыкам", stats.skillRequirements],
          ["Параметры оружия", stats.gunParameters],
        ]}
      />
    </section>
  );
}

function ArmorStats({ stats }: { stats: JsonMap }) {
  const protection = isMap(stats.protection) ? stats.protection : {};
  const protectionRows = Object.entries(protection)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => [armorLabel(key), value] as [string, unknown]);
  return (
    <section className="detail-section stats-section">
      <h3>Защита брони</h3>
      <StatGrid rows={[
        ["Слоты", stats.slots],
        ["Класс скорости", stats.speedTier],
        ["Твёрдая броня", stats.hardArmor],
        ["Громоздкая", stats.bulkyArmor],
        ["Игнорирует бронепробитие", stats.immuneToArmorPiercing],
      ]} />
      <h4 className="subsection-title">Сопротивления</h4>
      <StatGrid rows={protectionRows} />
      <div className="flag-list">
        {stats.hardArmor === true && <span>Твёрдая броня</span>}
        {stats.bulkyArmor === true && <span>Громоздкая</span>}
        {stats.immuneToArmorPiercing === true && <span>Игнорирует бронепробитие</span>}
      </div>
      <NestedStatGroups groups={[
        ["Скорость движения", stats.movement],
        ["Сопротивление взрывам", stats.explosionResistance],
      ]} />
    </section>
  );
}

function AttachmentStats({ stats }: { stats: JsonMap }) {
  const modifiers = isMap(stats.modifiers) ? stats.modifiers : {};
  const effects = Array.isArray(stats.effects) ? stats.effects.map(String) : [];
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики обвеса</h3>
      {effects.length > 0 && (
        <div className="flag-list">{effects.map((effect) => <span key={effect}>{effect}</span>)}</div>
      )}
      {Object.keys(modifiers).length > 0 && (
        <div className="modifier-list">
          {Object.entries(modifiers).map(([group, value]) => (
            <details key={group}>
              <summary>{componentLabel(group)}</summary>
              <pre>{prettyJson(value)}</pre>
            </details>
          ))}
        </div>
      )}
      <NestedStatGroups groups={[["Совместимость", stats.compatibleWith]]} />
    </section>
  );
}

function NestedStatGroups({ groups }: { groups: Array<[string, unknown]> }) {
  const visible = groups.filter(([, value]) => value !== null && value !== undefined
    && (!Array.isArray(value) || value.length > 0)
    && (!isMap(value) || Object.keys(value).length > 0));
  if (!visible.length) return null;
  return (
    <div className="nested-stat-groups">
      {visible.map(([title, value]) => (
        <details key={title}>
          <summary>{title}</summary>
          <pre>{prettyJson(value)}</pre>
        </details>
      ))}
    </div>
  );
}

function StatGrid({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="muted">Числовые характеристики не указаны.</p>;
  return (
    <dl className="stat-grid">
      {visible.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
      ))}
    </dl>
  );
}

function CompatibilityDetails({ item, catalog, onSelect }: { item: CatalogItem; catalog: Catalog; onSelect: (id: string) => void }) {
  const groups = [
    ...(item.attachmentSlots || []).map((slot) => ({
      title: `Обвесы · ${slot.name || slot.slotName || "Слот"}`,
      ids: slot.compatibleItemIds || [],
    })),
    ...(item.magazineSlots || []).map((slot) => ({
      title: slot.name || slot.slotName || "Совместимые магазины",
      ids: slot.compatibleItemIds || [],
    })),
    ...(item.attachableTo || []).map((slot) => ({
      title: `Устанавливается · ${slot.slotName || slot.name || "Слот"}`,
      ids: slot.weaponIds || [],
    })),
    ...(item.compatibleWeaponIds?.length ? [{ title: "Совместимое оружие", ids: item.compatibleWeaponIds }] : []),
  ].map((group) => ({ ...group, ids: [...new Set(group.ids)].filter((id) => catalog.items[id]) }))
    .filter((group) => group.ids.length);

  if (!groups.length) return null;
  return (
    <section className="detail-section compatibility-section">
      <h3>Совместимость</h3>
      <div className="compatibility-groups">
        {groups.map((group) => (
          <div key={`${group.title}:${group.ids.join(":")}`}>
            <h4>{group.title}</h4>
            <ItemLinkList ids={group.ids} catalog={catalog} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemLinkList({ ids, catalog, onSelect }: { ids: string[]; catalog: Catalog; onSelect: (id: string) => void }) {
  return (
    <div className="item-link-list">
      {ids.map((id) => (
        <button key={id} onClick={() => onSelect(id)}>
          <Sprite item={catalog.items[id]} compact />
          <span>{capitalizeName(catalog.items[id].name)}</span>
        </button>
      ))}
    </div>
  );
}

function Sprite({ item, compact = false, eager = false }: { item: CatalogItem; compact?: boolean; eager?: boolean }) {
  if (!item.image) return <span className={`sprite-placeholder${compact ? " compact" : ""}`} aria-hidden="true">?</span>;
  return (
    <span className={`sprite-frame${compact ? " compact" : ""}`}>
      <img src={`${DATA_ROOT}${item.image}`} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}

function AdminEquipment() {
  const { catalog, loadState } = useCatalog();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<AdminDraft>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ids = useMemo(() => {
    if (!catalog) return [];
    const normalized = normalize(query);
    return catalog.publicCatalog.itemIds.filter((id) => {
      const item = catalog.items[id];
      return !normalized || normalize(`${item.name} ${id}`).includes(normalized);
    });
  }, [catalog, query]);

  const selected = selectedId && catalog ? catalog.items[selectedId] : null;
  const changes = Object.entries(draft).filter(([, value]) => value.category || value.hidden !== undefined);

  function change(id: string, patch: AdminOverride) {
    setDraft((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function reset(id: string) {
    setDraft((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <main className="page admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Заготовка интерфейса</p>
          <h1>Управление каталогом</h1>
          <p>Только категория и видимость. Описания и характеристики здесь намеренно не редактируются.</p>
        </div>
        <Link className="button-link" to="/equipment">← В каталог</Link>
      </div>

      <div className="admin-warning">
        <strong>Сохранение ещё не подключено.</strong>
        <span>Изменения живут только в браузере и уже имеют формат будущего <code>catalog-overrides.json</code>.</span>
      </div>

      {loadState === "loading" && <p className="notice">Загружаю каталог…</p>}
      {loadState === "error" && <p className="notice warning">Каталог не загрузился.</p>}

      {catalog && (
        <div className="admin-layout">
          <section className="admin-list-panel">
            <label className="admin-search">
              <span>Найти предмет</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или ID" />
            </label>
            <div className="admin-item-list">
              {ids.slice(0, 250).map((id) => {
                const item = catalog.items[id];
                const override = draft[id];
                return (
                  <button className={selectedId === id ? "is-current" : ""} key={id} onClick={() => setSelectedId(id)}>
                    <Sprite item={item} compact />
                    <span><strong>{capitalizeName(item.name)}</strong><small>{override?.category || item.category}</small></span>
                    {override && <i aria-label="Изменён">•</i>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="admin-editor-panel">
            {selected ? (
              <>
                <div className="admin-item-heading">
                  <Sprite item={selected} />
                  <div><h2>{capitalizeName(selected.name)}</h2><code>{selected.id}</code></div>
                </div>
                <label className="admin-field">
                  <span>Категория</span>
                  <select
                    value={draft[selected.id]?.category || selected.category || "Другое"}
                    onChange={(event) => change(selected.id, { category: event.target.value })}
                  >
                    {CATEGORY_ORDER.map((category) => <option key={category}>{category}</option>)}
                  </select>
                  <small>Автоматически: {selected.category}</small>
                </label>
                <label className="admin-switch">
                  <input
                    type="checkbox"
                    checked={draft[selected.id]?.hidden === true}
                    onChange={(event) => change(selected.id, { hidden: event.target.checked })}
                  />
                  <span><strong>Скрыть из каталога</strong><small>Предмет останется в технических данных и его можно будет вернуть.</small></span>
                </label>
                <button className="reset-override" onClick={() => reset(selected.id)} disabled={!draft[selected.id]}>
                  Вернуть автоматические настройки
                </button>
              </>
            ) : <p className="admin-empty">Выберите предмет слева.</p>}
          </section>

          <aside className="admin-changes-panel">
            <div><span>Несохранённые изменения</span><strong>{changes.length}</strong></div>
            {changes.length > 0 ? (
              <ul>{changes.map(([id, value]) => <li key={id}><strong>{catalog.items[id]?.name || id}</strong><small>{value.hidden ? "Скрыт" : value.category || "Изменён"}</small></li>)}</ul>
            ) : <p>Пока чисто. Даже подозрительно.</p>}
            <button disabled>Сохранить изменения</button>
            <small>Кнопка заработает после подключения защищённого API.</small>
          </aside>
        </div>
      )}
    </main>
  );
}

function ToolPlaceholder() {
  const { slug } = useParams();
  const tool = modules.find((item) => item.slug === slug);
  if (!tool) return <NotFound />;
  return (
    <main className="page placeholder-page">
      <p className="eyebrow">Макет раздела</p>
      <h1>{tool.title}</h1>
      <p>{tool.text}</p>
      <div className="placeholder-box">Этот инструмент ещё не собран.</div>
      <Link className="button-link" to="/">← Вернуться на главную</Link>
    </main>
  );
}

function NotFound() {
  return <main className="page placeholder-page"><h1>Такого раздела пока нет</h1><Link className="button-link" to="/">Вернуться на главную</Link></main>;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function capitalizeName(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\d/u.test(character)) return value;
    if (/\p{L}/u.test(character)) return value.slice(0, index) + character.toLocaleUpperCase("ru") + value.slice(index + 1);
  }
  return value;
}

function categoryIndex(category?: string) {
  const index = CATEGORY_ORDER.indexOf(category as typeof CATEGORY_ORDER[number]);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function itemCompatibleWith(item: CatalogItem, weaponId: string) {
  if (item.compatibleWeaponIds?.includes(weaponId)) return true;
  return (item.attachableTo || []).some((slot) => (slot.weaponIds || []).includes(weaponId));
}

function isMap(value: unknown): value is JsonMap {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatNumber(value: unknown) {
  return typeof value === "number" ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value) : String(value ?? "");
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return String(value ?? "—");
}

function formatDamage(value: unknown) {
  if (!isMap(value)) return "Урон не указан";
  const entries = Object.entries(value).filter(([, amount]) => typeof amount === "number" && amount !== 0);
  return entries.length ? entries.map(([type, amount]) => `${damageLabel(type)} ${formatNumber(amount)}`).join(" · ") : "Урон не указан";
}

function damageLabel(value: string) {
  const labels: Record<string, string> = { Blunt: "Дробящий", Slash: "Режущий", Piercing: "Колющий", Heat: "Термический", Caustic: "Кислотный" };
  return labels[value] || value;
}

function armorLabel(value: string) {
  const labels: Record<string, string> = {
    xenoArmor: "Ксено-урон",
    frontalArmor: "Спереди",
    sideArmor: "Сбоку",
    melee: "Ближний бой",
    bullet: "Пули",
    laser: "Лазеры",
    bio: "Биозащита",
    explosionArmor: "Взрывы",
    acid: "Кислота",
  };
  return labels[value] || value;
}

function componentLabel(value: string) {
  const labels: Record<string, string> = {
    AttachableWeaponRangedMods: "Стрельба",
    AttachableSpeedMods: "Скорость движения",
    AttachableWieldDelayMods: "Время вскидывания",
    AttachableMeleeMods: "Ближний бой",
  };
  return labels[value] || value;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
    .replaceAll('"conditions"', "условия")
    .replaceAll('"modifiers"', "модификаторы")
    .replaceAll('"', "");
}

export default App;
