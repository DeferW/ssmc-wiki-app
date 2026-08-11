import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";

const DATA_URL =
  "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/equipment-catalog.json";

type TradeEntry = {
  key: string;
  vendorId: string;
  sectionKey: string;
  sectionName: string;
  position: number;
  itemId: string;
  name: string;
  amount?: number;
  spawn?: number;
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  types?: string[];
  tags?: string[];
  properties?: Record<string, unknown>;
  directlyVended?: boolean;
  reachableFromVendors?: string[];
};

type Relation = {
  from: string;
  to: string;
  type: string;
  quantity?: number;
};

type Catalog = {
  gameCommit: string;
  source: string;
  tradeEntries: TradeEntry[];
  items: Record<string, CatalogItem>;
  relations: Relation[];
  counts: {
    vendors: number;
    sections: number;
    tradeEntries: number;
    catalogItems: number;
    relations: number;
  };
};

const modules = [
  {
    slug: "equipment",
    title: "Снаряжение",
    text: "Каталог товаров из автоматов: оружие, боеприпасы, обвесы и содержимое кейсов.",
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

const demoCatalog: Catalog = {
  gameCommit: "demo",
  source: "Локальный демонстрационный набор",
  counts: { vendors: 3, sections: 3, tradeEntries: 4, catalogItems: 4, relations: 1 },
  tradeEntries: [
    { key: "demo:0", vendorId: "ColMarTechCargoGuns", sectionKey: "guns", sectionName: "Основное оружие", position: 0, itemId: "DemoRifle", name: "штурмовая винтовка M54C", amount: 12 },
    { key: "demo:1", vendorId: "ColMarTechCargoGuns", sectionKey: "guns", sectionName: "Вторичное оружие", position: 1, itemId: "DemoPistol", name: "боевой пистолет M1984", amount: 20 },
    { key: "demo:2", vendorId: "ColMarTechCargoAmmo", sectionKey: "ammo", sectionName: "Обычные боеприпасы", position: 0, itemId: "DemoMagazine", name: "магазин M54C", amount: 40 },
    { key: "demo:3", vendorId: "ColMarTechCargoAttachments", sectionKey: "attachments", sectionName: "Обвесы", position: 0, itemId: "DemoScope", name: "оптический прицел", amount: 8 },
  ],
  items: {
    DemoRifle: { id: "DemoRifle", name: "штурмовая винтовка M54C", description: "Демонстрационная карточка оружия.", types: ["weapon"], tags: ["rifle"], directlyVended: true },
    DemoPistol: { id: "DemoPistol", name: "боевой пистолет M1984", description: "Демонстрационная карточка пистолета.", types: ["weapon"], tags: ["pistol"], directlyVended: true },
    DemoMagazine: { id: "DemoMagazine", name: "магазин M54C", description: "Демонстрационная карточка магазина.", types: ["magazine"], directlyVended: true },
    DemoScope: { id: "DemoScope", name: "оптический прицел", description: "Демонстрационная карточка обвеса.", types: ["attachment"], directlyVended: true },
  },
  relations: [{ from: "DemoRifle", to: "DemoMagazine", type: "loadedWith", quantity: 1 }],
};

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
  const [loadState, setLoadState] = useState<"loading" | "live" | "demo">("loading");
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("all");
  const [section, setSection] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        setCatalog(demoCatalog);
        setLoadState("demo");
      });
    return () => controller.abort();
  }, []);

  const vendors = useMemo(
    () => [...new Set(catalog?.tradeEntries.map((entry) => entry.vendorId) ?? [])],
    [catalog],
  );

  const sections = useMemo(
    () => [...new Set((catalog?.tradeEntries ?? [])
      .filter((entry) => vendor === "all" || entry.vendorId === vendor)
      .map((entry) => entry.sectionName))],
    [catalog, vendor],
  );

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return (catalog?.tradeEntries ?? []).filter((entry) => {
      const item = catalog?.items[entry.itemId];
      const matchesQuery = !normalized || [entry.name, entry.itemId, item?.description]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ru").includes(normalized));
      return matchesQuery
        && (vendor === "all" || entry.vendorId === vendor)
        && (section === "all" || entry.sectionName === section);
    });
  }, [catalog, query, vendor, section]);

  const selectedItem = selectedId && catalog ? catalog.items[selectedId] : null;
  const selectedRelations = selectedId && catalog
    ? catalog.relations.filter((relation) => relation.from === selectedId || relation.to === selectedId)
    : [];

  return (
    <main className="page catalog-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Рабочий раздел</p>
          <h1>Каталог снаряжения</h1>
          <p>Данные загружаются напрямую из последней успешной сборки `ssmc-wiki-data`.</p>
        </div>
        {catalog && (
          <dl className="stats">
            <div><dt>Позиции</dt><dd>{catalog.counts.tradeEntries}</dd></div>
            <div><dt>Предметы</dt><dd>{catalog.counts.catalogItems}</dd></div>
            <div><dt>Связи</dt><dd>{catalog.counts.relations}</dd></div>
          </dl>
        )}
      </div>

      {loadState === "loading" && <p className="notice">Загружаю актуальный каталог…</p>}
      {loadState === "demo" && (
        <p className="notice warning">
          Не удалось получить живые данные. Показан маленький демонстрационный набор.
        </p>
      )}

      {catalog && (
        <>
          <section className="filters" aria-label="Фильтры каталога">
            <label>
              Поиск
              <input
                type="search"
                placeholder="Название, описание или ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              Автомат
              <select value={vendor} onChange={(event) => { setVendor(event.target.value); setSection("all"); }}>
                <option value="all">Все автоматы</option>
                {vendors.map((id) => <option value={id} key={id}>{vendorLabel(id)}</option>)}
              </select>
            </label>
            <label>
              Раздел
              <select value={section} onChange={(event) => setSection(event.target.value)}>
                <option value="all">Все разделы</option>
                {sections.map((name) => <option value={name} key={name}>{name}</option>)}
              </select>
            </label>
          </section>

          <div className="results-line">Найдено: {visibleEntries.length}</div>
          <section className="equipment-grid" aria-live="polite">
            {visibleEntries.slice(0, 120).map((entry) => {
              const item = catalog.items[entry.itemId];
              return (
                <button className="equipment-card" key={entry.key} onClick={() => setSelectedId(entry.itemId)}>
                  <span className="equipment-section">{entry.sectionName}</span>
                  <strong>{entry.name || item?.name || entry.itemId}</strong>
                  <span className="equipment-id">{entry.itemId}</span>
                  <span className="equipment-meta">В автомате: {entry.amount ?? "—"}</span>
                </button>
              );
            })}
          </section>
          {visibleEntries.length > 120 && (
            <p className="notice">В макете показаны первые 120 результатов. Позже добавим нормальную пагинацию.</p>
          )}
        </>
      )}

      {selectedItem && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedId(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Карточка предмета" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setSelectedId(null)} aria-label="Закрыть">×</button>
            <p className="eyebrow">{selectedItem.types?.join(" · ") || "предмет"}</p>
            <h2>{selectedItem.name}</h2>
            <code>{selectedItem.id}</code>
            <p>{selectedItem.description || "Описание пока отсутствует в локализации."}</p>
            <h3>Связи</h3>
            {selectedRelations.length ? (
              <ul className="relations">
                {selectedRelations.map((relation, index) => (
                  <li key={`${relation.from}:${relation.type}:${relation.to}:${index}`}>
                    <span>{relation.from === selectedItem.id ? "Содержит / использует" : "Входит в / используется"}</span>
                    <strong>{relation.from === selectedItem.id ? relation.to : relation.from}</strong>
                    <small>{relation.type}{relation.quantity ? ` × ${relation.quantity}` : ""}</small>
                  </li>
                ))}
              </ul>
            ) : <p>Для этого предмета прямых связей не найдено.</p>}
            <p className="drawer-note">Подробные характеристики и спрайт добавим после утверждения структуры карточки.</p>
          </aside>
        </div>
      )}
    </main>
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

function vendorLabel(id: string) {
  if (id.includes("Guns")) return "Вооружение";
  if (id.includes("Ammo")) return "Боеприпасы";
  if (id.includes("Attachments")) return "Обвесы";
  return id;
}

export default App;
