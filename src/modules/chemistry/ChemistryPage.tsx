import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchRemoteJson } from "../../data/remoteJson";
import { CHEMISTRY_CATALOG_URL, CHEMISTRY_SECTIONS } from "./config";
import { describeEffect, describePlantEffect, type EffectDescription, type EffectTier } from "./effects";
import { formatReagentName } from "./format";
import {
  BEAKER_CAPACITIES,
  buildMixturePlan,
  buildPreparationPlan,
  craftableReagentIds,
  MEDICAL_VENDOR_CONTAINER_CAPACITY,
  MEDICAL_VENDOR_REAGENTS,
  MEDICAL_VENDOR_TRANSFER_AMOUNTS,
  transferLoads,
  MIXTURE_PRESETS,
} from "./planner";
import type { MixturePreset } from "./planner";
import type {
  BeakerCapacity,
  ChemistryCatalog,
  ChemistryCatalogEntry,
  ChemistryReaction,
  ChemistryReagent,
  ChemistrySectionId,
  PlannedBatch,
  PlannedPreparation,
  PreparationPlan,
} from "./types";
import { readChemistryUrlState, updateChemistryUrl } from "./urlState";

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

function countLabel(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = value % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
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
    <button type="button" onClick={() => onNavigate(item.id)} title={`Открыть «${formatReagentName(item.name, item.id)}»`} key={item.id}>
      <span className="chem-reaction-amount">{amount(item.amount)}</span>
      <span>{formatReagentName(item.name, item.id)}</span>
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
  onOpenChange,
}: {
  entry: ChemistryCatalogEntry;
  reagent?: ChemistryReagent;
  reactions: ChemistryReaction[];
  onNavigate: (id: string) => void;
  onOpenChange: (id: string, open: boolean) => void;
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
    <details
      className="chem-reagent-card"
      style={style}
      data-reagent-id={entry.id}
    >
      <summary onClick={(event) => {
        const details = event.currentTarget.closest("details") as HTMLDetailsElement | null;
        onOpenChange(entry.id, !details?.open);
      }}>
        <span className="chem-reagent-color" aria-hidden="true" />
        <span className="chem-reagent-heading">
          <strong>{formatReagentName(entry.name || reagent?.name, entry.id)}</strong>
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

function InputInstruction({ batch, inputIndex, repeatCount = 1 }: { batch: PlannedBatch; inputIndex: number; repeatCount?: number }) {
  const input = batch.inputs[inputIndex];
  if (input.prepared) {
    if (!input.preparedInPlace) {
      return (
        <li>
          {repeatCount > 1 ? `В каждый из ${repeatCount} баков перенесите ` : "Перенесите в этот бак "}
          <strong>{amount(input.amount)} готового {formatReagentName(input.name, input.reagentId)}</strong>
          {repeatCount > 1 ? "." : " из отдельного бака."}
        </li>
      );
    }
    return (
      <li>
        {repeatCount > 1 ? "Оставьте " : "Оставьте в этом баке "}
        <strong>{amount(input.amount)} {formatReagentName(input.name, input.reagentId)}</strong>
        {repeatCount > 1 ? ` в каждый из ${repeatCount} баков` : ""}. Это уже приготовленный компонент следующей реакции.
      </li>
    );
  }
  const externalFromMedicalVendor = MEDICAL_VENDOR_REAGENTS.has(input.reagentId);
  const transferCapacity = externalFromMedicalVendor
    ? MEDICAL_VENDOR_CONTAINER_CAPACITY
    : batch.beakerCapacity;
  const loads = transferLoads(input.amount, transferCapacity);
  if (input.external) {
    return (
      <li>
        {externalFromMedicalVendor
          ? <>В медицинском автомате наберите <strong>{formatReagentName(input.name, input.reagentId)}</strong> через тару на 60u и </>
          : <>Возьмите из готового запаса <strong>{formatReagentName(input.name, input.reagentId)}</strong> и </>}
        {repeatCount > 1 ? `перенесите по ${amount(input.amount)} в каждый из ${repeatCount} баков` : <>перенесите в бак <strong>{amount(input.amount)}</strong></>}
        {loads.length > 1 ? ` (${loads.length} ${countLabel(loads.length, "наполнение", "наполнения", "наполнений")})` : ""}.
      </li>
    );
  }
  return (
    <li>
      В химраздатчике выберите <strong>{formatReagentName(input.name, input.reagentId)}</strong>.
      {repeatCount > 1 ? ` Для каждого из ${repeatCount} баков перенесите ` : " Перенесите в бак "}
      <strong>{amount(input.amount)}</strong>
      {loads.length > 1 ? ` за ${loads.length} ${countLabel(loads.length, "заполнение", "заполнения", "заполнений")} мензурки` : ""}.
    </li>
  );
}

function InlinePreparationSteps({
  preparation,
  repeatCount = 1,
}: {
  preparation: PlannedPreparation;
  repeatCount?: number;
}) {
  return (
    <>
      {preparation.preparations.map((nested, index) => (
        <PreparationBlock preparation={nested} depth={1} key={`inline:separate:${nested.reagentId}:${index}`} />
      ))}
      {preparation.batches.map((batch) => (
        <li className="chem-inline-preparation" key={`inline:${batch.key}`}>
          <p>
            {repeatCount > 1 ? `В каждом из ${repeatCount} баков приготовьте ` : "Приготовьте "}
            <strong>{amount(batch.targetAmount)} {formatReagentName(preparation.name, preparation.reagentId)}</strong>
            {repeatCount > 1 ? " прямо на месте:" : " прямо в этом баке:"}
          </p>
          <ol>
            {batch.inputs.map((input, inputIndex) => input.preparedInPlace && input.inlinePreparation ? (
              <InlinePreparationSteps
                preparation={input.inlinePreparation}
                repeatCount={repeatCount}
                key={`${batch.key}:inline:${input.reagentId}`}
              />
            ) : (
              <InputInstruction batch={batch} inputIndex={inputIndex} repeatCount={repeatCount} key={`${batch.key}:${input.reagentId}`} />
            ))}
            {batch.minTemperature !== undefined && (
              <li>Нагрейте смесь минимум до <strong>{numberFormat.format(batch.minTemperature)} K</strong>.</li>
            )}
            <li>
              Реакция даст <strong>{amount(batch.targetAmount)} {formatReagentName(preparation.name, preparation.reagentId)}</strong>
              {repeatCount > 1 ? ` в каждом из ${repeatCount} баков` : " в этом баке"}. Продолжайте на месте.
            </li>
          </ol>
          {batch.warnings.map((warning) => (
            <p className="chem-reaction-warning" key={warning}>ВНИМАНИЕ // {warning}</p>
          ))}
        </li>
      ))}
    </>
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
  const groups = groupEquivalentBatches(preparation.batches);
  return (
    <section className={"chem-preparation depth-" + Math.min(depth, 3)}>
      <header>
        <div>
          <span>{root ? "ЦЕЛЕВОЙ СОСТАВ" : "ПРОМЕЖУТОЧНЫЙ РЕАГЕНТ"}</span>
          <h3>{formatReagentName(preparation.name, preparation.reagentId)}</h3>
        </div>
        <div className="chem-preparation-amount">
          <strong>{amount(preparation.producedAmount)}</strong>
          {preparation.surplusAmount > 0 && <small>излишек {amount(preparation.surplusAmount)}</small>}
        </div>
      </header>
      {preparation.preparations.length > 0 && (
        <div className="chem-nested-preparations">
          <p>Сначала приготовьте промежуточные реагенты. Следующий этап отдельно укажет, что оставить в баке, а что перенести.</p>
          {preparation.preparations.map((nested, index) => (
            <PreparationBlock
              preparation={nested}
              depth={depth + 1}
              key={`${preparation.reagentId}:${nested.reagentId}:preparation:${index}`}
            />
          ))}
        </div>
      )}
      {groups.map(({ batch, first, last, count }) => (
        <article className="chem-batch" key={batch.key}>
          <h4>
            {count > 1
              ? `Баки ${first}–${last} из ${batch.batchCount}`
              : `Бак ${first} из ${batch.batchCount}`}
            <span>{count > 1 ? `${count} × ` : ""}{amount(batch.targetAmount)} {formatReagentName(preparation.name, preparation.reagentId)}</span>
          </h4>
          <ol>
            <li>
              {batch.inputs.some((input) => input.inlinePreparation)
                ? count > 1
                  ? `Подготовьте ${count} чистых баков на 1000u. Все промежуточные лекарства готовьте по очереди прямо в соответствующем итоговом баке.`
                  : `Подготовьте один чистый бак на 1000u. Все промежуточные лекарства готовьте по очереди прямо в нём.`
                : batch.inputs.some((input) => input.preparedInPlace)
                ? count > 1
                  ? `Продолжайте приготовление в этих ${count} баках, используя мензурку на ${batch.beakerCapacity}u. Выполняйте один шаг сразу для всей группы.`
                  : `Продолжайте приготовление в баке с промежуточным реагентом, используя мензурку на ${batch.beakerCapacity}u.`
                : count > 1
                  ? `Подготовьте ${count} чистых баков на 1000u и мензурку на ${batch.beakerCapacity}u. Выполняйте один шаг сразу для всей группы баков.`
                  : `Подготовьте чистый бак на 1000u и мензурку на ${batch.beakerCapacity}u.`}
            </li>
            {batch.inputs.map((input, inputIndex) => input.preparedInPlace && input.inlinePreparation ? (
              <InlinePreparationSteps
                preparation={input.inlinePreparation}
                repeatCount={count}
                key={`${batch.key}:inline:${input.reagentId}`}
              />
            ) : (
              <InputInstruction batch={batch} inputIndex={inputIndex} repeatCount={count} key={batch.key + ":" + input.reagentId} />
            ))}
            {batch.minTemperature !== undefined && (
              <li>Нагрейте смесь минимум до <strong>{numberFormat.format(batch.minTemperature)} K</strong>.</li>
            )}
            <li>
              {count > 1 ? "В каждом баке получится " : "В баке получится "}<strong>{amount(batch.targetAmount)} {formatReagentName(preparation.name, preparation.reagentId)}</strong>
              {batch.byproducts.length > 0 && (
                <> и {batch.byproducts.map((item) => amount(item.amount) + " " + formatReagentName(item.name, item.reagentId)).join(", ")}</>
              )}.
              {!root && " Оставьте результат в баке для следующего этапа приготовления."}
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

function groupEquivalentBatches(batches: PlannedBatch[]) {
  const groups: Array<{ batch: PlannedBatch; first: number; last: number; count: number }> = [];
  const signature = (batch: PlannedBatch) => JSON.stringify({
    targetAmount: batch.targetAmount,
    inputs: batch.inputs,
    byproducts: batch.byproducts,
    minTemperature: batch.minTemperature,
    warnings: batch.warnings,
  });
  for (const batch of batches) {
    const previous = groups[groups.length - 1];
    if (previous && signature(previous.batch) === signature(batch)) {
      previous.last = batch.batchNumber;
      previous.count += 1;
    } else {
      groups.push({ batch, first: batch.batchNumber, last: batch.batchNumber, count: 1 });
    }
  }
  return groups;
}

function ReagentCombobox({
  ids,
  reagents,
  value,
  mixtureId,
  onChange,
  onMixtureChange,
}: {
  ids: string[];
  reagents: Record<string, ChemistryReagent>;
  value: string;
  mixtureId: MixturePreset["id"] | null;
  onChange: (id: string) => void;
  onMixtureChange: (id: MixturePreset["id"] | null) => void;
}) {
  const selectedMixture = MIXTURE_PRESETS.find((preset) => preset.id === mixtureId);
  const selectedName = selectedMixture?.name ?? formatReagentName(reagents[value]?.name, value);
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const matches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return ids.map((id) => {
      const name = formatReagentName(reagents[id]?.name, id);
      const normalizedName = name.toLocaleLowerCase("ru-RU");
      const normalizedId = id.toLocaleLowerCase("ru-RU");
      const begins = normalizedName.startsWith(normalizedQuery) || normalizedId.startsWith(normalizedQuery);
      const contains = normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery);
      return { id, name, begins, contains };
    }).filter((item) => item.contains).sort((left, right) => (
      Number(right.begins) - Number(left.begins) || left.name.localeCompare(right.name, "ru-RU")
    )).slice(0, 10);
  }, [ids, normalizedQuery, reagents]);

  const select = (id: string) => {
    onChange(id);
    setQuery(formatReagentName(reagents[id]?.name, id));
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(matches[activeIndex]?.id ?? matches[0].id);
    }
  };

  return (
    <div className="chem-planner-search">
      <input
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && normalizedQuery.length >= 2}
        aria-controls="chem-reagent-suggestions"
        aria-activedescendant={open && matches[activeIndex] ? `chem-suggestion-${matches[activeIndex].id}` : undefined}
        autoComplete="off"
        disabled={Boolean(selectedMixture)}
        value={query}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(nextQuery.trim().length >= 2);
          setActiveIndex(0);
          const exact = ids.find((id) => (
            id.toLocaleLowerCase("ru-RU") === nextQuery.trim().toLocaleLowerCase("ru-RU")
            || (reagents[id]?.name ?? "").toLocaleLowerCase("ru-RU") === nextQuery.trim().toLocaleLowerCase("ru-RU")
          ));
          onChange(exact ?? "");
        }}
        onFocus={(event) => {
          event.currentTarget.select();
          setOpen(false);
        }}
        onBlur={() => {
          setOpen(false);
          if (!value) setQuery("");
        }}
        onKeyDown={handleKeyDown}
        placeholder={selectedMixture ? selectedMixture.name : "Введите минимум 2 символа…"}
      />
      <span className="chem-mixture-presets" aria-label="Готовые смеси">
        {MIXTURE_PRESETS.map((preset) => (
          <button
            type="button"
            className={preset.id === mixtureId ? "is-active" : ""}
            aria-pressed={preset.id === mixtureId}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onMixtureChange(preset.id === mixtureId ? null : preset.id)}
            key={preset.id}
          >
            {preset.buttonLabel}
          </button>
        ))}
      </span>
      {open && normalizedQuery.length >= 2 && (
        <div className="chem-planner-suggestions" id="chem-reagent-suggestions" role="listbox">
          {matches.length > 0 ? matches.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              id={`chem-suggestion-${item.id}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(item.id)}
              key={item.id}
            >
              <strong>{item.name}</strong><code>{item.id}</code>
            </button>
          )) : <p>Совпадений не найдено.</p>}
        </div>
      )}
    </div>
  );
}

function Planner({
  catalog,
  reagentId,
  mixtureId,
  requestedAmount,
  beakerCapacity,
  shouldBuild,
  onReagentChange,
  onMixtureChange,
  onAmountChange,
  onBeakerCapacityChange,
  onBuild,
}: {
  catalog: ChemistryCatalog;
  reagentId: string;
  mixtureId: MixturePreset["id"] | null;
  requestedAmount: string;
  beakerCapacity: BeakerCapacity;
  shouldBuild: boolean;
  onReagentChange: (id: string) => void;
  onMixtureChange: (id: MixturePreset["id"] | null) => void;
  onAmountChange: (value: string) => void;
  onBeakerCapacityChange: (value: BeakerCapacity) => void;
  onBuild: () => void;
}) {
  const craftableIds = useMemo(() => craftableReagentIds(catalog), [catalog]);
  const reagents = useMemo(() => ({ ...catalog.dependencies, ...catalog.reagents }), [catalog]);
  const [submitError, setSubmitError] = useState("");
  const calculation = useMemo<{ plan: PreparationPlan | null; error: string }>(() => {
    if (!shouldBuild) return { plan: null, error: "" };
    try {
      return {
        plan: mixtureId
          ? buildMixturePlan(catalog, mixtureId, Number(requestedAmount), beakerCapacity)
          : buildPreparationPlan(catalog, reagentId, Number(requestedAmount), beakerCapacity),
        error: "",
      };
    } catch (caught) {
      return { plan: null, error: caught instanceof Error ? caught.message : "Не удалось построить план." };
    }
  }, [beakerCapacity, catalog, mixtureId, reagentId, requestedAmount, shouldBuild]);
  const { plan } = calculation;
  const error = submitError || calculation.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reagentId && !mixtureId) {
      setSubmitError("Выберите вещество из списка рекомендаций.");
      return;
    }
    setSubmitError("");
    onBuild();
  };

  return (
    <div className="chem-planner">
      <form className="chem-planner-form" onSubmit={submit}>
        <label>
          <span>Вещество</span>
          <ReagentCombobox
            key={`${mixtureId ?? "reagent"}:${reagentId || "empty"}`}
            ids={craftableIds}
            reagents={reagents}
            value={reagentId}
            mixtureId={mixtureId}
            onChange={(id) => { setSubmitError(""); onReagentChange(id); }}
            onMixtureChange={(id) => { setSubmitError(""); onMixtureChange(id); }}
          />
        </label>
        <label>
          <span>Требуемый объём</span>
          <span className="chem-amount-input">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={requestedAmount}
              onChange={(event) => {
                const next = event.target.value;
                if (!/^\d*$/u.test(next)) return;
                setSubmitError("");
                onAmountChange(next.replace(/^0+(?=\d)/u, ""));
              }}
            />
            <b>u</b>
          </span>
        </label>
        <label>
          <span>Мензурка</span>
          <select className="chem-beaker-select" value={beakerCapacity} onChange={(event) => onBeakerCapacityChange(Number(event.target.value) as BeakerCapacity)}>
            {BEAKER_CAPACITIES.map((capacity) => (
              <option value={capacity} key={capacity}>{capacity}u{capacity === 300 ? " · рекомендуется" : ""}</option>
            ))}
          </select>
        </label>
        <button type="submit">[ ПОСТРОИТЬ МАРШРУТ ]</button>
      </form>

      <aside className="chem-planner-note">
        <strong>RMCChemDispenserMedbay</strong>
        <span>Режимы выдачи: 5 · 10 · 20 · 30 · 40</span>
        <p>1u реагента расходует 0,1 энергии, вода бесплатна. Запас восстанавливается каждые 52,5 секунды; фактический максимум и восстановление зависят от онлайна и числа подключённых раздатчиков.</p>
      </aside>

      {error && <div className="chem-status is-error">{error}</div>}
      {plan && (
        <div className="chem-plan-result">
          <header className="chem-plan-summary">
            <div><span>ЗАПРОШЕНО</span><strong>{amount(plan.requestedAmount)}</strong></div>
            <div><span>БУДЕТ ПОЛУЧЕНО</span><strong>{amount(plan.producedAmount)}</strong></div>
            <div><span>ИЗЛИШЕК</span><strong>{amount(plan.surplusAmount)}</strong></div>
            <div><span>МИНИМУМ БАКОВ</span><strong>{plan.tankCount}</strong></div>
          </header>
          <section className="chem-source-totals">
            <h3>Всего исходных реагентов</h3>
            <div>
              {plan.sourceTotals.map((source) => (
                <span key={source.reagentId}><strong>{amount(source.amount)}</strong> {formatReagentName(source.name, source.reagentId)}</span>
              ))}
            </div>
            <p>Оценочный расход химраздатчика: <strong>{numberFormat.format(plan.energyCost)} энергии</strong>. Вода энергию не расходует; энергия медицинского автомата в расчёт не входит.</p>
            {plan.sourceTotals.some((source) => MEDICAL_VENDOR_REAGENTS.has(source.reagentId)) && (
              <p>Готовые базовые лекарства берите в медицинском автомате через тару на 60u. Доступные режимы: {MEDICAL_VENDOR_TRANSFER_AMOUNTS.join(" / ")}u.</p>
            )}
          </section>
          {plan.mixtureComponents && (
            <section className="chem-mixture-composition">
              <h3>Состав готовой смеси</h3>
              <div>
                {plan.mixtureComponents.map((component) => (
                  <span key={component.reagentId}><strong>{amount(component.amount)}</strong> {formatReagentName(component.name, component.reagentId)}</span>
                ))}
              </div>
            </section>
          )}
          <PreparationBlock preparation={plan.target} root />
        </div>
      )}
    </div>
  );
}

function Catalog({
  catalog,
  sectionId,
  query,
  openReagentId,
  onStateChange,
}: {
  catalog: ChemistryCatalog;
  sectionId: ChemistrySectionId;
  query: string;
  openReagentId: string | null;
  onStateChange: (changes: {
    sectionId?: ChemistrySectionId;
    query?: string;
    openReagentId?: string | null;
  }) => void;
}) {
  const reagents = useMemo(() => ({ ...catalog.dependencies, ...catalog.reagents }), [catalog]);
  const sectionByReagent = useMemo(() => {
    const index = new Map<string, ChemistrySectionId>();
    for (const section of CHEMISTRY_SECTIONS) {
      for (const entry of catalog.catalogSections[section.id]) index.set(entry.id, section.id);
    }
    return index;
  }, [catalog]);
  const openSectionId = openReagentId ? sectionByReagent.get(openReagentId) : undefined;
  const activeSectionId = openSectionId ?? sectionId;
  const spotlightEntry = useMemo<ChemistryCatalogEntry | null>(() => {
    if (!openReagentId || openSectionId) return null;
    const reagent = reagents[openReagentId];
    return reagent ? {
      id: openReagentId,
      name: formatReagentName(reagent.name, openReagentId),
      origin: reagent.origin,
      sectionPath: ["Компонент рецепта"],
    } : null;
  }, [openReagentId, openSectionId, reagents]);
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
  const entries = spotlightEntry ? [spotlightEntry] : catalog.catalogSections[activeSectionId].filter((entry) => {
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
    if (!openReagentId) return;
    const card = [...document.querySelectorAll<HTMLElement>("[data-reagent-id]")]
      .find((element) => element.dataset.reagentId === openReagentId);
    if (!card) return;
    if (card instanceof HTMLDetailsElement) card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }, [activeSectionId, openReagentId, spotlightEntry]);

  const navigateToReagent = (id: string) => {
    const section = sectionByReagent.get(id);
    if (section) {
      onStateChange({ query: "", sectionId: section, openReagentId: id });
    } else {
      const reagent = reagents[id];
      if (!reagent) return;
      onStateChange({ query: "", openReagentId: id });
    }
  };

  const selectSection = (id: ChemistrySectionId) => {
    onStateChange({ sectionId: id, openReagentId: null });
  };

  return (
    <div className="chem-catalog">
      <label className="chem-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={query} onChange={(event) => onStateChange({ query: event.target.value, openReagentId: null })} placeholder="Название, описание или ID реагента…" />
        <small>{entries.length} из {spotlightEntry ? 1 : catalog.catalogSections[activeSectionId].length}</small>
      </label>
      <div className="chem-section-tabs" role="tablist" aria-label="Разделы химии">
        {CHEMISTRY_SECTIONS.map((section) => (
          <button
            type="button"
            role="tab"
            aria-selected={section.id === activeSectionId}
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
                  onOpenChange={(id, open) => {
                    if (open) {
                      if (openReagentId !== id) onStateChange({ openReagentId: id });
                    } else if (openReagentId === id) {
                      onStateChange({ openReagentId: null });
                    }
                  }}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = readChemistryUrlState(searchParams);
  const [catalog, setCatalog] = useState<ChemistryCatalog | null>(null);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);
  const setUrlFields = useCallback((changes: Parameters<typeof updateChemistryUrl>[1]) => {
    setSearchParams((current) => updateChemistryUrl(current, changes), { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRemoteJson(CHEMISTRY_CATALOG_URL, { signal: controller.signal, cache: requestKey > 0 ? "reload" : "default" })
      .then((value) => {
        if (!validCatalog(value)) throw new Error("Неизвестная схема chemistry catalog");
        setCatalog(value);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные.");
      });
    return () => controller.abort();
  }, [requestKey]);

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
        <button type="button" className={urlState.view === "catalog" ? "is-active" : ""} onClick={() => setUrlFields({ view: null })}>Каталог реагентов</button>
        <button type="button" className={urlState.view === "planner" ? "is-active" : ""} onClick={() => setUrlFields({ view: "planner" })}>Планировщик приготовления</button>
      </nav>
      {!catalog && !error && <div className="chem-status">Подключение к химической базе данных…</div>}
      {error && (
        <div className="chem-status is-error">
          <strong>GitHub не отвечает</strong>
          <p>{error}</p>
          <button type="button" onClick={() => { setError(""); setRequestKey((value) => value + 1); }}>Повторить</button>
        </div>
      )}
      {catalog && urlState.view === "catalog" && (
        <Catalog
          catalog={catalog}
          sectionId={urlState.sectionId}
          query={urlState.query}
          openReagentId={urlState.openReagentId}
          onStateChange={(changes) => setUrlFields({
            section: changes.sectionId === undefined
              ? undefined
              : changes.sectionId === "ordnance" ? null : changes.sectionId,
            q: changes.query === undefined ? undefined : changes.query || null,
            item: changes.openReagentId === undefined ? undefined : changes.openReagentId,
          })}
        />
      )}
      {catalog && urlState.view === "planner" && (
        <Planner
          catalog={catalog}
          reagentId={urlState.plannerReagentId}
          mixtureId={urlState.mixtureId}
          requestedAmount={urlState.requestedAmount}
          beakerCapacity={urlState.beakerCapacity}
          shouldBuild={urlState.shouldBuild}
          onReagentChange={(id) => setUrlFields({ reagent: id || null, mix: null, run: null })}
          onMixtureChange={(id) => setUrlFields({ mix: id, reagent: null, run: null })}
          onAmountChange={(value) => setUrlFields({ amount: value === "100" ? null : value, run: null })}
          onBeakerCapacityChange={(capacity) => setUrlFields({ beaker: capacity === 300 ? null : String(capacity), run: null })}
          onBuild={() => setUrlFields({ run: "1" })}
        />
      )}
    </main>
  );
}
