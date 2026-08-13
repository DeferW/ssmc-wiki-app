import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CHEMISTRY_CATALOG_URL, CHEMISTRY_SECTIONS } from "./config";
import { describeEffect, describePlantEffect, type EffectDescription, type EffectTier } from "./effects";
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
  Gas: "Газ",
  Medicine: "Лекарство",
  Narcotic: "Наркотик",
  Poison: "Яд",
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

const semanticPattern = /(полностью лечит|лечит|восстанавливает|возвращает|омолаживает|сокращает|удаляет|создаёт иммунитет|дополнительно наносит|наносит|вызывает|заражает|поджигает|уничтожает|расходует|замедляет|ожогового(?: урона)?|термического(?: урона)?|механического(?: урона)?|тупого(?: урона)?|колотого(?: урона)?|режущего(?: урона)?|токсического(?: урона)?|кислотного(?: урона)?|генетического(?: урона)?|клеточного(?: урона)?|радиационного(?: урона)?)/gi;

function semanticClass(token: string) {
  const value = token.toLocaleLowerCase("ru-RU");
  if (/лечит|восстанавливает|возвращает|омолаживает|сокращает|удаляет|иммунитет/.test(value)) return "is-beneficial";
  if (/наносит|вызывает|заражает|поджигает|уничтожает/.test(value)) return "is-harmful";
  if (/ожог|термическ/.test(value)) return "is-burn";
  if (/расходует|замедляет/.test(value)) return "is-warning";
  return "is-damage";
}

function HighlightedEffect({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(new RegExp(semanticPattern.source, semanticPattern.flags))) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(<mark className={semanticClass(match[0])} key={index + ":" + match[0]}>{match[0]}</mark>);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

const tierLabels: Record<EffectTier, string> = {
  normal: "Обычное воздействие",
  overdose: "Передозировка",
  critical: "Критическая передозировка",
};

function EffectTierBlock({ tier, effects, reagent }: { tier: EffectTier; effects: EffectDescription[]; reagent: ChemistryReagent }) {
  const threshold = tier === "overdose" ? reagent.properties?.overdose : tier === "critical" ? reagent.properties?.criticalOverdose : undefined;
  const normalLimit = tier === "normal" ? reagent.properties?.overdose : undefined;
  return (
    <div className={`chem-effect-tier is-${tier}`}>
      <header>
        <strong>{tierLabels[tier]}</strong>
        {threshold !== undefined && <span>от {amount(threshold)}</span>}
        {normalLimit !== undefined && <span>до {amount(normalLimit)}</span>}
      </header>
      {effects.length > 0 ? (
        <ul>{effects.map((effect, index) => (
          <li className={`is-${effect.tone}`} key={effect.text + index}><HighlightedEffect text={effect.text} /></li>
        ))}</ul>
      ) : <p>Дополнительного воздействия не обнаружено.</p>}
    </div>
  );
}

function ReactionSide({ items, onNavigate }: { items: ChemistryReaction["reactants"]; onNavigate: (id: string) => void }) {
  return <div className="chem-reaction-side">{items.map((item) => (
    <button type="button" onClick={() => onNavigate(item.id)} title={`Открыть «${item.name || item.id}»`} key={item.id}>
      <span className="chem-reaction-amount">{amount(item.amount)}</span>
      <span>{item.name || item.id}</span>
    </button>
  ))}</div>;
}

function reactionEffectSummary(reaction: ChemistryReaction) {
  return (reaction.effects ?? []).map((effect) => {
    const type = effect.yamlTag?.replace(/^!type:/, "");
    const value = effect.value ?? {};
    if (type === "SensitiveReactionExplosionEffect") return `Взрыв при объёме от ${amount(Number(value.threshold ?? 0))}; интенсивность за единицу: ${numberFormat.format(Number(value.intensityPerUnit ?? 0))}.`;
    if (type === "ExplosionReactionEffect") return `Вызывает взрыв; интенсивность за единицу: ${numberFormat.format(Number(value.intensityPerUnit ?? 0))}.`;
    if (type === "AreaReactionEffect") return `Создаёт эффект в области${value.duration ? ` на ${numberFormat.format(Number(value.duration))} сек.` : "."}`;
    if (type === "CreateEntityReactionEffect") return `Создаёт объект: ${value.entity ?? "неизвестно"}.`;
    return type ? `Дополнительный эффект реакции: ${type}.` : "";
  }).filter(Boolean);
}

function ReagentCard({
  entry,
  reagent,
  reactions,
  onNavigate,
}: {
  entry: ChemistryCatalogEntry;
  reagent?: ChemistryReagent;
  reactions: ChemistryReaction[];
  onNavigate: (id: string) => void;
}) {
  const properties = reagent?.properties;
  const metabolisms = Object.entries(properties?.metabolisms ?? {});
  const style = { "--reagent-color": safeColor(properties?.color) } as CSSProperties;
  const effectGroups = metabolisms.map(([metabolismId, metabolism]) => {
    const descriptions = (metabolism.effects ?? []).flatMap((effect) => describeEffect(effect, reagent ?? { id: entry.id, name: entry.name, origin: entry.origin }));
    return { metabolismId, metabolism, descriptions };
  });
  const plantEffects = (properties?.plantMetabolism ?? []).map(describePlantEffect).filter((effect): effect is EffectDescription => Boolean(effect));
  return (
    <details className="chem-reagent-card" style={style} data-reagent-id={entry.id}>
      <summary>
        <span className="chem-reagent-color" aria-hidden="true" />
        <span className="chem-reagent-heading">
          <strong>{entry.name || reagent?.name || entry.id}</strong>
          <code>{entry.id}</code>
        </span>
        <span className="chem-reagent-origin">
          {entry.origin === "stories" ? "STORIES" : entry.origin.toUpperCase()}
        </span>
      </summary>
      <div className="chem-reagent-body">
        <p>{reagent?.description || "Нет описания реагента."}</p>
        {(properties?.overdose !== undefined || properties?.criticalOverdose !== undefined) && (
          <div className="chem-dose-scale">
            {properties.overdose !== undefined && <span className="is-normal">Обычная доза: до {amount(properties.overdose)}</span>}
            {properties.overdose !== undefined && <span>Передозировка: от {amount(properties.overdose)}</span>}
            {properties.criticalOverdose !== undefined && (
              <span className="is-critical">Критическая передозировка: от {amount(properties.criticalOverdose)}</span>
            )}
          </div>
        )}
        {reactions.length > 0 && (
          <section className="chem-card-section">
            <h4>{reactions.length > 1 ? "Рецепты" : "Рецепт"}</h4>
            {reactions.map((reaction) => (
              <div className="chem-equation" key={reaction.id}>
                <div className="chem-reaction-labels"><span>Смешать</span><span>Получится</span></div>
                <div className="chem-reaction-flow">
                  <ReactionSide items={reaction.reactants} onNavigate={onNavigate} />
                  <span className="chem-reaction-separator">→</span>
                  <ReactionSide items={reaction.products} onNavigate={onNavigate} />
                </div>
                {reaction.conditions?.minTemp !== undefined && (
                  <small>Нагреть минимум до {numberFormat.format(reaction.conditions.minTemp)} K</small>
                )}
                {reactionEffectSummary(reaction).map((warning) => <p className="chem-recipe-warning" key={warning}>{warning}</p>)}
              </div>
            ))}
          </section>
        )}
        {metabolisms.length > 0 && (
          <section className="chem-card-section">
            <h4>Воздействие</h4>
            {effectGroups.map(({ metabolismId, metabolism, descriptions }) => (
              <div className="chem-metabolism" key={metabolismId}>
                <header><strong>{metabolismLabels[metabolismId] ?? metabolismId}</strong>
                {metabolism.metabolismRate !== undefined && (
                  <small>Расход организмом: {numberFormat.format(metabolism.metabolismRate)}u/с</small>
                )}</header>
                {(["normal", "overdose", "critical"] as EffectTier[]).filter((tier) => (
                  tier === "normal"
                  || descriptions.some((effect) => effect.tier === tier)
                  || (tier === "overdose" && properties?.overdose !== undefined)
                  || (tier === "critical" && properties?.criticalOverdose !== undefined)
                )).map((tier) => (
                  <EffectTierBlock tier={tier} effects={descriptions.filter((effect) => effect.tier === tier)} reagent={reagent!} key={tier} />
                ))}
              </div>
            ))}
          </section>
        )}
        {plantEffects.length > 0 && (
          <section className="chem-card-section">
            <h4>Метаболизм растений</h4>
            <div className="chem-metabolism chem-plant-metabolism">
              <header><strong>Воздействие на растение</strong><small>Базово: 1u каждые 3 секунды</small></header>
              <ul className="chem-plant-effects">{plantEffects.map((effect, index) => (
                <li className={`is-${effect.tone}`} key={effect.text + index}><HighlightedEffect text={effect.text} /></li>
              ))}</ul>
            </div>
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
  const [spotlightEntry, setSpotlightEntry] = useState<ChemistryCatalogEntry | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{ id: string } | null>(null);
  const reagents = useMemo(() => ({ ...catalog.dependencies, ...catalog.reagents }), [catalog]);
  const sectionByReagent = useMemo(() => {
    const index = new Map<string, ChemistrySectionId>();
    for (const section of CHEMISTRY_SECTIONS) {
      for (const entry of catalog.catalogSections[section.id]) index.set(entry.id, section.id);
    }
    return index;
  }, [catalog]);
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
  const entries = spotlightEntry ? [spotlightEntry] : catalog.catalogSections[sectionId].filter((entry) => {
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

  useEffect(() => {
    if (!pendingNavigation) return;
    const card = [...document.querySelectorAll<HTMLElement>("[data-reagent-id]")]
      .find((element) => element.dataset.reagentId === pendingNavigation.id);
    if (!card) return;
    if (card instanceof HTMLDetailsElement) card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }, [pendingNavigation, sectionId, spotlightEntry]);

  const navigateToReagent = (id: string) => {
    const section = sectionByReagent.get(id);
    setQuery("");
    if (section) {
      setSpotlightEntry(null);
      setSectionId(section);
    } else {
      const reagent = reagents[id];
      if (!reagent) return;
      setSpotlightEntry({
        id,
        name: reagent.name || id,
        origin: reagent.origin,
        sectionPath: ["Компонент рецепта"],
      });
    }
    setPendingNavigation({ id });
  };

  const selectSection = (id: ChemistrySectionId) => {
    setSpotlightEntry(null);
    setPendingNavigation(null);
    setSectionId(id);
  };

  return (
    <div className="chem-catalog">
      <label className="chem-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => { setSpotlightEntry(null); setQuery(event.target.value); }} placeholder="Название, описание или ID реагента…" />
        <small>{entries.length} из {spotlightEntry ? 1 : catalog.catalogSections[sectionId].length}</small>
      </label>
      <div className="chem-section-tabs" role="tablist" aria-label="Разделы химии">
        {CHEMISTRY_SECTIONS.map((section) => (
          <button
            type="button"
            role="tab"
            aria-selected={section.id === sectionId}
            onClick={() => selectSection(section.id)}
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
                  onNavigate={navigateToReagent}
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
