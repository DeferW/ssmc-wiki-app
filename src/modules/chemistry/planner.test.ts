import { describe, expect, it } from "vitest";
import {
  buildPreparationPlan,
  buildMixturePlan,
  craftableReagentIds,
  fixedTransferModes,
  formatTransferModes,
  transferLoads,
  transferModes,
} from "./planner";
import type { ChemistryCatalog, ChemistryReaction } from "./types";

function catalogWith(reactions: ChemistryReaction[]): ChemistryCatalog {
  const ids = new Set(
    reactions.flatMap((reaction) => [
      ...reaction.reactants.map((item) => item.id),
      ...reaction.products.map((item) => item.id),
    ]),
  );
  return {
    schemaVersion: 1,
    source: { repository: "test", branch: "main", commit: "test" },
    locale: "ru-RU",
    counts: {
      customReagents: ids.size,
      upstreamDependencies: 0,
      customReactions: reactions.length,
      unlistedCustomReagents: 0,
    },
    catalogSections: {
      ordnance: [], medicine: [], drinks: [], elements: [], other: [],
    },
    reagents: Object.fromEntries([...ids].map((id) => [id, {
      id,
      name: id,
      origin: "test",
    }])),
    dependencies: {},
    reactions: Object.fromEntries(reactions.map((reaction) => [reaction.id, reaction])),
  };
}

function reaction(
  id: string,
  reactants: Array<[string, number]>,
  products: Array<[string, number]>,
): ChemistryReaction {
  return {
    id,
    origin: "test",
    reactants: reactants.map(([reagentId, amount]) => ({
      id: reagentId, name: reagentId, amount,
    })),
    products: products.map(([reagentId, amount]) => ({
      id: reagentId, name: reagentId, amount,
    })),
  };
}

describe("medbay chemical dispenser transfer modes", () => {
  it("uses the minimum number of fixed button presses", () => {
    expect(fixedTransferModes(40)).toEqual([40]);
    expect(fixedTransferModes(75)).toEqual([40, 30, 5]);
  });

  it("rejects amounts that cannot be dispensed in 5u increments", () => {
    expect(() => transferModes(31)).toThrow(/не может отмерить/u);
  });

  it("writes every press explicitly", () => {
    expect(formatTransferModes(fixedTransferModes(130))).toBe("40 + 40 + 40 + 10");
  });

  it("splits transfers by the selected beaker capacity", () => {
    expect(transferLoads(650, 300)).toEqual([300, 300, 50]);
    expect(transferLoads(240, 120)).toEqual([120, 120]);
  });
});

describe("chemistry preparation planner", () => {
  it("prepares 900u in one tank through a 300u beaker", () => {
    const data = catalogWith([
      reaction("Product", [["A", 1], ["B", 1], ["C", 1]], [["Product", 3]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 900);

    expect(plan.target.batches).toHaveLength(1);
    expect(plan.target.batches[0]).toMatchObject({
      vessel: "tank",
      capacity: 1000,
      beakerCapacity: 300,
      targetAmount: 900,
    });
    expect(plan.target.batches[0].inputs.map((input) => input.amount)).toEqual([300, 300, 300]);
    expect(plan.sourceTotals).toEqual([
      { kind: "source", reagentId: "A", name: "A", amount: 300 },
      { kind: "source", reagentId: "B", name: "B", amount: 300 },
      { kind: "source", reagentId: "C", name: "C", amount: 300 },
    ]);
    expect(plan.energyCost).toBe(90);
  });

  it("keeps every final and intermediate reaction in 1000u tanks", () => {
    const data = catalogWith([
      reaction("Intermediate", [["A", 1], ["B", 1]], [["Intermediate", 2]]),
      reaction("Product", [["Intermediate", 1], ["C", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 400);

    expect(plan.target.batches.every((batch) => batch.vessel === "tank")).toBe(true);
    const intermediate = plan.target.preparations[0];
    expect(intermediate?.batches.every((batch) => batch.vessel === "tank")).toBe(true);
  });

  it("rounds the final recipe so every nested intermediate is consumed exactly", () => {
    const data = catalogWith([
      reaction("Inaprovaline", [["Oxygen", 1], ["Carbon", 1], ["Sugar", 1]], [["Inaprovaline", 3]]),
      reaction("Bicaridine", [["Inaprovaline", 1], ["Carbon", 1]], [["Bicaridine", 2]]),
      reaction("Meralyne", [["Bicaridine", 1], ["Carbon", 1], ["Water", 1]], [["Meralyne", 3]]),
    ]);
    const plan = buildPreparationPlan(data, "Meralyne", 1560);

    expect(plan.producedAmount).toBe(1620);
    expect(plan.target.batches.map((batch) => batch.targetAmount)).toEqual([810, 810]);
    expect(plan.target.preparations).toHaveLength(2);
    for (const bicaridine of plan.target.preparations) {
      const inaprovaline = bicaridine.preparations[0];
      expect(bicaridine.requestedAmount).toBe(bicaridine.producedAmount);
      expect(inaprovaline?.requestedAmount).toBe(inaprovaline?.producedAmount);
    }
  });

  it("rounds up complete reaction quanta instead of rounding ingredients", () => {
    const data = catalogWith([
      reaction(
        "Product",
        [["A", 1], ["B", 1], ["Catalyst", 5.1]],
        [["Product", 2], ["Catalyst", 5]],
      ),
    ]);
    const plan = buildPreparationPlan(data, "Product", 25);

    expect(plan.producedAmount).toBe(100);
    expect(plan.surplusAmount).toBe(75);
    expect(plan.target.batches).toHaveLength(1);
    expect(plan.target.batches[0].inputs.map((input) => input.amount)).toEqual([50, 50, 255]);
    expect(craftableReagentIds(data)).not.toContain("Catalyst");
  });

  it("balances 1500u across two tanks when the pour count is equal", () => {
    const data = catalogWith([
      reaction("Product", [["A", 1], ["B", 1], ["C", 1]], [["Product", 3]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 1500);

    expect(plan.target.batches.map((batch) => batch.targetAmount)).toEqual([750, 750]);
    expect(plan.target.batches.every((batch) => batch.totalInput <= 1000)).toBe(true);
  });

  it("deviates from an equal split when that saves beaker pours", () => {
    const data = catalogWith([
      reaction("Product", [["A", 1], ["B", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 1300);

    expect(plan.target.batches.map((batch) => batch.targetAmount)).toEqual([700, 600]);
  });
});

describe("unga mixture presets", () => {
  it("keeps the standard 1000u composition in one tank", () => {
    const plan = buildMixturePlan(catalogWith([]), "unga-standard", 1000);

    expect(plan.target.batches).toHaveLength(1);
    expect(plan.producedAmount).toBe(1000);
    expect(plan.mixtureComponents?.find((item) => item.reagentId === "CMMeralyne")?.amount).toBe(180);
  });

  it("combines a source shared by several component recipes into one transfer", () => {
    const data = catalogWith([
      reaction("CMMeralyne", [["Shared", 1], ["A", 1]], [["CMMeralyne", 2]]),
      reaction("CMDermaline", [["Shared", 1], ["B", 1]], [["CMDermaline", 2]]),
    ]);
    const plan = buildMixturePlan(data, "unga-standard", 1000);

    expect(plan.sourceTotals.filter((item) => item.reagentId === "Shared")).toEqual([
      { kind: "source", reagentId: "Shared", name: "Shared", amount: 180 },
    ]);
  });
});
