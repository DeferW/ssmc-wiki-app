import { describe, expect, it } from "vitest";
import { readChemistryUrlState, updateChemistryUrl } from "./urlState";

describe("chemistry URL state", () => {
  it("reads a shared planner setup", () => {
    const state = readChemistryUrlState(new URLSearchParams("view=planner&reagent=Bicaridine&amount=350&beaker=120&run=1"));
    expect(state).toMatchObject({
      view: "planner",
      plannerReagentId: "Bicaridine",
      requestedAmount: "350",
      beakerCapacity: 120,
      shouldBuild: true,
    });
  });

  it("keeps unrelated chemistry state while updating one field", () => {
    const next = updateChemistryUrl(new URLSearchParams("section=medicine&q=acid"), { item: "SulfuricAcid" });
    expect(next.toString()).toBe("section=medicine&q=acid&item=SulfuricAcid");
  });

  it("keeps an intentionally empty amount while the user edits the field", () => {
    const next = updateChemistryUrl(new URLSearchParams("view=planner"), { amount: "" });

    expect(next.toString()).toBe("view=planner&amount=_");
    expect(readChemistryUrlState(next).requestedAmount).toBe("");
  });

  it("falls back safely for malformed values", () => {
    expect(readChemistryUrlState(new URLSearchParams("view=nope&section=nope&amount=abc"))).toMatchObject({
      view: "catalog",
      sectionId: "ordnance",
      requestedAmount: "100",
      beakerCapacity: 300,
    });
  });
});
