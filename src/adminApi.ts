import { ADMIN_DRAFT_KEY, CATEGORY_ORDER } from "./constants";
import { isMap } from "./format";
import type { AdminApiDocument, AdminDraft, AdminOverride } from "./types";

export function readAdminDraft(): AdminDraft {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ADMIN_DRAFT_KEY) || "{}");
    if (!isMap(value)) return {};
    const draft: AdminDraft = {};
    for (const [id, entry] of Object.entries(value)) {
      if (!isMap(entry)) continue;
      draft[id] = {
        ...(typeof entry.category === "string" ? { category: entry.category } : {}),
        ...(typeof entry.hidden === "boolean" ? { hidden: entry.hidden } : {}),
      };
    }
    return draft;
  } catch {
    return {};
  }
}

export function makeAdminDocument(items: AdminDraft): AdminApiDocument {
  return { schemaVersion: 1, items };
}

export function normalizeApiDocument(value: unknown): AdminDraft {
  if (!isMap(value)) return {};
  const items = value.schemaVersion === 1 && isMap(value.items) ? value.items : value;
  const draft: AdminDraft = {};
  for (const [id, entry] of Object.entries(items)) {
    if (!isMap(entry)) continue;
    const normalized: AdminOverride = {
      ...(typeof entry.category === "string" && CATEGORY_ORDER.includes(entry.category as typeof CATEGORY_ORDER[number])
        ? { category: entry.category }
        : {}),
      ...(typeof entry.hidden === "boolean" ? { hidden: entry.hidden } : {}),
    };
    if (normalized.category || normalized.hidden !== undefined) draft[id] = normalized;
  }
  return draft;
}

export function readApiError(value: unknown, fallback: string) {
  return isMap(value) && typeof value.error === "string" ? value.error : fallback;
}
