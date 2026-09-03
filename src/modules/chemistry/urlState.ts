import { CHEMISTRY_SECTIONS } from "./config";
import { MIXTURE_PRESETS } from "./planner";
import type { MixturePreset } from "./planner";
import type { BeakerCapacity, ChemistrySectionId } from "./types";

export type ChemistryUrlState = {
  view: "catalog" | "planner";
  sectionId: ChemistrySectionId;
  query: string;
  openReagentId: string | null;
  plannerReagentId: string;
  mixtureId: MixturePreset["id"] | null;
  requestedAmount: string;
  beakerCapacity: BeakerCapacity;
  shouldBuild: boolean;
};

const DEFAULT_SECTION: ChemistrySectionId = "ordnance";
const DEFAULT_AMOUNT = "100";
const EMPTY_AMOUNT = "_";
const DEFAULT_BEAKER_CAPACITY: BeakerCapacity = 300;
const sectionIds = new Set<ChemistrySectionId>(CHEMISTRY_SECTIONS.map((section) => section.id));
const mixtureIds = new Set<MixturePreset["id"]>(MIXTURE_PRESETS.map((preset) => preset.id));

export function readChemistryUrlState(params: URLSearchParams): ChemistryUrlState {
  const rawSection = params.get("section") as ChemistrySectionId | null;
  const rawMixture = params.get("mix") as MixturePreset["id"] | null;
  const rawAmount = params.get("amount");
  return {
    view: params.get("view") === "planner" ? "planner" : "catalog",
    sectionId: rawSection && sectionIds.has(rawSection) ? rawSection : DEFAULT_SECTION,
    query: params.get("q") ?? "",
    openReagentId: params.get("item"),
    plannerReagentId: params.get("reagent") ?? "",
    mixtureId: rawMixture && mixtureIds.has(rawMixture) ? rawMixture : null,
    requestedAmount: rawAmount === EMPTY_AMOUNT
      ? ""
      : rawAmount !== null && /^\d+$/u.test(rawAmount) ? rawAmount : DEFAULT_AMOUNT,
    beakerCapacity: params.get("beaker") === "60"
      ? 60
      : params.get("beaker") === "120" ? 120 : DEFAULT_BEAKER_CAPACITY,
    shouldBuild: params.get("run") === "1",
  };
}

export function updateChemistryUrl(
  current: URLSearchParams,
  changes: Partial<Record<"view" | "section" | "q" | "item" | "reagent" | "mix" | "amount" | "beaker" | "run", string | null>>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (key === "amount" && value === "") next.set(key, EMPTY_AMOUNT);
    else if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  return next;
}
