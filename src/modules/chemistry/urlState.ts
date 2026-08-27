import { CHEMISTRY_SECTIONS } from "./config";
import type { ChemistrySectionId } from "./types";

export type ChemistryUrlState = {
  view: "catalog" | "planner";
  sectionId: ChemistrySectionId;
  query: string;
  openReagentId: string | null;
  plannerReagentId: string;
  requestedAmount: string;
  shouldBuild: boolean;
};

const DEFAULT_SECTION: ChemistrySectionId = "ordnance";
const DEFAULT_AMOUNT = "100";
const sectionIds = new Set<ChemistrySectionId>(CHEMISTRY_SECTIONS.map((section) => section.id));

export function readChemistryUrlState(params: URLSearchParams): ChemistryUrlState {
  const rawSection = params.get("section") as ChemistrySectionId | null;
  const rawAmount = params.get("amount");
  return {
    view: params.get("view") === "planner" ? "planner" : "catalog",
    sectionId: rawSection && sectionIds.has(rawSection) ? rawSection : DEFAULT_SECTION,
    query: params.get("q") ?? "",
    openReagentId: params.get("item"),
    plannerReagentId: params.get("reagent") ?? "",
    requestedAmount: rawAmount !== null && /^\d*$/u.test(rawAmount) ? rawAmount : DEFAULT_AMOUNT,
    shouldBuild: params.get("run") === "1",
  };
}

export function updateChemistryUrl(
  current: URLSearchParams,
  changes: Partial<Record<"view" | "section" | "q" | "item" | "reagent" | "amount" | "run", string | null>>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  }
  return next;
}
