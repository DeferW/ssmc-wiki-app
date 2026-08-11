import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";

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
  properties?: Record<string, unknown>;
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
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

  const visibleIds = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return publicIds.filter((id) => {
      const item = catalog?.items[id];
      if (!item) return false;
      const matchesQuery = !normalized || [item.name, item.description, id]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ru").includes(normalized));
      return matchesQuery && (category === "all" || item.category === category);
    });
  }, [catalog, publicIds, query, category]);

  const selectedItem = selectedId && catalog ? catalog.items[selectedId] : null;
  const selectedRelations = selectedId && catalog
    ? catalog.relations.filter((relation) => relation.from === selectedId || relation.to === selectedId)
    : [];

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
          <section className="filters" aria-label="Фильтры каталога">
            <label>
              Поиск
              <input
                type="search"
                placeholder="Название или описание"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              Категория
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">Все категории</option>
                {categories.map((name) => <option value={name} key={name}>{name}</option>)}
              </select>
            </label>
          </section>

          <div className="results-line">Найдено: {visibleIds.length}</div>
          <section className="equipment-grid" aria-live="polite">
            {visibleIds.map((id) => {
              const item = catalog.items[id];
              return (
                <button className="equipment-card" key={id} onClick={() => setSelectedId(id)}>
                  <span className="equipment-section">{item.category || "Снаряжение"}</span>
                  <Sprite item={item} />
                  <strong>{capitalizeName(item.name)}</strong>
                </button>
              );
            })}
          </section>
          {!visibleIds.length && <p className="empty-state">Ничего не найдено. Даже подозрительного ящика.</p>}
        </>
      )}

      {selectedItem && catalog && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedId(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Карточка предмета" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setSelectedId(null)} aria-label="Закрыть">×</button>
            <div className="drawer-sprite"><Sprite item={selectedItem} /></div>
            <p className="eyebrow">{selectedItem.category || "Снаряжение"}</p>
            <h2>{capitalizeName(selectedItem.name)}</h2>
            <p>{selectedItem.description || "Описание пока отсутствует в локализации."}</p>
            <h3>Связи</h3>
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
            ) : <p>Для этого предмета прямых связей не найдено.</p>}
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
