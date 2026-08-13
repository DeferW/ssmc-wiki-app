import { describe, expect, it } from "vitest";
import {
  buildPreparationPlan,
  craftableReagentIds,
  fixedTransferModes,
  tankTransferPortions,
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

describe("ChemMaster transfer modes", () => {
  it("uses the minimum number of fixed button presses", () => {
    expect(fixedTransferModes(40)).toEqual([30, 10]);
    expect(fixedTransferModes(75)).toEqual([50, 25]);
  });

  it("uses ALL only when the requested reagent fills the remaining volume", () => {
    expect(transferModes(75, 75)).toEqual(["ALL"]);
    expect(transferModes(75, 100)).toEqual([50, 25]);
  });

  it("moves tank ingredients through 100u beakers", () => {
    expect(tankTransferPortions(250)).toEqual([
      { amount: 100, modes: ["ALL"] },
      { amount: 100, modes: ["ALL"] },
      { amount: 50, modes: [50] },
    ]);
  });
});

describe("chemistry preparation planner", () => {
  it("splits 400u into four 100u beaker batches", () => {
    const data = catalogWith([
      reaction("Product", [["A", 1], ["B", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 400, "beakers");

    expect(plan.target.batches).toHaveLength(4);
    expect(plan.target.batches.map((batch) => batch.targetAmount)).toEqual([
      100, 100, 100, 100,
    ]);
    expect(plan.sourceTotals).toEqual([
      { kind: "source", reagentId: "A", name: "A", amount: 200 },
      { kind: "source", reagentId: "B", name: "B", amount: 200 },
    ]);
  });

  it("uses one 1000u tank while keeping intermediate preparation in beakers", () => {
    const data = catalogWith([
      reaction("Intermediate", [["A", 1], ["B", 1]], [["Intermediate", 2]]),
      reaction("Product", [["Intermediate", 1], ["C", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 400, "tank");

    expect(plan.target.batches).toHaveLength(1);
    expect(plan.target.batches[0].vessel).toBe("tank");
    const intermediate = plan.target.preparations[0];
    expect(intermediate?.batches).toHaveLength(2);
    expect(intermediate?.batches.every((batch) => batch.vessel === "beaker")).toBe(true);
  });

  it("rounds up complete reaction quanta instead of rounding ingredients", () => {
    const data = catalogWith([
      reaction(
        "Product",
        [["A", 1], ["B", 1], ["Catalyst", 5.1]],
        [["Product", 2], ["Catalyst", 5]],
      ),
    ]);
    const plan = buildPreparationPlan(data, "Product", 25, "beakers");

    expect(plan.producedAmount).toBe(40);
    expect(plan.surplusAmount).toBe(15);
    expect(plan.target.batches).toHaveLength(2);
    expect(plan.target.batches[0].inputs.map((input) => input.amount)).toEqual([10, 10, 51]);
    expect(craftableReagentIds(data)).not.toContain("Catalyst");
  });

  it("rejects a tank recipe that exceeds 1000u", () => {
    const data = catalogWith([
      reaction("Product", [["A", 1], ["B", 1]], [["Product", 2]]),
    ]);

    expect(() => buildPreparationPlan(data, "Product", 1002, "tank"))
      .toThrow(/лимита 1000u/);
  });
});
