import type {
  ChemistryCatalog,
  ChemistryEffect,
  ChemistryReaction,
  BeakerCapacity,
  PlannedBatch,
  PlannedPreparation,
  PlannedSource,
  PreparationPlan,
  TransferMode,
} from "./types";
import { formatReagentName } from "./format";

export const TANK_CAPACITY = 1000;
export const BEAKER_CAPACITIES = [300, 120, 60] as const satisfies readonly BeakerCapacity[];
export const CHEM_DISPENSER_AMOUNTS = [40, 30, 20, 10, 5] as const satisfies readonly TransferMode[];
export const CHEM_DISPENSER_ENERGY_PER_UNIT = 0.1;

export type MixturePreset = {
  id: "unga-standard";
  name: string;
  buttonLabel: string;
  components: Array<{ reagentId: string; amount: number; filler?: boolean }>;
};

export const UNGA_PRESETS: readonly MixturePreset[] = [
  {
    id: "unga-standard",
    name: "Унга",
    buttonLabel: "Унга · до 80u без передоза",
    components: [
      { reagentId: "CMMeralyne", amount: 180 },
      { reagentId: "CMDermaline", amount: 180 },
      { reagentId: "CMKelotane", amount: 180 },
      { reagentId: "CMBicaridine", amount: 180 },
      { reagentId: "CMTricordrazine", amount: 180 },
      { reagentId: "CMDexalinPlus", amount: 20 },
      { reagentId: "RMCIron", amount: 40, filler: true },
      { reagentId: "RMCSugar", amount: 40, filler: true },
    ],
  },
] as const;

type PlannerContext = {
  names: Map<string, string>;
  recipes: Map<string, ChemistryReaction>;
  scaleQuanta: Map<string, number>;
};

const EPSILON = 1e-7;

function roundAmount(value: number) {
  return Math.round(value * 1000) / 1000;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function leastCommonMultiple(left: number, right: number) {
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function decimalDenominator(value: number) {
  const normalized = Number(value.toFixed(6));
  const text = String(normalized);
  const decimal = text.split(".")[1];
  if (!decimal) return 1;
  const denominator = 10 ** decimal.length;
  const numerator = Math.round(normalized * denominator);
  return denominator / greatestCommonDivisor(numerator, denominator);
}

function integerReactionScale(reaction: ChemistryReaction) {
  return [...reaction.reactants, ...reaction.products].reduce(
    (current, reactant) => leastCommonMultiple(
      current,
      decimalDenominator(reactant.amount),
    ),
    1,
  );
}

function productFor(reaction: ChemistryReaction, reagentId: string) {
  return reaction.products.find((product) => product.id === reagentId);
}

function wholeMultiple(value: number, quantum: number) {
  return Math.abs(value / quantum - Math.round(value / quantum)) < EPSILON;
}

function reactionScaleQuantum(
  context: PlannerContext,
  reagentId: string,
  stack: string[] = [],
): number {
  const cached = context.scaleQuanta.get(reagentId);
  if (cached !== undefined) return cached;
  if (stack.includes(reagentId)) {
    throw new Error(`Обнаружен циклический рецепт: ${[...stack, reagentId].join(" → ")}.`);
  }
  const reaction = context.recipes.get(reagentId);
  if (!reaction) return 1;
  const baseScale = integerReactionScale(reaction);
  const nextStack = [...stack, reagentId];
  const requirements = reaction.reactants.map((reactant) => {
    const nestedReaction = context.recipes.get(reactant.id);
    const nestedProduct = nestedReaction && productFor(nestedReaction, reactant.id);
    return nestedReaction && nestedProduct
      ? nestedProduct.amount * reactionScaleQuantum(context, reactant.id, nextStack)
      : 5;
  });

  for (let multiplier = 1; multiplier <= 100_000; multiplier += 1) {
    const scale = baseScale * multiplier;
    if (reaction.reactants.every((reactant, index) => (
      wholeMultiple(reactant.amount * scale, requirements[index])
    ))) {
      context.scaleQuanta.set(reagentId, scale);
      return scale;
    }
  }
  throw new Error(`Не удалось подобрать измеримый объём для реакции ${reaction.id}.`);
}

function candidateScore(reaction: ChemistryReaction, productId: string) {
  if (reaction.reactants.some((reactant) => reactant.id === productId)) return -1;
  let score = 0;
  if (reaction.id === productId) score += 100;
  if (reaction.products.length === 1) score += 20;
  if (reaction.id.toLocaleLowerCase().includes(productId.toLocaleLowerCase())) score += 10;
  return score;
}

export function createPlannerContext(catalog: ChemistryCatalog): PlannerContext {
  const names = new Map<string, string>();
  for (const reagent of [
    ...Object.values(catalog.dependencies),
    ...Object.values(catalog.reagents),
  ]) {
    names.set(reagent.id, formatReagentName(reagent.name, reagent.id));
  }

  const sourceIds = new Set([
    "Water",
    ...catalog.catalogSections.elements.map((entry) => entry.id),
  ]);
  const choices = new Map<string, Array<{ reaction: ChemistryReaction; score: number }>>();
  for (const reaction of Object.values(catalog.reactions)) {
    for (const product of reaction.products) {
      const score = candidateScore(reaction, product.id);
      if (score < 0 || sourceIds.has(product.id)) continue;
      const current = choices.get(product.id) ?? [];
      current.push({ reaction, score });
      choices.set(product.id, current);
    }
  }

  const recipes = new Map<string, ChemistryReaction>();
  for (const [productId, candidates] of choices) {
    candidates.sort((left, right) => (
      right.score - left.score
      || left.reaction.id.localeCompare(right.reaction.id)
    ));
    recipes.set(productId, candidates[0].reaction);
  }
  return { names, recipes, scaleQuanta: new Map() };
}

export function craftableReagentIds(catalog: ChemistryCatalog) {
  return [...createPlannerContext(catalog).recipes.keys()].sort((left, right) => {
    const reagents = { ...catalog.dependencies, ...catalog.reagents };
    return (reagents[left]?.name ?? left).localeCompare(
      reagents[right]?.name ?? right,
      "ru",
    );
  });
}

function effectWarning(effect: ChemistryEffect) {
  const type = effect.yamlTag?.replace(/^!type:/, "") ?? "";
  const value = effect.value ?? {};
  if (type === "SensitiveReactionExplosionEffect") {
    const threshold = typeof value.threshold === "number"
      ? ` при объёме от ${value.threshold}u`
      : "";
    return `Взрывоопасная реакция${threshold}.`;
  }
  if (type === "ExplosionReactionEffect") return "Реакция немедленно вызывает взрыв.";
  if (type === "AreaReactionEffect") return "Реакция создаёт эффект в окружающей области.";
  if (type === "CreateEntityReactionEffect") {
    return `Реакция создаёт предмет ${String(value.entity ?? "") || "в игровом мире"}.`;
  }
  return type ? `Дополнительный эффект реакции: ${type}.` : "";
}

function batchActionCount(
  reaction: ChemistryReaction,
  scale: number,
  beakerCapacity: BeakerCapacity,
  recipes: ReadonlyMap<string, ChemistryReaction>,
) {
  let pours = 0;
  let buttonPresses = 0;
  for (const reactant of reaction.reactants) {
    // An intermediate reagent is prepared directly in the destination tank;
    // it is already the first ingredient and does not require another pour.
    if (recipes.has(reactant.id)) continue;
    const amount = roundAmount(reactant.amount * scale);
    const loads = transferLoads(amount, beakerCapacity);
    pours += loads.length;
    buttonPresses += loads.reduce(
      (total, load) => total + fixedTransferModes(load).length,
      0,
    );
  }
  return { pours, buttonPresses };
}

function optimalRunGroups(
  reaction: ChemistryReaction,
  scaleQuantum: number,
  quantumRuns: number,
  maxQuantumRuns: number,
  beakerCapacity: BeakerCapacity,
  recipes: ReadonlyMap<string, ChemistryReaction>,
) {
  type Candidate = {
    pours: number;
    buttonPresses: number;
    balance: number;
    groups: number[];
  };
  const groupCount = Math.ceil(quantumRuns / maxQuantumRuns);
  const best = Array.from(
    { length: quantumRuns + 1 },
    () => Array<Candidate | undefined>(groupCount + 1),
  );
  best[0][0] = { pours: 0, buttonPresses: 0, balance: 0, groups: [] };

  for (let totalRuns = 1; totalRuns <= quantumRuns; totalRuns += 1) {
    for (let usedGroups = 1; usedGroups <= groupCount; usedGroups += 1) {
      const maximumCurrent = Math.min(totalRuns, maxQuantumRuns);
      for (let currentRuns = 1; currentRuns <= maximumCurrent; currentRuns += 1) {
        const previous = best[totalRuns - currentRuns][usedGroups - 1];
        if (!previous) continue;
        const actions = batchActionCount(
          reaction,
          currentRuns * scaleQuantum,
          beakerCapacity,
          recipes,
        );
        const candidate: Candidate = {
          pours: previous.pours + actions.pours,
          buttonPresses: previous.buttonPresses + actions.buttonPresses,
          balance: previous.balance + currentRuns ** 2,
          groups: [...previous.groups, currentRuns],
        };
        const stored = best[totalRuns][usedGroups];
        if (
          !stored
          || candidate.pours < stored.pours
          || (
            candidate.pours === stored.pours
            && candidate.balance < stored.balance
          )
          || (
            candidate.pours === stored.pours
            && candidate.balance === stored.balance
            && candidate.buttonPresses < stored.buttonPresses
          )
        ) {
          best[totalRuns][usedGroups] = candidate;
        }
      }
    }
  }

  const groups = best[quantumRuns][groupCount]?.groups ?? [];
  return groups.sort((left, right) => right - left);
}

function batchRecipeSignature(batch: PlannedBatch) {
  return JSON.stringify({
    targetAmount: batch.targetAmount,
    totalInput: batch.totalInput,
    totalOutput: batch.totalOutput,
    inputs: batch.inputs,
    byproducts: batch.byproducts,
    minTemperature: batch.minTemperature,
    warnings: batch.warnings,
  });
}

function preparationRecipeSignature(preparation: PlannedPreparation): string {
  return JSON.stringify({
    reagentId: preparation.reagentId,
    reactionId: preparation.reactionId,
    requestedAmount: preparation.requestedAmount,
    producedAmount: preparation.producedAmount,
    surplusAmount: preparation.surplusAmount,
    batches: preparation.batches.map(batchRecipeSignature),
    preparations: preparation.preparations.map(preparationRecipeSignature),
  });
}

function mergeEquivalentPreparations(preparations: PlannedPreparation[]): PlannedPreparation[] {
  const groups: Array<{ signature: string; items: PlannedPreparation[] }> = [];
  for (const preparation of preparations) {
    const signature = preparationRecipeSignature(preparation);
    const previous = groups[groups.length - 1];
    if (previous?.signature === signature) previous.items.push(preparation);
    else groups.push({ signature, items: [preparation] });
  }

  return groups.map(({ items }) => {
    if (items.length === 1) return items[0];
    const first = items[0];
    const batchCount = items.reduce((total, item) => total + item.batches.length, 0);
    let batchNumber = 0;
    const batches = items.flatMap((item) => item.batches.map((batch) => ({
      ...batch,
      key: `${batch.key}:repeat:${batchNumber + 1}`,
      batchNumber: ++batchNumber,
      batchCount,
    })));
    return {
      ...first,
      requestedAmount: roundAmount(items.reduce((total, item) => total + item.requestedAmount, 0)),
      producedAmount: roundAmount(items.reduce((total, item) => total + item.producedAmount, 0)),
      surplusAmount: roundAmount(items.reduce((total, item) => total + item.surplusAmount, 0)),
      preparations: mergeEquivalentPreparations(items.flatMap((item) => item.preparations)),
      batches,
    };
  });
}

function planPreparation(
  context: PlannerContext,
  reagentId: string,
  requestedAmount: number,
  capacity: number,
  beakerCapacity: BeakerCapacity,
  stack: string[],
): PlannedPreparation {
  const reaction = context.recipes.get(reagentId);
  if (!reaction) {
    throw new Error(`Для ${context.names.get(reagentId) ?? reagentId} нет рецепта.`);
  }
  if (stack.includes(reagentId)) {
    throw new Error(`Обнаружен циклический рецепт: ${[...stack, reagentId].join(" → ")}.`);
  }
  const targetProduct = productFor(reaction, reagentId);
  if (!targetProduct || targetProduct.amount <= 0) {
    throw new Error(`Реакция ${reaction.id} не создаёт выбранное вещество.`);
  }

  const scaleQuantum = reactionScaleQuantum(context, reagentId, stack);
  const targetQuantum = targetProduct.amount * scaleQuantum;
  const inputQuantum = reaction.reactants.reduce(
    (total, reactant) => total + reactant.amount * scaleQuantum,
    0,
  );
  const outputQuantum = reaction.products.reduce(
    (total, product) => total + product.amount * scaleQuantum,
    0,
  );
  const occupiedQuantum = Math.max(inputQuantum, outputQuantum);
  const maxQuantumRuns = Math.floor((capacity + EPSILON) / occupiedQuantum);
  if (maxQuantumRuns < 1) {
    throw new Error(
      `Минимальная порция ${context.names.get(reagentId) ?? reagentId} занимает ${roundAmount(occupiedQuantum)}u, `
      + `а ёмкость вмещает ${capacity}u.`,
    );
  }

  const quantumRuns = Math.ceil((requestedAmount - EPSILON) / targetQuantum);
  const runGroups = optimalRunGroups(
    reaction,
    scaleQuantum,
    quantumRuns,
    maxQuantumRuns,
    beakerCapacity,
    context.recipes,
  );

  const batches: PlannedBatch[] = runGroups.map((runs, batchIndex) => {
    const scale = runs * scaleQuantum;
    const inputs = reaction.reactants.map((reactant) => {
      const amount = roundAmount(reactant.amount * scale);
      return {
        reagentId: reactant.id,
        name: context.names.get(reactant.id) ?? reactant.name ?? reactant.id,
        amount,
        prepared: context.recipes.has(reactant.id),
      };
    }).sort((left, right) => Number(right.prepared) - Number(left.prepared));
    const targetAmount = roundAmount(targetProduct.amount * scale);
    return {
      key: `${[...stack, reagentId].join("/")}:${batchIndex}`,
      batchNumber: batchIndex + 1,
      batchCount: runGroups.length,
      vessel: "tank" as const,
      capacity,
      beakerCapacity,
      targetAmount,
      totalInput: roundAmount(reaction.reactants.reduce(
        (total, reactant) => total + reactant.amount * scale,
        0,
      )),
      totalOutput: roundAmount(reaction.products.reduce(
        (total, product) => total + product.amount * scale,
        0,
      )),
      inputs,
      byproducts: reaction.products
        .filter((product) => product.id !== reagentId)
        .map((product) => ({
          reagentId: product.id,
          name: context.names.get(product.id) ?? product.name ?? product.id,
          amount: roundAmount(product.amount * scale),
        })),
      minTemperature: reaction.conditions?.minTemp,
      warnings: (reaction.effects ?? []).map(effectWarning).filter(Boolean),
    };
  });

  // Prepare intermediates per destination tank. Aggregating them into one
  // large batch would force the player to measure and redistribute the result
  // before the next reaction instead of continuing in the same tank.
  const preparations = mergeEquivalentPreparations(batches.flatMap((batch) => batch.inputs
    .filter((input) => input.prepared)
    .map((input) => planPreparation(
      context,
      input.reagentId,
      input.amount,
      TANK_CAPACITY,
      beakerCapacity,
      [...stack, reagentId],
    ))));

  const producedAmount = roundAmount(quantumRuns * targetQuantum);
  return {
    kind: "preparation",
    reagentId,
    name: context.names.get(reagentId) ?? reagentId,
    requestedAmount,
    producedAmount,
    surplusAmount: roundAmount(producedAmount - requestedAmount),
    reactionId: reaction.id,
    preparations,
    batches,
  };
}

function collectSourceTotals(preparation: PlannedPreparation) {
  const totals = new Map<string, { name: string; amount: number }>();
  const visit = (current: PlannedPreparation) => {
    for (const nested of current.preparations) visit(nested);
    for (const batch of current.batches) {
      for (const input of batch.inputs) {
        if (input.prepared) continue;
        const stored = totals.get(input.reagentId) ?? { name: input.name, amount: 0 };
        stored.amount = roundAmount(stored.amount + input.amount);
        totals.set(input.reagentId, stored);
      }
    }
  };
  visit(preparation);
  return [...totals.entries()]
    .map(([reagentId, value]) => ({
      kind: "source" as const,
      reagentId,
      name: value.name,
      amount: value.amount,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export function buildPreparationPlan(
  catalog: ChemistryCatalog,
  reagentId: string,
  requestedAmount: number,
  beakerCapacity: BeakerCapacity = 300,
): PreparationPlan {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Укажите положительный объём вещества.");
  }
  if (!BEAKER_CAPACITIES.includes(beakerCapacity)) {
    throw new Error("Выберите доступную мензурку: 60u, 120u или 300u.");
  }
  const context = createPlannerContext(catalog);
  const target = planPreparation(
    context,
    reagentId,
    requestedAmount,
    TANK_CAPACITY,
    beakerCapacity,
    [],
  );
  const sourceTotals = collectSourceTotals(target);
  return {
    requestedAmount,
    producedAmount: target.producedAmount,
    surplusAmount: target.surplusAmount,
    energyCost: roundAmount(sourceTotals.reduce(
      (total, source) => total + (source.reagentId === "Water"
        ? 0
        : source.amount * CHEM_DISPENSER_ENERGY_PER_UNIT),
      0,
    )),
    beakerCapacity,
    target,
    sourceTotals,
  };
}

type MixtureTankDraft = {
  targetAmount: number;
  totalInput: number;
  inputs: PlannedSource[];
  components: PlannedSource[];
};

function addSourceAmount(
  totals: Map<string, { name: string; amount: number }>,
  reagentId: string,
  name: string,
  amount: number,
) {
  const stored = totals.get(reagentId) ?? { name, amount: 0 };
  stored.amount = roundAmount(stored.amount + amount);
  totals.set(reagentId, stored);
}

function expandMixtureReagent(
  context: PlannerContext,
  reagentId: string,
  amount: number,
  totals: Map<string, { name: string; amount: number }>,
  stack: string[] = [],
) {
  const reaction = context.recipes.get(reagentId);
  const product = reaction && productFor(reaction, reagentId);
  if (!reaction || !product || product.amount <= 0) {
    addSourceAmount(
      totals,
      reagentId,
      context.names.get(reagentId) ?? reagentId,
      amount,
    );
    return;
  }
  if (stack.includes(reagentId)) {
    throw new Error(`Обнаружен циклический рецепт: ${[...stack, reagentId].join(" → ")}.`);
  }

  const scale = amount / product.amount;
  for (const reactant of reaction.reactants) {
    const returned = reaction.products.find((candidate) => candidate.id === reactant.id)?.amount ?? 0;
    const required = Math.max(0, reactant.amount - returned) * scale;
    if (required <= EPSILON) continue;
    expandMixtureReagent(
      context,
      reactant.id,
      required,
      totals,
      [...stack, reagentId],
    );
  }
}

function ceilToDispensableAmount(value: number) {
  return Math.ceil((value - EPSILON) / 5) * 5;
}

function mixtureTankDraft(
  context: PlannerContext,
  preset: MixturePreset,
  targetAmount: number,
): MixtureTankDraft {
  const scale = targetAmount / 1000;
  const components = preset.components.map((component) => ({
    kind: "source" as const,
    reagentId: component.reagentId,
    name: context.names.get(component.reagentId) ?? component.reagentId,
    amount: roundAmount(component.amount * scale),
  }));
  const rawSources = new Map<string, { name: string; amount: number }>();
  for (const component of components) {
    expandMixtureReagent(
      context,
      component.reagentId,
      component.amount,
      rawSources,
    );
  }
  const inputs = [...rawSources.entries()].map(([reagentId, source]) => ({
    kind: "source" as const,
    reagentId,
    name: source.name,
    amount: ceilToDispensableAmount(source.amount),
  }));

  let totalInput = inputs.reduce((sum, input) => sum + input.amount, 0);
  let excess = roundAmount(totalInput - targetAmount);
  // Iron and sugar are the adjustable blood-restoration filler from the guide.
  // Spend that allowance first when 5u rounding of recipe ingredients would
  // otherwise overfill the tank.
  for (const filler of [...preset.components].reverse().filter((component) => component.filler)) {
    if (excess <= 0) break;
    const component = components.find((candidate) => candidate.reagentId === filler.reagentId);
    const input = inputs.find((candidate) => candidate.reagentId === filler.reagentId);
    if (!component || !input) continue;
    const allowance = Math.floor((filler.amount * scale + EPSILON) / 5) * 5;
    const reduction = Math.min(allowance, excess);
    input.amount = roundAmount(input.amount - reduction);
    component.amount = roundAmount(component.amount - reduction);
    excess = roundAmount(excess - reduction);
  }

  const filteredInputs = inputs.filter((input) => input.amount > 0);
  totalInput = roundAmount(filteredInputs.reduce((sum, input) => sum + input.amount, 0));
  return { targetAmount: totalInput, totalInput, inputs: filteredInputs, components };
}

function mixtureTankGroups(
  context: PlannerContext,
  preset: MixturePreset,
  requestedAmount: number,
  beakerCapacity: BeakerCapacity,
) {
  const totalUnits = Math.ceil((requestedAmount - EPSILON) / 5);
  const maxUnits = TANK_CAPACITY / 5;
  const minimumGroups = Math.ceil(totalUnits / maxUnits);
  const drafts = new Map<number, MixtureTankDraft | null>();
  const draftFor = (units: number) => {
    if (!drafts.has(units)) {
      const draft = mixtureTankDraft(context, preset, units * 5);
      drafts.set(units, draft.totalInput <= TANK_CAPACITY ? draft : null);
    }
    return drafts.get(units) ?? null;
  };

  type Candidate = { pours: number; presses: number; balance: number; groups: number[] };
  for (let groupCount = minimumGroups; groupCount <= minimumGroups + 4; groupCount += 1) {
    const best = Array.from(
      { length: totalUnits + 1 },
      () => Array<Candidate | undefined>(groupCount + 1),
    );
    best[0][0] = { pours: 0, presses: 0, balance: 0, groups: [] };
    for (let total = 1; total <= totalUnits; total += 1) {
      for (let used = 1; used <= groupCount; used += 1) {
        for (let current = 1; current <= Math.min(total, maxUnits); current += 1) {
          const previous = best[total - current][used - 1];
          const draft = draftFor(current);
          if (!previous || !draft) continue;
          const pours = draft.inputs.reduce(
            (sum, input) => sum + transferLoads(input.amount, beakerCapacity).length,
            0,
          );
          const presses = draft.inputs.reduce((sum, input) => (
            sum + transferLoads(input.amount, beakerCapacity).reduce(
              (loadSum, load) => loadSum + fixedTransferModes(load).length,
              0,
            )
          ), 0);
          const candidate: Candidate = {
            pours: previous.pours + pours,
            presses: previous.presses + presses,
            balance: previous.balance + current ** 2,
            groups: [...previous.groups, current],
          };
          const stored = best[total][used];
          if (
            !stored
            || candidate.pours < stored.pours
            || (candidate.pours === stored.pours && candidate.balance < stored.balance)
            || (
              candidate.pours === stored.pours
              && candidate.balance === stored.balance
              && candidate.presses < stored.presses
            )
          ) {
            best[total][used] = candidate;
          }
        }
      }
    }
    const result = best[totalUnits][groupCount];
    if (result) return result.groups.map((units) => draftFor(units)!);
  }
  throw new Error("Не удалось распределить смесь по бакам на 1000u.");
}

export function buildMixturePlan(
  catalog: ChemistryCatalog,
  presetId: MixturePreset["id"],
  requestedAmount: number,
  beakerCapacity: BeakerCapacity = 300,
): PreparationPlan {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Укажите положительный объём смеси.");
  }
  const preset = UNGA_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error("Неизвестная готовая смесь.");
  if (!BEAKER_CAPACITIES.includes(beakerCapacity)) {
    throw new Error("Выберите доступную мензурку: 60u, 120u или 300u.");
  }

  const context = createPlannerContext(catalog);
  const drafts = mixtureTankGroups(context, preset, requestedAmount, beakerCapacity)
    .sort((left, right) => right.targetAmount - left.targetAmount);
  const batches: PlannedBatch[] = drafts.map((draft, index) => ({
    key: `${preset.id}:${index}`,
    batchNumber: index + 1,
    batchCount: drafts.length,
    vessel: "tank",
    capacity: TANK_CAPACITY,
    beakerCapacity,
    targetAmount: draft.targetAmount,
    totalInput: draft.totalInput,
    totalOutput: draft.targetAmount,
    inputs: draft.inputs.map((input) => ({ ...input, prepared: false })),
    byproducts: [],
    warnings: [],
  }));
  const sourceMap = new Map<string, { name: string; amount: number }>();
  const componentMap = new Map<string, { name: string; amount: number }>();
  for (const draft of drafts) {
    for (const input of draft.inputs) {
      addSourceAmount(sourceMap, input.reagentId, input.name, input.amount);
    }
    for (const component of draft.components) {
      addSourceAmount(componentMap, component.reagentId, component.name, component.amount);
    }
  }
  const sourceTotals = [...sourceMap.entries()].map(([reagentId, source]) => ({
    kind: "source" as const,
    reagentId,
    ...source,
  }));
  const mixtureComponents = [...componentMap.entries()].map(([reagentId, component]) => ({
    kind: "source" as const,
    reagentId,
    ...component,
  }));
  const producedAmount = roundAmount(batches.reduce((sum, batch) => sum + batch.targetAmount, 0));
  const target: PlannedPreparation = {
    kind: "preparation",
    reagentId: preset.id,
    name: preset.name,
    requestedAmount,
    producedAmount,
    surplusAmount: roundAmount(producedAmount - requestedAmount),
    reactionId: `custom:${preset.id}`,
    preparations: [],
    batches,
  };
  return {
    requestedAmount,
    producedAmount,
    surplusAmount: target.surplusAmount,
    energyCost: roundAmount(sourceTotals.reduce(
      (total, source) => total + (source.reagentId === "Water"
        ? 0
        : source.amount * CHEM_DISPENSER_ENERGY_PER_UNIT),
      0,
    )),
    beakerCapacity,
    target,
    sourceTotals,
    mixtureComponents,
  };
}

export function fixedTransferModes(amount: number): TransferMode[] {
  if (!Number.isInteger(amount) || amount < 0 || amount % 5 !== 0) {
    throw new Error(`Химраздатчик не может отмерить ${amount}u доступными режимами.`);
  }
  const plans: Array<TransferMode[] | undefined> = Array(amount + 1);
  plans[0] = [];
  for (let current = 1; current <= amount; current += 1) {
    for (const mode of CHEM_DISPENSER_AMOUNTS) {
      const previous = current - mode;
      if (previous < 0) continue;
      const previousPlan = plans[previous];
      if (!previousPlan) continue;
      const candidate = [...previousPlan, mode];
      const currentPlan = plans[current];
      if (!currentPlan || candidate.length < currentPlan.length) {
        plans[current] = candidate;
      }
    }
  }
  return (plans[amount] ?? []).sort((left, right) => right - left);
}

export function transferLoads(amount: number, capacity: BeakerCapacity): number[] {
  if (!Number.isInteger(amount) || amount < 0 || amount % 5 !== 0) {
    throw new Error(`Химраздатчик не может отмерить ${amount}u доступными режимами.`);
  }
  const loads: number[] = [];
  let remaining = amount;
  while (remaining > 0) {
    const load = Math.min(capacity, remaining);
    loads.push(load);
    remaining -= load;
  }
  return loads;
}

export function transferModes(amount: number): TransferMode[] {
  return fixedTransferModes(amount);
}

export function formatTransferModes(modes: TransferMode[]) {
  const groups: Array<{ mode: TransferMode; count: number }> = [];
  for (const mode of modes) {
    const previous = groups[groups.length - 1];
    if (previous?.mode === mode) previous.count += 1;
    else groups.push({ mode, count: 1 });
  }
  return groups.flatMap(({ mode, count }) => {
    return Array.from({ length: count }, () => String(mode));
  }).join(" + ");
}
