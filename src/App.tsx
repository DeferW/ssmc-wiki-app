import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from "react-router-dom";

const DATA_ROOT =
  "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/";
const DATA_URL = `${DATA_ROOT}equipment-catalog.json`;

const CATEGORY_ORDER = [
  "Оружие",
  "Боеприпасы и взрывчатка",
  "Обвесы",
  "Ближний бой",
  "Броня",
  "Экипировка",
  "Медицина",
  "Снаряжение",
  "Другое",
] as const;

const ADMIN_DRAFT_KEY = "ssmc-equipment-admin-overrides-v1";
const ADMIN_API_URL =
  "https://ssmc-wiki-admin-api.24dfffer.workers.dev/api/overrides";

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
  description?: unknown;
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
  storageStats?: JsonMap;
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

type AdminApiDocument = {
  schemaVersion: 1;
  items: AdminDraft;
};

type AdminSyncState = "loading" | "ready" | "saving" | "saved" | "error";

const modules = [
  {
    slug: "equipment",
    title: "Снаряжение",
    text: "Оружие, боеприпасы, обвесы и остальное оснащение морпехов.",
  },
  {
    slug: "weapon-builder",
    title: "Конструктор оружия",
    text: "Выбор оружия, совместимых обвесов и итоговых характеристик сборки.",
    status: "Запланировано",
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
    status: "Запланировано",
  },
  {
    slug: "chemistry",
    title: "Химический планировщик",
    text: "Расчёт реагентов и пошаговый маршрут приготовления.",
    status: "Запланировано",
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
    <main className="home-page">
      <video className="home-video" autoPlay muted loop playsInline aria-hidden="true">
        <source src="/background-animation.webm" type="video/webm" />
      </video>
      <div className="home-shade" aria-hidden="true" />
      <div className="page home-content">
        <section className="intro">
          <p className="eyebrow">USCM // SECURE DATABASE NODE</p>
          <h1>СИСТЕМА ПОЛЕВОЙ СПРАВКИ</h1>
          <p>Каталоги, расчёты, сравнения и конструкторы — всё, чему тесно внутри MediaWiki.</p>
        </section>
        <section className="module-grid" aria-label="Разделы приложения">
          {modules.map((module) => {
            const href = module.slug === "equipment" ? "/equipment" : `/tool/${module.slug}`;
            return (
              <Link className="module-card" to={href} key={module.slug}>
                {module.status && <span className="status">{module.status}</span>}
                <h2>{module.title}</h2>
                <p>{module.text}</p>
                <span className="card-link">[ ОТКРЫТЬ МОДУЛЬ ]</span>
              </Link>
            );
          })}
        </section>
      </div>
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

function Equipment({ adminMode = false }: { adminMode?: boolean }) {
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

function ItemDrawer({
  item,
  catalog,
  onClose,
  onSelect,
}: {
  item: CatalogItem;
  catalog: Catalog;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const contained = ["Броня", "Экипировка"].includes(item.category || "")
    ? []
    : (item.containsItemIds || []).filter((id) => catalog.items[id]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="item-drawer" role="dialog" aria-modal="false" aria-labelledby={`item-title-${item.id}`}>
        <div className="drawer-content">
          <section className="dialog-summary">
            <button className="close-button" onClick={onClose} aria-label="Закрыть подробности">×</button>
            <div className="dialog-sprite"><Sprite item={item} eager /></div>
            <div>
              <p className="eyebrow">{item.category || "Снаряжение"}</p>
              <h2 id={`item-title-${item.id}`}>{capitalizeName(item.name)}</h2>
              <code className="prototype-id">{item.id}</code>
            </div>
          </section>
          <div className="drawer-scroll">
            <p className="item-description">{descriptionText(item.description)}</p>
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
        </div>
      </aside>
    </div>
  );
}

function StatsDetails({ item }: { item: CatalogItem }) {
  return (
    <>
      {item.weaponStats && <WeaponStats stats={item.weaponStats} />}
      {item.armorStats && <ArmorStats stats={item.armorStats} />}
      {item.attachmentStats && <AttachmentStats stats={item.attachmentStats} />}
      <CommonItemStats item={item} />
    </>
  );
}

function WeaponStats({ stats }: { stats: JsonMap }) {
  const recoil = isMap(stats.recoil) ? stats.recoil : {};
  const scatter = isMap(stats.scatter) ? stats.scatter : {};
  const accuracy = isMap(stats.accuracy) ? stats.accuracy : {};
  const wieldDelay = isMap(stats.wieldDelay) ? stats.wieldDelay : {};
  const fireModes = Array.isArray(stats.fireModes) ? stats.fireModes.map((mode) => fireModeLabel(String(mode))) : [];
  const rows: Array<[string, unknown]> = [
    ["Темп стрельбы", stats.roundsPerMinute != null ? `${formatNumber(stats.roundsPerMinute)} выстр./мин` : null],
    ["Режимы огня", fireModes.length ? fireModes.join(", ") : null],
    ["Основной режим", fireModes.length > 1 && stats.defaultFireMode ? fireModeLabel(String(stats.defaultFireMode)) : null],
    ["Очередь", stats.burstSize != null ? `${formatNumber(stats.burstSize)} выстр.` : null],
    ["Бронепробитие", stats.weaponArmorPiercing],
    ["Множитель урона", stats.damageMultiplier != null ? `×${formatNumber(stats.damageMultiplier)}` : null],
    ["Отдача · в упоре", recoil.wielded],
    ["Отдача · с рук", recoil.unwielded],
    ["Разброс · в упоре", scatter.wielded],
    ["Разброс · с рук", scatter.unwielded],
    ["Точность · в упоре", asMultiplier(accuracy.wieldedMultiplier)],
    ["Точность · с рук", asMultiplier(accuracy.unwieldedMultiplier)],
    ["Время вскидывания", wieldDelay.baseDelay != null ? `${formatNumber(wieldDelay.baseDelay)} с` : null],
    ["IFF", stats.iffEnabled],
  ];
  const provider = isMap(stats.ammoProvider) ? stats.ammoProvider : null;
  if (provider) {
    rows.push(["Ёмкость", provider.capacity]);
    rows.push(["Штатный боеприпас", provider.startingAmmoId]);
  }
  const movement = isMap(stats.wieldedMovement) ? stats.wieldedMovement : null;
  if (movement) {
    for (const [key, label] of [["base", "без брони"], ["light", "лёгкая броня"], ["medium", "средняя броня"], ["heavy", "тяжёлая броня"]] as const) {
      const value = movement[key];
      if (typeof value === "number" && value !== 1) rows.push([`Снижение скорости · ${label}`, `−${Math.round((1 - value) * 100)}%`]);
    }
  }
  const ammunition = Array.isArray(stats.ammunition) ? stats.ammunition.filter(isMap) : [];
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики оружия</h3>
      <StatGrid rows={rows} />
      {ammunition.length > 0 && (
        <div className="ammo-list">
          <h4>Магазины, боеприпасы и урон</h4>
          {ammunition.map((entry, index) => {
            const projectiles = Array.isArray(entry.projectiles) ? entry.projectiles.filter(isMap) : [];
            return (
              <article key={`${String(entry.ammoId)}:${index}`}>
                <div className="ammo-heading">
                  <strong title={String(entry.magazineName || entry.ammoName || entry.magazineId || entry.ammoId || "Боеприпас")}>{String(entry.magazineName || entry.ammoName || entry.magazineId || entry.ammoId || "Боеприпас")}</strong>
                  {entry.capacity != null && <span>{formatNumber(entry.capacity)} шт.</span>}
                </div>
                {projectiles.map((projectile, projectileIndex) => (
                  <div className="projectile-card" key={`${String(projectile.projectileId)}:${projectileIndex}`}>
                    <div className="damage-line">
                      <span>{formatDamage(projectile.effectiveDamage || projectile.damage)}</span>
                      {projectile.armorPiercing != null && <small>Бронепробитие {formatNumber(projectile.armorPiercing)}</small>}
                    </div>
                    <ProjectileRange projectile={projectile} />
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      )}
      <ReadableStatGroups
        groups={[
          ["Модификаторы режимов огня", stats.fireModeModifiers],
          ["Падение урона с расстоянием", stats.weaponDamageFalloff],
          ["Ближний бой", stats.melee],
          ["Требования к навыкам", stats.skillRequirements],
          ["Дополнительные параметры", stats.gunParameters],
        ]}
      />
    </section>
  );
}

function ArmorStats({ stats }: { stats: JsonMap }) {
  const protection = isMap(stats.protection) ? stats.protection : {};
  const movement = isMap(stats.movement) ? stats.movement : {};
  const protectionRows = Object.entries(protection)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key, value]) => [armorLabel(key), value] as [string, unknown]);
  return (
    <section className="detail-section stats-section">
      <h3>Защита брони</h3>
      <StatGrid rows={[
        ["Снижение скорости", formatMovementPenalty(movement)],
      ]} />
      <h4 className="subsection-title">Сопротивления</h4>
      <ProtectionBars rows={protectionRows} />
    </section>
  );
}

function AttachmentStats({ stats }: { stats: JsonMap }) {
  const modifiers = isMap(stats.modifiers) ? stats.modifiers : {};
  const rows = attachmentModifierRows(modifiers);
  return (
    <section className="detail-section stats-section">
      <h3>Характеристики обвеса</h3>
      <StatGrid rows={rows} />
    </section>
  );
}

function CommonItemStats({ item }: { item: CatalogItem }) {
  const properties = item.properties || {};
  const solutionManager = isMap(properties.SolutionContainerManager) ? properties.SolutionContainerManager : null;
  const solutions = solutionManager && isMap(solutionManager.solutions) ? solutionManager.solutions : {};
  const storage = isMap(item.storageStats) ? item.storageStats : null;
  const melee = isMap(properties.MeleeWeapon) ? properties.MeleeWeapon : null;
  const armor = isMap(properties.CMArmor) ? properties.CMArmor : null;
  const armorPiercing = isMap(properties.CMArmorPiercing) ? properties.CMArmorPiercing : null;
  const ammoProvider = ["BallisticAmmoProvider", "RevolverAmmoProvider", "CartridgeAmmo", "RMCFlamerTank"]
    .map((key) => [key, properties[key]] as [string, unknown])
    .find(([, value]) => isMap(value));

  const overviewRows: Array<[string, unknown]> = [
    ["Бронепробитие в ближнем бою", armorPiercing?.amount],
  ];
  const hasOverview = overviewRows.some(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <>
      {hasOverview && <section className="detail-section"><h3>Основные свойства</h3><StatGrid rows={overviewRows} /></section>}
      {Object.keys(solutions).length > 0 && (
        <section className="detail-section solution-section">
          <h3>Состав и объём</h3>
          <div className="solution-list">
            {Object.entries(solutions).map(([name, raw]) => {
              const solution = isMap(raw) ? raw : {};
              const reagents = Array.isArray(solution.reagents) ? solution.reagents.filter(isMap) : [];
              return (
                <article key={name}>
                  <div><strong>{solutionLabel(name)}</strong>{solution.maxVol != null && <span>{formatNumber(solution.maxVol)} ед.</span>}</div>
                  {reagents.length ? <ul>{reagents.map((reagent, index) => <li key={`${String(reagent.ReagentId)}:${index}`}><span>{readableId(String(reagent.ReagentId || "Реагент"))}</span><strong>{formatNumber(reagent.Quantity)} ед.</strong></li>)}</ul> : <small>Пусто</small>}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {storage && (
        <section className="detail-section">
          <h3>Хранилище</h3>
          <StorageSummary storage={storage} />
        </section>
      )}
      {melee && !item.weaponStats && (
        <section className="detail-section">
          <h3>Ближний бой</h3>
          <StatGrid rows={[
            ["Урон", isMap(melee.damage) && isMap(melee.damage.types) ? formatDamage(melee.damage.types) : null],
            ["Атак в секунду", melee.attackRate],
            ["Угол атаки", melee.angle != null ? `${formatNumber(melee.angle)}°` : null],
          ]} />
        </section>
      )}
      {armor && !item.armorStats && (
        <section className="detail-section">
          <h3>Дополнительная защита</h3>
          <ProtectionBars rows={Object.entries(armor).map(([key, value]) => [armorLabel(key), value] as [string, unknown])} />
        </section>
      )}
      {ammoProvider && !item.weaponStats && (
        <section className="detail-section">
          <h3>Боеприпасы</h3>
          <StatGrid rows={ammoProviderRows(ammoProvider[1])} />
        </section>
      )}
    </>
  );
}

function StorageSummary({ storage }: { storage: JsonMap }) {
  const capacities = Array.isArray(storage.capacities) ? storage.capacities.filter(isMap) : [];
  const limits = Array.isArray(storage.limits) ? storage.limits.filter(isMap) : [];
  const exactPlaces = typeof storage.exactPlaces === "number" ? storage.exactPlaces : null;
  const capacityText = capacities
    .map((entry) => `${formatNumber(entry.count)} ${itemSizeGenitive(String(entry.size || "Small"))}`)
    .join(" · ");
  const limitText = limits
    .map((entry) => typeof entry.count === "number" ? `до ${formatNumber(entry.count)} специальных` : null)
    .filter(Boolean)
    .join(" · ");
  return <StatGrid rows={[
    ["Вместимость", exactPlaces != null ? `${exactPlaces} ${pluralize(exactPlaces, "место", "места", "мест")}` : capacityText || null],
    ["По размерам", exactPlaces == null && capacityText ? capacityText : null],
    ["Максимальный размер", storage.maxItemSize ? itemSizeLabel(storage.maxItemSize) : null],
    ["Особые ограничения", limitText || null],
  ]} />;
}

function ProjectileRange({ projectile }: { projectile: JsonMap }) {
  const accuracy = isMap(projectile.accuracy) ? projectile.accuracy : {};
  const falloff = isMap(projectile.damageFalloff) ? projectile.damageFalloff : {};
  const thresholds: Array<{ kind: string; range?: unknown; falloff?: unknown }> = [
    ...(Array.isArray(accuracy.thresholds) ? accuracy.thresholds.filter(isMap).map((entry) => ({ kind: "Точность", range: entry.range, falloff: entry.falloff })) : []),
    ...(Array.isArray(falloff.thresholds) ? falloff.thresholds.filter(isMap).map((entry) => ({ kind: "Урон", range: entry.range, falloff: entry.falloff })) : []),
  ];
  if (accuracy.accuracy == null && !thresholds.length) return null;
  return (
    <div className="range-summary">
      {accuracy.accuracy != null && <span>Точность {formatNumber(accuracy.accuracy)}</span>}
      {thresholds.slice(0, 3).map((entry, index) => <span key={index}>{entry.kind}: после {formatNumber(entry.range)} тайл. −{formatNumber(entry.falloff)}</span>)}
    </div>
  );
}

function ProtectionBars({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => typeof value === "number" && value !== 0);
  if (!visible.length) return <p className="muted">Сопротивления не указаны.</p>;
  return (
    <div className="protection-bars">
      {visible.map(([label, value]) => {
        const amount = Number(value);
        return <div key={label}><span>{label}</span><div><i style={{ width: `${Math.min(100, Math.max(0, amount))}%` }} /></div><strong>{formatNumber(amount)}%</strong></div>;
      })}
    </div>
  );
}

function ReadableStatGroups({ groups }: { groups: Array<[string, unknown]> }) {
  const visible = groups.filter(([, value]) => value !== null && value !== undefined
    && (!Array.isArray(value) || value.length > 0)
    && (!isMap(value) || Object.keys(value).length > 0));
  if (!visible.length) return null;
  return (
    <div className="nested-stat-groups readable-groups">
      {visible.map(([title, value]) => (
        <details key={title}>
          <summary>{title}</summary>
          <div className="readable-detail"><ReadableValue value={value} /></div>
        </details>
      ))}
    </div>
  );
}

function ReadableValue({ value }: { value: unknown }) {
  const { rows, complex } = flattenReadable(value);
  return (
    <>
      {rows.length > 0 && <StatGrid rows={rows} />}
      {complex.length > 0 && <pre>{prettyJson(complex.length === 1 ? complex[0] : complex)}</pre>}
    </>
  );
}

function StatGrid({ rows }: { rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return <p className="muted">Числовые характеристики не указаны.</p>;
  return (
    <dl className="stat-grid">
      {visible.map(([label, value]) => (
        <div key={label}><dt title={label}>{label}</dt><dd title={formatValue(value)}>{formatValue(value)}</dd></div>
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
      {/* Pixel-art sprites are already generated at their final catalog size. */}
      <img src={`${DATA_ROOT}${item.image}`} alt="" loading={eager ? "eager" : "lazy"} decoding="async" />
    </span>
  );
}

function AdminEquipment() {
  return <Equipment adminMode />;
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

function readAdminDraft(): AdminDraft {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ADMIN_DRAFT_KEY) || "{}");
    if (!isMap(value)) return {};
    const draft: AdminDraft = {};
    for (const [id, entry] of Object.entries(value)) {
      if (!isMap(entry)) continue;
      draft[id] = {
        ...(typeof entry.category === "string" ? { category: entry.category } : {}),
        ...(typeof entry.hidden === "boolean" ? { hidden: entry.hidden } : {}),
      };
    }
    return draft;
  } catch {
    return {};
  }
}

function makeAdminDocument(items: AdminDraft): AdminApiDocument {
  return { schemaVersion: 1, items };
}

function normalizeApiDocument(value: unknown): AdminDraft {
  if (!isMap(value)) return {};
  const items = value.schemaVersion === 1 && isMap(value.items) ? value.items : value;
  const draft: AdminDraft = {};
  for (const [id, entry] of Object.entries(items)) {
    if (!isMap(entry)) continue;
    const normalized: AdminOverride = {
      ...(typeof entry.category === "string" && CATEGORY_ORDER.includes(entry.category as typeof CATEGORY_ORDER[number])
        ? { category: entry.category }
        : {}),
      ...(typeof entry.hidden === "boolean" ? { hidden: entry.hidden } : {}),
    };
    if (normalized.category || normalized.hidden !== undefined) draft[id] = normalized;
  }
  return draft;
}

function readApiError(value: unknown, fallback: string) {
  return isMap(value) && typeof value.error === "string" ? value.error : fallback;
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
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).join(", ");
  if (typeof value === "string") {
    const translated = value.split(",").map((entry) => enumLabel(entry.trim())).join(", ");
    return translated || "—";
  }
  return String(value ?? "—");
}

function descriptionText(value: unknown): string {
  if (typeof value === "string") return value.trim() || "Нет описания";
  if (isMap(value)) {
    const text = Object.values(value).find((entry) => typeof entry === "string" && entry.trim());
    return typeof text === "string" ? text.trim() : "Нет описания";
  }
  return "Нет описания";
}

function signedNumber(value: unknown, suffix = "") {
  if (typeof value !== "number") return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value))}${suffix}`;
}

function signedPercent(value: unknown) {
  return typeof value === "number" ? signedNumber(Math.round(value * 100), "%") : null;
}

function attachmentCondition(value: unknown) {
  if (!isMap(value)) return "Всегда";
  return [
    value.activeOnly === true ? "включён" : null,
    value.inactiveOnly === true ? "выключен" : null,
    value.wieldedOnly === true ? "в упоре" : null,
    value.unwieldedOnly === true ? "с рук" : null,
  ].filter(Boolean).join(", ") || "Всегда";
}

function attachmentModifierRows(modifiers: JsonMap): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [];
  const append = (label: string, value: unknown, condition: string) => {
    if (value !== null && value !== undefined && value !== "") {
      rows.push([condition === "Всегда" ? label : `${label} · ${condition}`, value]);
    }
  };
  for (const raw of Object.values(modifiers)) {
    if (!isMap(raw)) continue;
    const lists = [raw.modifiers, raw.fireModeMods].filter(Array.isArray) as unknown[][];
    if (!lists.length) lists.push([raw]);
    for (const list of lists) {
      for (const entry of list.filter(isMap)) {
        const condition = attachmentCondition(entry.conditions);
        append("Точность", signedPercent(entry.accuracyAddMult), condition);
        append("Урон", signedPercent(entry.damageAddMult), condition);
        append("Падение урона", signedPercent(entry.damageFalloffAddMult), condition);
        append("Разброс", signedNumber(entry.scatterFlat), condition);
        append("Разброс очереди", signedNumber(entry.burstScatterAddMult), condition);
        append("Отдача", signedNumber(entry.recoilFlat), condition);
        append("Задержка выстрела", signedNumber(entry.fireDelayFlat, " с"), condition);
        append("Патронов в очереди", signedNumber(entry.shotsPerBurstFlat), condition);
        append("Скорость ходьбы", signedPercent(entry.walk), condition);
        append("Скорость бега", signedPercent(entry.sprint), condition);
        append("Время вскидывания", signedNumber(entry.delay, " с"), condition);
        append("Размер оружия", signedNumber(entry.size), condition);
        if (isMap(entry.bonusDamage)) {
          const damage = isMap(entry.bonusDamage.types) ? entry.bonusDamage.types : entry.bonusDamage;
          append("Урон в ближнем бою", formatDamage(damage), condition);
        }
        if (entry.extraFireModes != null) append("Добавляет режим", formatValue(entry.extraFireModes), condition);
      }
    }
  }
  return rows;
}

function ammoProviderRows(value: unknown): Array<[string, unknown]> {
  const provider = isMap(value) ? value : {};
  return [
    ["Вместимость", provider.capacity != null ? `${formatNumber(provider.capacity)} шт.` : null],
    ["Боеприпас", provider.proto ? readableId(String(provider.proto)) : null],
    ["Расход за выстрел", provider.fireCost],
  ];
}

function flattenReadable(value: unknown, path: string[] = []): { rows: Array<[string, unknown]>; complex: unknown[] } {
  const rows: Array<[string, unknown]> = [];
  const complex: unknown[] = [];
  if (!isMap(value)) {
    if (Array.isArray(value) && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
      rows.push([path.map(statLabel).join(" · ") || "Значение", value]);
    } else if (["string", "number", "boolean"].includes(typeof value)) {
      rows.push([path.map(statLabel).join(" · ") || "Значение", value]);
    } else if (value != null) complex.push(value);
    return { rows, complex };
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if ((key === "damage" || key === "bonusDamage") && isMap(child)) {
      const damage = isMap(child.types) ? child.types : child;
      rows.push([nextPath.map(statLabel).join(" · "), formatDamage(damage)]);
      continue;
    }
    if (["string", "number", "boolean"].includes(typeof child)) {
      rows.push([nextPath.map(statLabel).join(" · "), formatFieldValue(key, child)]);
      continue;
    }
    if (Array.isArray(child) && child.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
      rows.push([nextPath.map(statLabel).join(" · "), child]);
      continue;
    }
    if (isMap(child)) {
      const nested = flattenReadable(child, nextPath);
      rows.push(...nested.rows);
      complex.push(...nested.complex);
      continue;
    }
    if (child != null) complex.push({ [key]: child });
  }
  return { rows, complex };
}

function formatFieldValue(key: string, value: unknown) {
  if (typeof value !== "number") return value;
  if (/delay|cooldown|doAfter/i.test(key)) return `${formatNumber(value)} с`;
  if (/multiplier|modifier/i.test(key)) return `×${formatNumber(value)}`;
  if (/walk|sprint/i.test(key)) return asPercent(value);
  if (/angle|rotation/i.test(key)) return `${formatNumber(value)}°`;
  if (/range|radius/i.test(key)) return `${formatNumber(value)} тайл.`;
  return value;
}

function statLabel(value: string) {
  const labels: Record<string, string> = {
    wielded: "В упоре", unwielded: "С рук", wieldedOnly: "Только в упоре", unwieldedOnly: "Только с рук",
    activeOnly: "Только во включённом состоянии", inactiveOnly: "Только в выключенном состоянии",
    accuracy: "Точность", wieldedMultiplier: "В упоре", unwieldedMultiplier: "С рук",
    recoilFlat: "Отдача", scatterFlat: "Разброс", accuracyAddMult: "Точность", damageAddMult: "Урон",
    fireDelay: "Задержка между выстрелами", maxScatterModifier: "Максимальный разброс",
    shotsToMaxScatter: "Выстрелов до максимального разброса", unwieldedScatterMultiplier: "Разброс с рук",
    useBurstScatterMult: "Учитывать разброс очереди", falloffMultiplier: "Множитель падения урона",
    attacksPerSecond: "Атак в секунду", angle: "Угол атаки", damage: "Урон", bonusDamage: "Дополнительный урон",
    baseDelay: "Базовая задержка", preventFiring: "Нельзя стрелять во время вскидывания",
    base: "Базовый", light: "Лёгкая броня", medium: "Средняя броня", heavy: "Тяжёлая броня",
    skills: "Навыки", weaponGroup: "Группа оружия", conditions: "Условия", modifiers: "Модификаторы",
    capacity: "Ёмкость", proto: "Боеприпас", cycleable: "Перезаряжается вручную", mayTransfer: "Можно извлечь патроны",
    maxRange: "Дальность", maxDuration: "Длительность", maxIntensity: "Интенсивность",
    FullAuto: "Автоматический", SemiAuto: "Одиночный", Burst: "Очередь",
  };
  return labels[value] || readableId(value);
}

function enumLabel(value: string) {
  return fireModeLabel(value) !== value ? fireModeLabel(value) : ({
    light: "Лёгкий", medium: "Средний", heavy: "Тяжёлый", Handgun: "Пистолет", Rifle: "Винтовка",
    Small: "Маленький", Normal: "Обычный", Large: "Большой", Huge: "Огромный",
  } as Record<string, string>)[value] || slotLabel(value);
}

function fireModeLabel(value: string) {
  return ({ SemiAuto: "Одиночный", Burst: "Очередь", FullAuto: "Автоматический" } as Record<string, string>)[value] || value;
}

function slotLabel(value: string) {
  const labels: Record<string, string> = {
    Back: "Спина", back: "Спина", suitStorage: "Броня", suitstorage: "Броня",
    outerClothing: "Верхняя одежда", head: "Голова", eyes: "Глаза", ears: "Уши", mask: "Маска",
    belt: "Пояс", pocket: "Карман", gloves: "Перчатки", neck: "Шея", shoes: "Обувь", jumpsuit: "Униформа",
  };
  return labels[value] || value;
}

function itemSizeLabel(value: unknown) {
  if (value == null) return null;
  return ({ Tiny: "Крошечный", Small: "Маленький", Normal: "Обычный", Large: "Большой", Huge: "Огромный", Ginormous: "Гигантский" } as Record<string, string>)[String(value)] || String(value);
}

function solutionLabel(value: string) {
  return ({ pen: "Инъектор", drink: "Раствор", pack: "Пакет", food: "Содержимое", tank: "Резервуар" } as Record<string, string>)[value] || readableId(value);
}

function readableId(value: string) {
  const known: Record<string, string> = {
    CMBicaridine: "Бикаридин", CMKelotane: "Келотан", CMTricordrazine: "Трикордразин", CMDexalin: "Дексалин",
    CMDylovene: "Диловен", CMInaprovaline: "Инапровалин", CMEpinephrine: "Эпинефрин", Blood: "Кровь",
    Fiber: "Волокно", RMCSkillFirearms: "Огнестрельное оружие", RMCSkillEngineer: "Инженерия",
    RMCSkillSmartGun: "Умное оружие", RMCSkillPolice: "Военная полиция",
  };
  if (known[value]) return known[value];
  return value.replace(/^RMC|^CM/, "").replace(/([a-zа-я])([A-ZА-Я])/g, "$1 $2").replace(/_/g, " ");
}

function asMultiplier(value: unknown) {
  return typeof value === "number" ? `×${formatNumber(value)}` : null;
}

function asPercent(value: unknown) {
  return typeof value === "number" ? `${formatNumber(value * 100)}%` : null;
}

function formatMovementPenalty(movement: JsonMap) {
  const walk = typeof movement.walkModifier === "number" ? movement.walkModifier : null;
  const sprint = typeof movement.sprintModifier === "number" ? movement.sprintModifier : null;
  if (walk == null && sprint == null) return null;
  const penalty = (value: number) => `${Math.round((1 - value) * 100)}%`;
  if (walk != null && sprint != null && walk === sprint) return `−${penalty(walk)}`;
  return [
    walk != null ? `ходьба −${penalty(walk)}` : null,
    sprint != null ? `бег −${penalty(sprint)}` : null,
  ].filter(Boolean).join(" · ");
}

function itemSizeGenitive(value: string) {
  return ({
    tiny: "крошечного",
    small: "маленького",
    normal: "обычного",
    large: "большого",
    huge: "огромного",
    ginormous: "гигантского",
  } as Record<string, string>)[value.toLocaleLowerCase()] || itemSizeLabel(value) || value;
}

function pluralize(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
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
