import type {
  ChemistryCatalog,
  ChemistryEffect,
  ChemistryReaction,
  BeakerCapacity,
  PlannedBatch,
  PlannedInput,
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

// Exact reagent set shown by RMCChemDispenserMedbay. Other leaf reagents must
// come from an external stock; pretending they are dispenser buttons creates
// impossible and, in the case of Phoron, unsafe instructions.
export const MEDBAY_DISPENSER_REAGENTS = new Set([
  "Water",
  "RMCAluminum",
  "RMCCarbon",
  "RMCChlorine",
  "RMCCopper",
  "RMCEthanol",
  "RMCFluorine",
  "RMCHydrogen",
  "RMCIron",
  "RMCLithium",
  "RMCMercury",
  "RMCNitrogen",
  "RMCOxygen",
  "RMCPhosphorus",
  "RMCPotassium",
  "RMCRadium",
  "RMCSilicon",
  "RMCSodium",
  "RMCSugar",
  "RMCSulfur",
  "RMCSulphuricAcid",
]);

// CMVendorMedical supplies these medicines inside larger recipes. When one of
// them is the planner's direct target, its normal recipe is expanded instead.
export const MEDICAL_VENDOR_REAGENTS = new Set([
  "CMBicaridine",
  "CMKelotane",
  "CMDylovene",
  "CMDexalin",
  "CMInaprovaline",
]);

export const MEDICAL_VENDOR_CONTAINER_CAPACITY = 60;
export const MEDICAL_VENDOR_TRANSFER_AMOUNTS = [60, 40, 30, 25, 15, 10, 5] as const;

export type MixturePreset = {
  id: string;
  name: string;
  buttonLabel: string;
  components: Array<{ reagentId: string; amount: number }>;
};

export const MIXTURE_PRESETS: readonly MixturePreset[] = [
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
      { reagentId: "RMCIron", amount: 40 },
      { reagentId: "RMCSugar", amount: 40 },
    ],
  },
] as const;

type PlannerContext = {
  names: Map<string, string>;
  recipes: Map<string, ChemistryReaction>;
  reactions: ChemistryReaction[];
  scaleQuanta: Map<string, number>;
  expandedVendorReagents: ReadonlySet<string>;
};

type RouteFeatures = {
  tanks: number;
  tankTransfers: number;
  intermediateSurplus: number;
  beakerPours: number;
  dispenserPresses: number;
  imbalance: number;
};

// The planner evaluates a route in the same way a small linear model would:
// each observable feature has a weight and the route with the lowest dot
// product wins. Hard safety/capacity rules are validated separately and can
// never be traded for a cheaper score.
export const PLANNER_WEIGHTS = {
  // One extra tank is worse than route details; a tank-to-tank pour is worse
  // than any possible (<1000u) surplus from one reaction batch.
  tanks: 1_000_000_000_000,
  tankTransfers: 1_000_000_000,
  intermediateSurplus: 1_000_000,
  beakerPours: 1_000,
  dispenserPresses: 1,
  imbalance: 0.001,
} as const satisfies Record<keyof RouteFeatures, number>;

function routeScore(features: RouteFeatures) {
  return (Object.keys(PLANNER_WEIGHTS) as Array<keyof RouteFeatures>).reduce(
    (score, feature) => score + features[feature] * PLANNER_WEIGHTS[feature],
    0,
  );
}

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

  for (let multiplier = 1; multiplier <= 100_000; multiplier += 1) {
    const scale = baseScale * multiplier;
    // Every amount that appears in an instruction must be measurable in 5u
    // steps. Nested recipes deliberately do not constrain this quantum: they
    // are allowed to make a small surplus in a separate reusable tank.
    if ([...reaction.reactants, ...reaction.products].every((item) => (
      wholeMultiple(item.amount * scale, 5)
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

export function createPlannerContext(
  catalog: ChemistryCatalog,
  expandedVendorReagents: ReadonlySet<string> = new Set(),
): PlannerContext {
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
  return {
    names,
    recipes,
    reactions: Object.values(catalog.reactions),
    scaleQuanta: new Map(),
    expandedVendorReagents,
  };
}

function isVendorSource(context: PlannerContext, reagentId: string) {
  return MEDICAL_VENDOR_REAGENTS.has(reagentId)
    && !context.expandedVendorReagents.has(reagentId);
}

function isDirectSource(context: PlannerContext, reagentId: string) {
  return MEDBAY_DISPENSER_REAGENTS.has(reagentId)
    || isVendorSource(context, reagentId)
    || !context.recipes.has(reagentId);
}

export function craftableReagentIds(catalog: ChemistryCatalog) {
  const context = createPlannerContext(catalog);
  return [...context.names.keys()]
    .filter((id) => {
      // Every reagent without an independent recipe is an initial source.
      // This also covers self-consuming reactions such as Phoron: those
      // reactions are deliberately excluded while the context is built.
      if (isDirectSource(context, id)) return true;
      try {
        planPreparation(context, id, 5, TANK_CAPACITY, 300, []);
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
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
  context: PlannerContext,
) {
  let pours = 0;
  let buttonPresses = 0;
  for (const reactant of reaction.reactants) {
    const prepared = !isDirectSource(context, reactant.id)
      && context.recipes.has(reactant.id);
    // Complete intermediates can be prepared in the destination tank before
    // moving on to the next reaction.
    if (prepared) continue;
    const amount = roundAmount(reactant.amount * scale);
    const loads = transferLoads(
      amount,
      isVendorSource(context, reactant.id) ? MEDICAL_VENDOR_CONTAINER_CAPACITY : beakerCapacity,
    );
    pours += loads.length;
    if (MEDBAY_DISPENSER_REAGENTS.has(reactant.id)) {
      buttonPresses += loads.reduce(
        (total, load) => total + fixedTransferModes(load).length,
        0,
      );
    }
  }
  return { pours, buttonPresses };
}

function optimalRunGroups(
  reaction: ChemistryReaction,
  scaleQuantum: number,
  quantumRuns: number,
  maxQuantumRuns: number,
  beakerCapacity: BeakerCapacity,
  context: PlannerContext,
) {
  type Candidate = {
    pours: number;
    buttonPresses: number;
    balance: number;
    score: number;
    groups: number[];
  };
  const groupCount = Math.ceil(quantumRuns / maxQuantumRuns);
  const best = Array.from(
    { length: quantumRuns + 1 },
    () => Array<Candidate | undefined>(groupCount + 1),
  );
  best[0][0] = { pours: 0, buttonPresses: 0, balance: 0, score: 0, groups: [] };

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
          context,
        );
        const pours = previous.pours + actions.pours;
        const buttonPresses = previous.buttonPresses + actions.buttonPresses;
        const balance = previous.balance + currentRuns ** 2;
        const candidate: Candidate = {
          pours,
          buttonPresses,
          balance,
          score: routeScore({
            tanks: usedGroups,
            tankTransfers: 0,
            intermediateSurplus: 0,
            beakerPours: pours,
            dispenserPresses: buttonPresses,
            imbalance: balance,
          }),
          groups: [...previous.groups, currentRuns],
        };
        const stored = best[totalRuns][usedGroups];
        if (!stored || candidate.score < stored.score) {
          best[totalRuns][usedGroups] = candidate;
        }
      }
    }
  }

  const groups = best[quantumRuns][groupCount]?.groups ?? [];
  return groups.sort((left, right) => right - left);
}

function preparationFootprint(
  context: PlannerContext,
  reagentId: string,
  stack: string[] = [],
): { reagents: Set<string>; reactions: Set<string> } {
  const reagents = new Set([reagentId]);
  const reactions = new Set<string>();
  if (
    isDirectSource(context, reagentId)
    || stack.includes(reagentId)
  ) return { reagents, reactions };

  const recipe = context.recipes.get(reagentId);
  if (!recipe) return { reagents, reactions };
  reactions.add(recipe.id);
  for (const reactant of recipe.reactants) {
    const nested = preparationFootprint(context, reactant.id, [...stack, reagentId]);
    for (const id of nested.reagents) reagents.add(id);
    for (const id of nested.reactions) reactions.add(id);
  }
  return { reagents, reactions };
}

function stageCanRunSafely(
  context: PlannerContext,
  existing: Set<string>,
  footprint: Set<string>,
  intendedReactionIds: Set<string>,
  hazardousRecipe: boolean,
) {
  const available = new Set([...existing, ...footprint]);
  const priority = (reaction: ChemistryReaction) => reaction.conditions?.priority ?? 0;
  const activeIntendedPriority = context.reactions.reduce((highest, reaction) => (
    intendedReactionIds.has(reaction.id)
    && reaction.reactants.every((reactant) => available.has(reactant.id))
      ? Math.max(highest, priority(reaction))
      : highest
  ), Number.NEGATIVE_INFINITY);
  return !context.reactions.some((reaction) => (
    !intendedReactionIds.has(reaction.id)
    && reaction.reactants.length > 0
    && reaction.reactants.every((reactant) => available.has(reactant.id))
    && priority(reaction) >= activeIntendedPriority
    // A deliberately hazardous recipe is still a valid planner target. Its
    // own warning remains visible; duplicate effect-only reactions must not
    // hide the substance from search.
    && !(hazardousRecipe && reaction.products.length === 0)
  ));
}

type PlannedStage = {
  input: PlannedInput;
  nested?: PlannedPreparation;
  inline: boolean;
};

function orderBatchStages(
  context: PlannerContext,
  parentReaction: ChemistryReaction,
  inputs: PlannedInput[],
  nestedPlans: Map<PlannedInput, PlannedPreparation>,
  beakerCapacity: BeakerCapacity,
): PlannedStage[] {
  type Candidate = {
    mask: number;
    auxiliaryTank: boolean;
    score: number;
    stages: PlannedStage[];
  };
  const allMask = (1 << inputs.length) - 1;
  let candidates = new Map<string, Candidate>([["0:0", {
    mask: 0,
    auxiliaryTank: false,
    score: 0,
    stages: [],
  }]]);

  for (let depth = 0; depth < inputs.length; depth += 1) {
    const next = new Map<string, Candidate>();
    for (const candidate of candidates.values()) {
      const existing = new Set(candidate.stages.map((stage) => stage.input.reagentId));
      for (let index = 0; index < inputs.length; index += 1) {
        const bit = 1 << index;
        if (candidate.mask & bit) continue;
        const input = inputs[index];
        const nested = nestedPlans.get(input);
        const inlineOptions = nested?.surplusAmount
          ? [false]
          : nested
            ? [true, false]
            : [false];
        for (const inline of inlineOptions) {
          const footprint = inline && nested
            ? preparationFootprint(context, input.reagentId)
            : { reagents: new Set([input.reagentId]), reactions: new Set<string>() };
          const intended = new Set([parentReaction.id, ...footprint.reactions]);
          if (!stageCanRunSafely(
            context,
            existing,
            footprint.reagents,
            intended,
            Boolean(parentReaction.effects?.length),
          )) continue;

          const separatePrepared = Boolean(nested) && !inline;
          const auxiliaryTank = candidate.auxiliaryTank || separatePrepared;
          const addedScore = separatePrepared ? routeScore({
            tanks: candidate.auxiliaryTank ? 0 : 1,
            tankTransfers: transferLoads(input.amount, beakerCapacity).length,
            intermediateSurplus: nested?.surplusAmount ?? 0,
            beakerPours: 0,
            dispenserPresses: 0,
            imbalance: 0,
          }) : 0;
          const updated: Candidate = {
            mask: candidate.mask | bit,
            auxiliaryTank,
            score: candidate.score + addedScore,
            stages: [...candidate.stages, { input, nested, inline }],
          };
          const key = `${updated.mask}:${Number(updated.auxiliaryTank)}`;
          const stored = next.get(key);
          if (!stored || updated.score < stored.score) next.set(key, updated);
        }
      }
    }
    candidates = next;
  }

  const result = [...candidates.values()]
    .filter((candidate) => candidate.mask === allMask)
    .sort((left, right) => left.score - right.score)[0];
  if (!result) {
    throw new Error(
      `Не удалось подобрать безопасный порядок для ${context.names.get(parentReaction.id) ?? parentReaction.id}. `
      + "Компоненты могут запустить постороннюю реакцию.",
    );
  }
  return result.stages;
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
    context,
  );

  const batches: PlannedBatch[] = runGroups.map((runs, batchIndex) => {
    const scale = runs * scaleQuantum;
    const inputs = reaction.reactants.map((reactant) => {
      const amount = roundAmount(reactant.amount * scale);
      const prepared = !isDirectSource(context, reactant.id)
        && context.recipes.has(reactant.id);
      const external = !prepared && !MEDBAY_DISPENSER_REAGENTS.has(reactant.id);
      return {
        reagentId: reactant.id,
        name: context.names.get(reactant.id) ?? reactant.name ?? reactant.id,
        amount,
        prepared,
        preparedInPlace: false,
        external: external || (!prepared && !MEDBAY_DISPENSER_REAGENTS.has(reactant.id)),
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

  // Exact intermediates are prepared directly in their destination tank. If
  // a requested intermediate would leave surplus, collect every equal need
  // first and cook it once in a reusable auxiliary tank. This keeps the final
  // composition exact and avoids multiplying the same surplus by tank count.
  const preparations: PlannedPreparation[] = [];
  const separateGroups = new Map<string, { requestedAmount: number; inputs: PlannedInput[] }>();
  for (const batch of batches) {
    const nestedPlans = new Map<PlannedInput, PlannedPreparation>();
    for (const input of batch.inputs.filter((candidate) => candidate.prepared)) {
      nestedPlans.set(input, planPreparation(
        context,
        input.reagentId,
        input.amount,
        TANK_CAPACITY,
        beakerCapacity,
        [...stack, reagentId],
      ));
    }
    const stages = orderBatchStages(
      context,
      reaction,
      batch.inputs,
      nestedPlans,
      beakerCapacity,
    );
    batch.inputs = stages.map((stage) => stage.input);
    for (const stage of stages) {
      const { input, nested } = stage;
      if (!nested) continue;
      if (stage.inline) {
        input.preparedInPlace = true;
        input.inlinePreparation = nested;
      } else {
        const group = separateGroups.get(input.reagentId) ?? { requestedAmount: 0, inputs: [] };
        group.requestedAmount = roundAmount(group.requestedAmount + input.amount);
        group.inputs.push(input);
        separateGroups.set(input.reagentId, group);
      }
    }
  }

  for (const [nestedReagentId, group] of separateGroups) {
    const nested = planPreparation(
      context,
      nestedReagentId,
      group.requestedAmount,
      TANK_CAPACITY,
      beakerCapacity,
      [...stack, reagentId],
    );
    preparations.push(nested);
    for (const input of group.inputs) input.preparedInPlace = false;
  }

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
        if (input.inlinePreparation) visit(input.inlinePreparation);
      }
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

function auxiliaryTankDepth(preparation: PlannedPreparation): number {
  const separateDepth = preparation.preparations.length > 0
    ? 1 + Math.max(0, ...preparation.preparations.map(auxiliaryTankDepth))
    : 0;
  const inlineDepth = Math.max(0, ...preparation.batches.flatMap((batch) => (
    batch.inputs.flatMap((input) => (
      input.inlinePreparation ? [auxiliaryTankDepth(input.inlinePreparation)] : []
    ))
  )));
  return Math.max(separateDepth, inlineDepth);
}

function sourcePreparation(
  context: PlannerContext,
  reagentId: string,
  requestedAmount: number,
  beakerCapacity: BeakerCapacity,
): PlannedPreparation {
  const producedAmount = Math.ceil((requestedAmount - EPSILON) / 5) * 5;
  const batchAmounts: number[] = [];
  let remaining = producedAmount;
  while (remaining > 0) {
    const current = Math.min(TANK_CAPACITY, remaining);
    batchAmounts.push(current);
    remaining -= current;
  }
  const name = context.names.get(reagentId) ?? reagentId;
  const batches: PlannedBatch[] = batchAmounts.map((targetAmount, index) => ({
    key: `source:${reagentId}:${index}`,
    batchNumber: index + 1,
    batchCount: batchAmounts.length,
    vessel: "tank",
    capacity: TANK_CAPACITY,
    beakerCapacity,
    targetAmount,
    totalInput: targetAmount,
    totalOutput: targetAmount,
    inputs: [{
      reagentId,
      name,
      amount: targetAmount,
      prepared: false,
      external: !MEDBAY_DISPENSER_REAGENTS.has(reagentId),
    }],
    byproducts: [],
    warnings: [],
  }));
  return {
    kind: "preparation",
    reagentId,
    name,
    requestedAmount,
    producedAmount,
    surplusAmount: roundAmount(producedAmount - requestedAmount),
    reactionId: `source:${reagentId}`,
    preparations: [],
    batches,
  };
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
  const context = createPlannerContext(
    catalog,
    MEDICAL_VENDOR_REAGENTS.has(reagentId) ? new Set([reagentId]) : new Set(),
  );
  const target = isDirectSource(context, reagentId)
    ? sourcePreparation(context, reagentId, requestedAmount, beakerCapacity)
    : planPreparation(
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
    tankCount: target.batches.length + auxiliaryTankDepth(target),
    energyCost: roundAmount(sourceTotals.reduce(
      (total, source) => total + (
        source.reagentId !== "Water" && MEDBAY_DISPENSER_REAGENTS.has(source.reagentId)
          ? source.amount * CHEM_DISPENSER_ENERGY_PER_UNIT
          : 0
      ),
      0,
    )),
    beakerCapacity,
    target,
    sourceTotals,
  };
}

function mixtureReaction(preset: MixturePreset): ChemistryReaction {
  const totalAmount = preset.components.reduce((sum, component) => sum + component.amount, 0);
  const divisor = [...preset.components.map((component) => component.amount), totalAmount]
    .reduce((current, value) => greatestCommonDivisor(current, value));
  return {
    id: `mixture:${preset.id}`,
    origin: "app:mixture",
    reactants: preset.components.map((component) => ({
      id: component.reagentId,
      name: component.reagentId,
      amount: component.amount / divisor,
    })),
    products: [{ id: preset.id, name: preset.name, amount: totalAmount / divisor }],
  };
}

function mixtureComponents(target: PlannedPreparation): PlannedSource[] {
  const totals = new Map<string, { name: string; amount: number }>();
  for (const batch of target.batches) {
    for (const input of batch.inputs) {
      const stored = totals.get(input.reagentId) ?? { name: input.name, amount: 0 };
      stored.amount = roundAmount(stored.amount + input.amount);
      totals.set(input.reagentId, stored);
    }
  }
  return [...totals.entries()].map(([reagentId, value]) => ({
    kind: "source" as const,
    reagentId,
    ...value,
  }));
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
  const preset = MIXTURE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error("Неизвестная готовая смесь.");
  if (!BEAKER_CAPACITIES.includes(beakerCapacity)) {
    throw new Error("Выберите доступную мензурку: 60u, 120u или 300u.");
  }

  // A saved mixture is only declarative chemistry data. From this point on it
  // goes through exactly the same recursive planner as every catalog reagent.
  const context = createPlannerContext(catalog);
  context.names.set(preset.id, preset.name);
  context.recipes.set(preset.id, mixtureReaction(preset));
  const target = planPreparation(
    context,
    preset.id,
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
    tankCount: target.batches.length + auxiliaryTankDepth(target),
    energyCost: roundAmount(sourceTotals.reduce(
      (total, source) => total + (
        source.reagentId !== "Water" && MEDBAY_DISPENSER_REAGENTS.has(source.reagentId)
          ? source.amount * CHEM_DISPENSER_ENERGY_PER_UNIT
          : 0
      ),
      0,
    )),
    beakerCapacity,
    target,
    sourceTotals,
    mixtureComponents: mixtureComponents(target),
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
