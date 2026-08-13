import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { CHEMISTRY_CATALOG_URL, CHEMISTRY_SECTIONS } from "./config";
import {
  buildPreparationPlan,
  craftableReagentIds,
  formatTransferModes,
  tankTransferPortions,
  transferModes,
} from "./planner";
import type {
  ChemistryCatalog,
  ChemistryCatalogEntry,
  ChemistryEffect,
  ChemistryReaction,
  ChemistryReagent,
  ChemistrySectionId,
  PlannedBatch,
  PlannedPreparation,
  PlannerMode,
  PreparationPlan,
} from "./types";

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const metabolismLabels: Record<string, string> = {
  Alcohol: "Алкоголь",
  Drink: "Напиток",
  Food: "Пища",
  Medicine: "Лекарство",
  Narcotic: "Наркотик",
  Poison: "Яд",
};
const effectLabels: Record<string, string> = {
  AdjustReagent: "Изменяет количество реагента",
  Anticorrosive: "Лечит термические повреждения",
  Antihallucinogenic: "Подавляет галлюцинации",
  Antitoxic: "Антитоксический эффект",
  Biocidic: "Воздействует на механические повреждения",
  Electrogenetic: "Усиливает дефибрилляцию",
  Emote: "Вызывает непроизвольную реакцию",
  HealthChange: "Изменяет здоровье",
  Neogenetic: "Лечит механические повреждения",
  Oxygenating: "Восстанавливает кислород",
  SatiateHunger: "Утоляет голод",
  SatiateThirst: "Утоляет жажду",
};

function amount(value: number) {
  return numberFormat.format(value) + "u";
}

function validCatalog(value: unknown): value is ChemistryCatalog {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<ChemistryCatalog>;
  return catalog.schemaVersion === 1
    && Boolean(catalog.reagents)
    && Boolean(catalog.dependencies)
    && Boolean(catalog.reactions)
    && Boolean(catalog.catalogSections)
    && CHEMISTRY_SECTIONS.every((section) => (
      Array.isArray(catalog.catalogSections?.[section.id])
    ));
}

function safeColor(value?: string) {
  if (value && (/^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]+$/i.test(value))) return value;
  return "#426b50";
}

function effectSummary(effect: ChemistryEffect) {
  const type = effect.yamlTag?.replace(/^!type:/, "") || "Дополнительный эффект";
  const value = effect.value ?? {};
  const details: string[] = [];
  for (const key of ["potency", "amount", "probability", "factor", "reagent"]) {
    const field = value[key];
    if (typeof field === "number" || typeof field === "string") {
      details.push(key + ": " + (typeof field === "number" ? numberFormat.format(field) : field));
    }
  }
  return (effectLabels[type] ?? type) + (details.length ? " (" + details.join(", ") + ")" : "");
}

function reactionEquation(reaction: ChemistryReaction) {
  const side = (items: ChemistryReaction["reactants"]) => items
    .map((item) => amount(item.amount) + " " + (item.name || item.id))
    .join(" + ");
  return side(reaction.reactants) + " → " + side(reaction.products);
}

function ReagentCard({
  entry,
  reagent,
  reactions,
}: {
  entry: ChemistryCatalogEntry;
  reagent?: ChemistryReagent;
  reactions: ChemistryReaction[];
}) {
  const properties = reagent?.properties;
  const metabolisms = Object.entries(properties?.metabolisms ?? {});
  const style = { "--reagent-color": safeColor(properties?.color) } as CSSProperties;
  return (
    <details className="chem-reagent-card" style={style}>
      <summary>
        <span className="chem-reagent-color" aria-hidden="true" />
        <span className="chem-reagent-heading">
          <strong>{entry.name || reagent?.name || entry.id}</strong>
          <code>{entry.id}</code>
        </span>
        <span className="chem-reagent-origin">
          {entry.origin === "stories" ? "STORIES" : entry.origin.toUpperCase()}
        </span>
        <span className="chem-reagent-arrow" aria-hidden="true">⌄</span>
      </summary>
      <div className="chem-reagent-body">
        <p>{reagent?.description || "Нет описания реагента."}</p>
        {(properties?.overdose !== undefined || properties?.criticalOverdose !== undefined) && (
          <div className="chem-dose-row">
            {properties.overdose !== undefined && <span>Передозировка: {amount(properties.overdose)}</span>}
            {properties.criticalOverdose !== undefined && (
              <span className="is-critical">Критическая: {amount(properties.criticalOverdose)}</span>
            )}
          </div>
        )}
        {reactions.length > 0 && (
          <section className="chem-card-section">
            <h4>{reactions.length > 1 ? "Рецепты" : "Рецепт"}</h4>
            {reactions.map((reaction) => (
              <div className="chem-equation" key={reaction.id}>
                <code>{reactionEquation(reaction)}</code>
                {reaction.conditions?.minTemp !== undefined && (
                  <small>Минимальная температура: {numberFormat.format(reaction.conditions.minTemp)} K</small>
                )}
              </div>
            ))}
          </section>
        )}
        {metabolisms.length > 0 && (
          <section className="chem-card-section">
            <h4>Воздействие</h4>
            {metabolisms.map(([metabolismId, metabolism]) => (
              <div className="chem-metabolism" key={metabolismId}>
                <strong>{metabolismLabels[metabolismId] ?? metabolismId}</strong>
                {metabolism.metabolismRate !== undefined && (
                  <small>Скорость: {numberFormat.format(metabolism.metabolismRate)}u/с</small>
                )}
                {(metabolism.effects ?? []).map((effect, index) => (
                  <span key={(effect.yamlTag ?? "effect") + "-" + index}>{effectSummary(effect)}</span>
                ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}

function InputInstruction({ batch, inputIndex }: { batch: PlannedBatch; inputIndex: number }) {
  const input = batch.inputs[inputIndex];
  const prepared = input.prepared ? "приготовленный " : "";
  if (batch.vessel === "tank") {
    const portions = tankTransferPortions(input.amount);
    const transfers = portions.map((portion, index) => (
      (index + 1) + ") " + amount(portion.amount) + " [" + formatTransferModes(portion.modes) + "]"
    ));
    return (
      <li>
        Выберите {prepared}<strong>{input.name}</strong> в химмастере. Наполните 100u-мензурку
        и вылейте её в бак: {transfers.join("; ")}.
      </li>
    );
  }
  const occupiedBefore = batch.inputs
    .slice(0, inputIndex)
    .reduce((total, current) => total + current.amount, 0);
  const modes = transferModes(input.amount, batch.capacity - occupiedBefore);
  return (
    <li>
      В химмастере выберите {prepared}<strong>{input.name}</strong> и перенесите {amount(input.amount)}:
      <code className="chem-mode-sequence">{formatTransferModes(modes)}</code>
    </li>
  );
}

function PreparationBlock({
  preparation,
  root = false,
  depth = 0,
}: {
  preparation: PlannedPreparation;
  root?: boolean;
  depth?: number;
}) {
  return (
    <section className={"chem-preparation depth-" + Math.min(depth, 3)}>
      <header>
        <div>
          <span>{root ? "ЦЕЛЕВОЙ СОСТАВ" : "ПРОМЕЖУТОЧНЫЙ РЕАГЕНТ"}</span>
          <h3>{preparation.name}</h3>
        </div>
        <div className="chem-preparation-amount">
          <strong>{amount(preparation.producedAmount)}</strong>
          {preparation.surplusAmount > 0 && <small>излишек {amount(preparation.surplusAmount)}</small>}
        </div>
      </header>
      {preparation.preparations.length > 0 && (
        <div className="chem-nested-preparations">
          <p>Сначала подготовьте общий запас промежуточных реагентов:</p>
          {preparation.preparations.map((nested) => (
            <PreparationBlock
              preparation={nested}
              depth={depth + 1}
              key={preparation.reagentId + ":" + nested.reagentId + ":preparation"}
            />
          ))}
        </div>
      )}
      {preparation.batches.map((batch) => (
        <article className="chem-batch" key={batch.key}>
          <h4>
            {batch.vessel === "tank"
              ? "Приготовление в баке"
              : "Мензурка " + batch.batchNumber + " из " + batch.batchCount}
            <span>{amount(batch.targetAmount)} {preparation.name}</span>
          </h4>
          <ol>
            <li>
              {batch.vessel === "tank"
                ? "Подготовьте пустой бак. Его нельзя вставить в химмастер: каждый реагент переносится через отдельную 100u-мензурку."
                : "Возьмите чистую мензурку на 100u и установите её в химмастер."}
            </li>
            {batch.inputs.map((input, inputIndex) => (
              <InputInstruction batch={batch} inputIndex={inputIndex} key={batch.key + ":" + input.reagentId} />
            ))}
            {batch.minTemperature !== undefined && (
              <li>Нагрейте смесь минимум до <strong>{numberFormat.format(batch.minTemperature)} K</strong>.</li>
            )}
            <li>
              Получится <strong>{amount(batch.targetAmount)} {preparation.name}</strong>
              {batch.byproducts.length > 0 && (
                <> и {batch.byproducts.map((item) => amount(item.amount) + " " + item.name).join(", ")}</>
              )}.
              {!root && " Загрузите результат в буфер химмастера для следующего этапа."}
            </li>
          </ol>
          {batch.warnings.map((warning) => (
            <p className="chem-reaction-warning" key={warning}>ВНИМАНИЕ // {warning}</p>
          ))}
        </article>
      ))}
    </section>
  );
}

function Planner({ catalog }: { catalog: ChemistryCatalog }) {
  const craftableIds = useMemo(() => craftableReagentIds(catalog), [catalog]);
  const reagents = useMemo(() => ({ ...catalog.dependencies, ...catalog.reagents }), [catalog]);
  const [reagentId, setReagentId] = useState(
    craftableIds.includes("CMBicaridine") ? "CMBicaridine" : craftableIds[0] ?? "",
  );
  const [requestedAmount, setRequestedAmount] = useState(100);
  const [mode, setMode] = useState<PlannerMode>("beakers");
  const [plan, setPlan] = useState<PreparationPlan | null>(null);
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      setPlan(buildPreparationPlan(catalog, reagentId, requestedAmount, mode));
      setError("");
    } catch (caught) {
      setPlan(null);
      setError(caught instanceof Error ? caught.message : "Не удалось построить план.");
    }
  };

  return (
    <div className="chem-planner">
      <form className="chem-planner-form" onSubmit={submit}>
        <label>
          <span>Вещество</span>
          <select value={reagentId} onChange={(event) => setReagentId(event.target.value)}>
            {craftableIds.map((id) => <option value={id} key={id}>{reagents[id]?.name ?? id}</option>)}
          </select>
        </label>
        <label>
          <span>Требуемый объём</span>
          <span className="chem-amount-input">
            <input
              type="number"
              min="1"
              step="1"
              value={requestedAmount}
              onChange={(event) => setRequestedAmount(Number(event.target.value))}
            />
            <b>u</b>
          </span>
        </label>
        <fieldset>
          <legend>Режим приготовления</legend>
          <label>
            <input type="radio" name="planner-mode" checked={mode === "beakers"} onChange={() => setMode("beakers")} />
            <span><strong>Мензурки</strong><small>Порции по 100u</small></span>
          </label>
          <label>
            <input type="radio" name="planner-mode" checked={mode === "tank"} onChange={() => setMode("tank")} />
            <span><strong>Бак</strong><small>До 1000u, заливка через мензурки</small></span>
          </label>
        </fieldset>
        <button type="submit">[ ПОСТРОИТЬ МАРШРУТ ]</button>
      </form>

      <aside className="chem-planner-note">
        <strong>РЕЖИМЫ ХИММАСТЕРА</strong>
        <span>1 · 5 · 10 · 15 · 20 · 25 · 30 · 50 · 100 · ALL</span>
        <p>ALL заполняет оставшийся объём 100u-мензурки. План использует его только при точной дозировке.</p>
      </aside>

      {error && <div className="chem-status is-error">{error}</div>}
      {plan && (
        <div className="chem-plan-result">
          <header className="chem-plan-summary">
            <div><span>ЗАПРОШЕНО</span><strong>{amount(plan.requestedAmount)}</strong></div>
            <div><span>БУДЕТ ПОЛУЧЕНО</span><strong>{amount(plan.producedAmount)}</strong></div>
            <div><span>ИЗЛИШЕК</span><strong>{amount(plan.surplusAmount)}</strong></div>
            <div><span>ФИНАЛЬНЫХ ПОРЦИЙ</span><strong>{plan.target.batches.length}</strong></div>
          </header>
          <section className="chem-source-totals">
            <h3>Всего исходных реагентов</h3>
            <div>
              {plan.sourceTotals.map((source) => (
                <span key={source.reagentId}><strong>{amount(source.amount)}</strong> {source.name}</span>
              ))}
            </div>
            <p>Исходными считаются элементы, вода и вещества без производящего рецепта. Некоторые потребуется получить вне химмастера.</p>
          </section>
          <PreparationBlock preparation={plan.target} root />
        </div>
      )}
    </div>
  );
}

function Catalog({ catalog }: { catalog: ChemistryCatalog }) {
  const [sectionId, setSectionId] = useState<ChemistrySectionId>("ordnance");
  const [query, setQuery] = useState("");
  const reagents = useMemo(() => ({ ...catalog.dependencies, ...catalog.reagents }), [catalog]);
  const reactionIndex = useMemo(() => {
    const index = new Map<string, ChemistryReaction[]>();
    for (const reaction of Object.values(catalog.reactions)) {
      for (const product of reaction.products) {
        const current = index.get(product.id) ?? [];
        current.push(reaction);
        index.set(product.id, current);
      }
    }
    return index;
  }, [catalog]);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const entries = catalog.catalogSections[sectionId].filter((entry) => {
    if (!normalizedQuery) return true;
    const reagent = reagents[entry.id];
    return [entry.id, entry.name, reagent?.name, reagent?.description, ...entry.sectionPath]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedQuery);
  });
  const grouped = entries.reduce((groups, entry) => {
    const key = entry.sectionPath.join(" / ") || "Без раздела";
    const current = groups.get(key) ?? [];
    current.push(entry);
    groups.set(key, current);
    return groups;
  }, new Map<string, ChemistryCatalogEntry[]>());

  return (
    <div className="chem-catalog">
      <label className="chem-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, описание или ID реагента…" />
        <small>{entries.length} из {catalog.catalogSections[sectionId].length}</small>
      </label>
      <div className="chem-section-tabs" role="tablist" aria-label="Разделы химии">
        {CHEMISTRY_SECTIONS.map((section) => (
          <button
            type="button"
            role="tab"
            aria-selected={section.id === sectionId}
            onClick={() => setSectionId(section.id)}
            key={section.id}
          >
            {section.label}<span>{catalog.catalogSections[section.id].length}</span>
          </button>
        ))}
      </div>
      <div className="chem-catalog-results">
        {[...grouped.entries()].map(([groupName, groupEntries]) => (
          <section className="chem-reagent-group" key={groupName}>
            <header><h2>{groupName}</h2><span>{groupEntries.length}</span></header>
            <div>
              {groupEntries.map((entry) => (
                <ReagentCard
                  entry={entry}
                  reagent={reagents[entry.id]}
                  reactions={reactionIndex.get(entry.id) ?? []}
                  key={entry.id}
                />
              ))}
            </div>
          </section>
        ))}
        {entries.length === 0 && <div className="chem-status">По этому запросу ничего не найдено.</div>}
      </div>
    </div>
  );
}

export function ChemistryPage() {
  const [catalog, setCatalog] = useState<ChemistryCatalog | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"catalog" | "planner">("catalog");

  useEffect(() => {
    const controller = new AbortController();
    fetch(CHEMISTRY_CATALOG_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        const value: unknown = await response.json();
        if (!validCatalog(value)) throw new Error("Неизвестная схема chemistry catalog");
        setCatalog(value);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные.");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="chemistry-page">
      <header className="chemistry-hero">
        <div>
          <p className="eyebrow">CHEMISTRY NODE // CHM-06</p>
          <h1>Химический каталог</h1>
          <p>Реагенты, реакции и точный маршрут приготовления из актуальных игровых прототипов.</p>
        </div>
        {catalog && (
          <dl>
            <div><dt>Реагентов</dt><dd>{catalog.counts.customReagents}</dd></div>
            <div><dt>Реакций</dt><dd>{catalog.counts.customReactions}</dd></div>
            <div><dt>Commit</dt><dd>{catalog.source.commit.slice(0, 8)}</dd></div>
          </dl>
        )}
      </header>
      <nav className="chemistry-view-tabs" aria-label="Режим химического модуля">
        <button type="button" className={view === "catalog" ? "is-active" : ""} onClick={() => setView("catalog")}>Каталог реагентов</button>
        <button type="button" className={view === "planner" ? "is-active" : ""} onClick={() => setView("planner")}>Планировщик приготовления</button>
      </nav>
      {!catalog && !error && <div className="chem-status">Подключение к химической базе данных…</div>}
      {error && <div className="chem-status is-error">Каталог не загрузился: {error}</div>}
      {catalog && view === "catalog" && <Catalog catalog={catalog} />}
      {catalog && view === "planner" && <Planner catalog={catalog} />}
    </main>
  );
}
