import type {
  ChemistryCatalog,
  ChemistryEffect,
  ChemistryReaction,
  PlannedBatch,
  PlannedPreparation,
  PreparationPlan,
  TransferMode,
} from "./types";
import { formatReagentName } from "./format";

export const BEAKER_CAPACITY = 100;
export const CHEM_MASTER_AMOUNTS = [100, 50, 30, 25, 20, 15, 10, 5, 1] as const;

type PlannerContext = {
  names: Map<string, string>;
  recipes: Map<string, ChemistryReaction>;
};

const EPSILON = 1e-7;

function closeTo(left: number, right: number) {
  return Math.abs(left - right) < EPSILON;
}

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

function reactionScaleQuantum(reaction: ChemistryReaction) {
  return reaction.reactants.reduce(
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
  return { names, recipes };
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

function batchActionCount(reaction: ChemistryReaction, scale: number) {
  let occupied = 0;
  let actions = 0;
  for (const reactant of reaction.reactants) {
    const amount = roundAmount(reactant.amount * scale);
    actions += transferModes(amount, BEAKER_CAPACITY - occupied).length;
    occupied += amount;
  }
  return actions;
}

function optimalRunGroups(
  reaction: ChemistryReaction,
  scaleQuantum: number,
  quantumRuns: number,
  maxQuantumRuns: number,
) {
  type Candidate = { actions: number; groups: number[] };
  const best: Array<Candidate | undefined> = Array(quantumRuns + 1);
  best[0] = { actions: 0, groups: [] };

  for (let totalRuns = 1; totalRuns <= quantumRuns; totalRuns += 1) {
    const maximumCurrent = Math.min(totalRuns, maxQuantumRuns);
    for (let currentRuns = 1; currentRuns <= maximumCurrent; currentRuns += 1) {
      const previous = best[totalRuns - currentRuns];
      if (!previous) continue;
      const candidate: Candidate = {
        actions: previous.actions + batchActionCount(reaction, currentRuns * scaleQuantum),
        groups: [...previous.groups, currentRuns],
      };
      const stored = best[totalRuns];
      if (
        !stored
        || candidate.actions < stored.actions
        || (candidate.actions === stored.actions && candidate.groups.length < stored.groups.length)
      ) {
        best[totalRuns] = candidate;
      }
    }
  }

  const groups = best[quantumRuns]?.groups ?? [];
  return groups.sort((left, right) => right - left);
}

function planPreparation(
  context: PlannerContext,
  reagentId: string,
  requestedAmount: number,
  capacity: number,
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

  const scaleQuantum = reactionScaleQuantum(reaction);
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
    });
    const targetAmount = roundAmount(targetProduct.amount * scale);
    return {
      key: `${[...stack, reagentId].join("/")}:${batchIndex}`,
      batchNumber: batchIndex + 1,
      batchCount: runGroups.length,
      vessel: "beaker" as const,
      capacity,
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

  const preparationTotals = new Map<string, number>();
  for (const batch of batches) {
    for (const input of batch.inputs) {
      if (!input.prepared) continue;
      preparationTotals.set(
        input.reagentId,
        roundAmount((preparationTotals.get(input.reagentId) ?? 0) + input.amount),
      );
    }
  }
  const preparations = [...preparationTotals.entries()].map(([
    inputReagentId,
    inputAmount,
  ]) => planPreparation(
    context,
    inputReagentId,
    inputAmount,
    BEAKER_CAPACITY,
    [...stack, reagentId],
  ));

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
): PreparationPlan {
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Укажите положительный объём вещества.");
  }
  const context = createPlannerContext(catalog);
  const target = planPreparation(
    context,
    reagentId,
    requestedAmount,
    BEAKER_CAPACITY,
    [],
  );
  return {
    requestedAmount,
    producedAmount: target.producedAmount,
    surplusAmount: target.surplusAmount,
    target,
    sourceTotals: collectSourceTotals(target),
  };
}

export function fixedTransferModes(amount: number): number[] {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Химмастер не может отмерить ${amount}u доступными режимами.`);
  }
  const plans: Array<number[] | undefined> = Array(amount + 1);
  plans[0] = [];
  for (let current = 1; current <= amount; current += 1) {
    for (const mode of CHEM_MASTER_AMOUNTS) {
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

export function transferModes(amount: number, freeCapacity: number): TransferMode[] {
  if (closeTo(amount, freeCapacity)) return ["ALL"];
  return fixedTransferModes(amount);
}

export function formatTransferModes(modes: TransferMode[]) {
  const groups: Array<{ mode: TransferMode; count: number }> = [];
  for (const mode of modes) {
    const previous = groups[groups.length - 1];
    if (previous?.mode === mode) previous.count += 1;
    else groups.push({ mode, count: 1 });
  }
  return groups.map(({ mode, count }) => (
    count > 1 ? `${mode} × ${count}` : String(mode)
  )).join(" → ");
}
