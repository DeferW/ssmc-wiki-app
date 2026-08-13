import { describe, expect, it } from "vitest";
import { describeEffect, describePlantEffect } from "./effects";
import type { ChemistryEffect, ChemistryReagent } from "./types";

function reagent(overdose = 10, criticalOverdose = 20): ChemistryReagent {
  return {
    id: "TestReagent",
    name: "Тестовый реагент",
    origin: "test",
    properties: { overdose, criticalOverdose },
  };
}

describe("chemistry effect descriptions", () => {
  it("translates potency into concrete normal and overdose effects", () => {
    const effect: ChemistryEffect = { yamlTag: "!type:Neogenetic", value: { potency: 4 } };
    const descriptions = describeEffect(effect, reagent());

    expect(descriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "normal", text: expect.stringContaining("Лечит 1 ед. механического") }),
      expect.objectContaining({ tier: "overdose", text: expect.stringContaining("ожогового") }),
      expect.objectContaining({ tier: "critical", text: expect.stringContaining("токсического") }),
    ]));
    expect(descriptions.map(({ text }) => text).join(" ")).not.toContain("potency");
  });

  it("places threshold effects into overdose tiers", () => {
    const effect: ChemistryEffect = {
      yamlTag: "!type:ChemVomit",
      value: {
        conditions: [{ yamlTag: "!type:ReagentThreshold", value: { min: 20 } }],
      },
    };

    expect(describeEffect(effect, reagent())[0]).toMatchObject({
      tier: "critical",
      text: "Вызывает рвоту.",
      tone: "harmful",
    });
  });

  it("translates plant effects and assigns a visual tone", () => {
    expect(describePlantEffect({
      yamlTag: "!type:PlantAdjustHealth",
      value: { amount: 3 },
    })).toMatchObject({
      text: "Восстанавливает здоровье растения на 3.",
      tone: "beneficial",
    });
  });
});
