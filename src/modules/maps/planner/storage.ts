import { decodePayload, encodePayload, type DecodedPlan } from "./codec";

// Browser storage holds per-device conveniences only: an autosaved draft for each
// map and the "Мои планы" list. Plans travel between people as codes or links.
const DRAFTS_KEY = "ssmc-map-plan-drafts-v1";
const SAVED_KEY = "ssmc-map-plans-v1";
export const MAX_SAVED_PLANS = 50;

export type SavedPlan = { id: string; name: string; mapId: string; code: string; savedAt: number };

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The draft reuses the plan payload, so its checksum rejects edited or broken storage. */
export function loadDraft(mapId: string): DecodedPlan | undefined {
  const drafts = read(DRAFTS_KEY) as Record<string, string> | null;
  const value = drafts && typeof drafts === "object" ? drafts[mapId] : undefined;
  if (typeof value !== "string") return undefined;
  try {
    const plan = decodePayload(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
    return plan.mapId === mapId ? plan : undefined;
  } catch {
    return undefined;
  }
}

export function saveDraft(plan: DecodedPlan): void {
  const drafts = { ...((read(DRAFTS_KEY) as Record<string, string> | null) ?? {}) };
  if (plan.elements.length || plan.zones.length) drafts[plan.mapId] = toBase64(encodePayload(plan));
  else delete drafts[plan.mapId];
  write(DRAFTS_KEY, drafts);
}

export function loadSavedPlans(): SavedPlan[] {
  const value = read(SAVED_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter((plan): plan is SavedPlan => (
    plan && typeof plan.id === "string" && typeof plan.name === "string" && typeof plan.mapId === "string"
    && typeof plan.code === "string" && typeof plan.savedAt === "number"
  ));
}

/** Saving under an existing name on the same map replaces that plan. */
export function storeSavedPlan(plans: SavedPlan[], plan: Omit<SavedPlan, "id" | "savedAt">, now = Date.now()): SavedPlan[] | undefined {
  const existing = plans.find((saved) => saved.mapId === plan.mapId && saved.name === plan.name);
  const entry: SavedPlan = { ...plan, id: existing?.id ?? `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, savedAt: now };
  const others = plans.filter((saved) => saved.id !== entry.id);
  if (!existing && others.length >= MAX_SAVED_PLANS) return undefined;
  const next = [entry, ...others];
  return write(SAVED_KEY, next) ? next : undefined;
}

export function deleteSavedPlan(plans: SavedPlan[], id: string): SavedPlan[] {
  const next = plans.filter((plan) => plan.id !== id);
  write(SAVED_KEY, next);
  return next;
}
