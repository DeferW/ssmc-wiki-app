import { describe, expect, it } from "vitest";
import {
  buildPreparationPlan,
  buildMixturePlan,
  craftableReagentIds,
  fixedTransferModes,
  formatTransferModes,
  MEDICAL_VENDOR_REAGENTS,
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

function ungaReactions() {
  return [
    reaction("CMMeralyne", [["CMBicaridine", 1], ["RMCCarbon", 1], ["Water", 1]], [["CMMeralyne", 3]]),
    reaction("CMDermaline", [["RMCOxygen", 1], ["RMCPhosphorus", 1], ["CMKelotane", 1]], [["CMDermaline", 3]]),
    reaction("CMTricordrazine", [["CMInaprovaline", 1], ["CMDylovene", 1]], [["CMTricordrazine", 2]]),
    reaction("CMBicaridine", [["CMInaprovaline", 1], ["RMCCarbon", 1]], [["CMBicaridine", 2]]),
    reaction("CMKelotane", [["RMCSilicon", 1], ["RMCCarbon", 1]], [["CMKelotane", 2]]),
    reaction("CMDylovene", [["RMCSilicon", 1], ["RMCPotassium", 1], ["RMCNitrogen", 1]], [["CMDylovene", 3]]),
    reaction("CMInaprovaline", [["RMCOxygen", 1], ["RMCCarbon", 1], ["RMCSugar", 1]], [["CMInaprovaline", 3]]),
    reaction("CMDexalin", [["RMCOxygen", 2], ["RMCPhoron", 5.1]], [["CMDexalin", 1], ["RMCPhoron", 5]]),
    reaction("CMDexalinPlus", [["CMDexalin", 1], ["RMCCarbon", 1], ["RMCIron", 1]], [["CMDexalinPlus", 3]]),
  ];
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
      reaction("Product", [["RMCCarbon", 1], ["RMCOxygen", 1], ["RMCSugar", 1]], [["Product", 3]]),
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
      { kind: "source", reagentId: "RMCCarbon", name: "RMCCarbon", amount: 300 },
      { kind: "source", reagentId: "RMCOxygen", name: "RMCOxygen", amount: 300 },
      { kind: "source", reagentId: "RMCSugar", name: "RMCSugar", amount: 300 },
    ]);
    expect(plan.energyCost).toBe(90);
  });

  it("keeps every final and intermediate reaction in 1000u tanks", () => {
    const data = catalogWith([
      reaction("Intermediate", [["RMCCarbon", 1], ["RMCOxygen", 1]], [["Intermediate", 2]]),
      reaction("Product", [["Intermediate", 1], ["RMCSugar", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 400);

    expect(plan.target.batches.every((batch) => batch.vessel === "tank")).toBe(true);
    const intermediate = plan.target.batches[0].inputs.find((input) => input.inlinePreparation)?.inlinePreparation;
    expect(intermediate?.batches.every((batch) => batch.vessel === "tank")).toBe(true);
    expect(plan.tankCount).toBe(1);
  });

  it("keeps the requested final amount and isolates unavoidable intermediate surplus", () => {
    const data = catalogWith([
      reaction("Inaprovaline", [["RMCOxygen", 1], ["RMCCarbon", 1], ["RMCSugar", 1]], [["Inaprovaline", 3]]),
      reaction("Bicaridine", [["Inaprovaline", 1], ["RMCCarbon", 1]], [["Bicaridine", 2]]),
      reaction("Meralyne", [["Bicaridine", 1], ["RMCCarbon", 1], ["Water", 1]], [["Meralyne", 3]]),
    ]);
    const plan = buildPreparationPlan(data, "Meralyne", 1560);

    expect(plan.producedAmount).toBe(1560);
    expect(plan.target.batches.reduce((sum, batch) => sum + batch.targetAmount, 0)).toBe(1560);
    expect(plan.target.batches.every((batch) => batch.totalInput <= 1000)).toBe(true);
    const bicaridine = plan.target.batches.flatMap((batch) => (
      batch.inputs.flatMap((input) => input.inlinePreparation ? [input.inlinePreparation] : [])
    ));
    expect(bicaridine.every((item) => item.requestedAmount === item.producedAmount)).toBe(true);
    const inaprovaline = bicaridine.flatMap((item) => (
      item.preparations
    ));
    expect(inaprovaline.length).toBeGreaterThan(0);
    expect(inaprovaline.every((item) => item.surplusAmount > 0)).toBe(true);
  });

  it("rounds up complete reaction quanta instead of rounding ingredients", () => {
    const data = catalogWith([
      reaction(
        "Product",
        [["RMCCarbon", 1], ["RMCOxygen", 1], ["Water", 5.1]],
        [["Product", 2], ["Water", 5]],
      ),
    ]);
    const plan = buildPreparationPlan(data, "Product", 25);

    expect(plan.producedAmount).toBe(100);
    expect(plan.surplusAmount).toBe(75);
    expect(plan.target.batches).toHaveLength(1);
    expect(plan.target.batches[0].inputs.map((input) => input.amount)).toEqual([50, 50, 255]);
    expect(craftableReagentIds(data)).not.toContain("Water");
  });

  it("uses the minimum number of tanks for 1500u", () => {
    const data = catalogWith([
      reaction("Product", [["RMCCarbon", 1], ["RMCOxygen", 1], ["RMCSugar", 1]], [["Product", 3]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 1500);

    expect(plan.target.batches).toHaveLength(2);
    expect(plan.target.batches.reduce((sum, batch) => sum + batch.targetAmount, 0)).toBe(1500);
    expect(plan.target.batches.every((batch) => batch.totalInput <= 1000)).toBe(true);
  });

  it("optimizes the split without changing the requested amount", () => {
    const data = catalogWith([
      reaction("Product", [["RMCCarbon", 1], ["RMCOxygen", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 1300);

    expect(plan.target.batches).toHaveLength(2);
    expect(plan.target.batches.reduce((sum, batch) => sum + batch.targetAmount, 0)).toBe(1300);
    expect(plan.target.batches.every((batch) => batch.totalInput <= 1000)).toBe(true);
  });

  it("reorders preparations when an earlier component could trigger a foreign reaction", () => {
    const data = catalogWith([
      reaction("First", [["RMCCarbon", 1], ["RMCOxygen", 1]], [["First", 1]]),
      reaction("Second", [["RMCPhosphorus", 1], ["RMCSugar", 1]], [["Second", 1]]),
      reaction("Foreign", [["First", 1], ["RMCPhosphorus", 1]], [["Waste", 2]]),
      reaction("Product", [["First", 1], ["Second", 1]], [["Product", 2]]),
    ]);
    const plan = buildPreparationPlan(data, "Product", 100);
    const order = plan.target.batches[0].inputs.map((input) => input.reagentId);

    expect(order).toEqual(["Second", "First"]);
    expect(plan.target.batches[0].inputs.every((input) => input.preparedInPlace)).toBe(true);
  });

  it("keeps recipes with non-dispenser ingredients available", () => {
    const data = catalogWith([
      reaction("Product", [["ExternalStock", 1], ["RMCCarbon", 1]], [["Product", 2]]),
    ]);

    expect(craftableReagentIds(data)).toContain("Product");
    expect(buildPreparationPlan(data, "Product", 100).target.batches[0].inputs)
      .toContainEqual(expect.objectContaining({ reagentId: "ExternalStock", external: true }));
  });

  it("keeps intentionally hazardous recipes available with a warning", () => {
    const hazardous = reaction("Hazardous", [["Water", 1], ["RMCPotassium", 1]], [["Hazardous", 1]]);
    hazardous.effects = [{ yamlTag: "!type:SensitiveReactionExplosionEffect", value: { threshold: 0 } }];
    const competingExplosion = reaction("Explosion", [["Water", 1], ["RMCPotassium", 1]], []);
    competingExplosion.conditions = { priority: 20 };
    const data = catalogWith([hazardous, competingExplosion]);

    expect(craftableReagentIds(data)).toContain("Hazardous");
    expect(buildPreparationPlan(data, "Hazardous", 100).target.batches[0].warnings)
      .toContain("Взрывоопасная реакция при объёме от 0u.");
  });
});

describe("unga mixture presets", () => {
  it("keeps the standard 1000u composition in one tank", () => {
    const plan = buildMixturePlan(catalogWith(ungaReactions()), "unga-standard", 1000);

    expect(plan.target.batches).toHaveLength(1);
    expect(plan.producedAmount).toBe(1000);
    expect(plan.mixtureComponents?.find((item) => item.reagentId === "CMMeralyne")?.amount).toBe(180);
  });

  it("uses vendor medicines by default inside larger recipes", () => {
    const data = catalogWith(ungaReactions());
    const plan = buildMixturePlan(data, "unga-standard", 1000);
    const finalInputs = plan.target.batches[0].inputs;

    expect(finalInputs.some((item) => item.reagentId === "CMMeralyne" && item.prepared)).toBe(true);
    expect(finalInputs.some((item) => item.reagentId === "RMCCarbon")).toBe(false);
    expect(finalInputs.some((item) => item.inlinePreparation?.reagentId === "CMMeralyne")).toBe(true);
    expect(finalInputs.find((item) => item.reagentId === "CMDexalinPlus")?.prepared).toBe(true);
    expect(plan.sourceTotals.some((item) => item.reagentId === "RMCPhoron")).toBe(false);
  });

  it("expands selected vendor medicines when manual preparation is enabled", () => {
    const data = catalogWith(ungaReactions());
    const plan = buildMixturePlan(data, "unga-standard", 1000, 300, {
      manualVendorReagents: MEDICAL_VENDOR_REAGENTS,
    });
    const dexalinPlus = plan.target.preparations.find((item) => item.reagentId === "CMDexalinPlus");

    expect(MEDICAL_VENDOR_REAGENTS.has("CMDexalin")).toBe(true);
    expect(MEDICAL_VENDOR_REAGENTS.has("CMDexalinPlus")).toBe(false);
    expect(dexalinPlus?.producedAmount).toBe(30);
    expect(dexalinPlus?.batches[0].inputs.find((item) => item.reagentId === "CMDexalin"))
      .toMatchObject({ amount: 10, prepared: true });
    expect(plan.sourceTotals.some((item) => item.reagentId === "RMCPhoron")).toBe(true);
    expect(plan.tankCount).toBe(3);
  });

  it("plans 4000u as four final tanks and cooks shared surplus only once", () => {
    const data = catalogWith(ungaReactions());
    const plan = buildMixturePlan(data, "unga-standard", 4000);
    const dexalinPlus = plan.target.preparations.find((item) => item.reagentId === "CMDexalinPlus");

    expect(plan.target.batches).toHaveLength(4);
    expect(plan.target.batches.every((batch) => batch.totalInput === 1000)).toBe(true);
    expect(dexalinPlus).toMatchObject({ requestedAmount: 80, producedAmount: 90, surplusAmount: 10 });
    expect(plan.producedAmount).toBe(4000);
    expect(plan.tankCount).toBe(5);
  });

  it("offers a vendor medicine directly and can expand it on request", () => {
    const data = catalogWith(ungaReactions());
    const fromVendor = buildPreparationPlan(data, "CMBicaridine", 100);
    const handmade = buildPreparationPlan(data, "CMBicaridine", 100, 300, {
      manualVendorReagents: new Set(["CMBicaridine", "CMInaprovaline"]),
    });

    expect(craftableReagentIds(data)).toContain("CMBicaridine");
    expect(fromVendor.sourceTotals).toContainEqual(expect.objectContaining({ reagentId: "CMBicaridine" }));
    expect(handmade.sourceTotals.some((item) => item.reagentId === "CMBicaridine")).toBe(false);
    expect(handmade.sourceTotals.map((item) => item.reagentId)).toEqual(expect.arrayContaining([
      "RMCOxygen", "RMCCarbon", "RMCSugar",
    ]));
  });

  it("rounds custom mixture volumes to measurable 250u portions", () => {
    const plan = buildMixturePlan(catalogWith(ungaReactions()), "unga-standard", 100);

    expect(plan.producedAmount).toBe(250);
    expect(plan.mixtureComponents?.every((item) => item.amount % 5 === 0)).toBe(true);
  });
});
