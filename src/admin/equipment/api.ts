import { CATEGORY_ORDER } from "../../modules/equipment/config";
import { isMap } from "../../modules/equipment/format";
import type { AdminLoadResult, AdminOverrides, AdminOverridesDocument } from "./types";

const WORKER_ROOT = "https://ssmc-wiki-admin-api.24dfffer.workers.dev";

const configuredRoot = import.meta.env.VITE_ADMIN_API_ROOT?.replace(/\/$/u, "");
const apiRoot = configuredRoot || (import.meta.env.DEV ? "/admin-api" : WORKER_ROOT);
const overridesUrl = `${apiRoot}/api/overrides`;

export function makeAdminDocument(items: AdminOverrides): AdminOverridesDocument {
  return { schemaVersion: 2, items };
}

export function normalizeAdminDocument(value: unknown): AdminOverrides {
  if (!isMap(value)) return {};
  const rawItems = value.schemaVersion === 2 && isMap(value.items) ? value.items : value;
  const result: AdminOverrides = {};
  for (const [id, entry] of Object.entries(rawItems)) {
    if (!id || !isMap(entry) || typeof entry.category !== "string") continue;
    if (!CATEGORY_ORDER.includes(entry.category as typeof CATEGORY_ORDER[number])) continue;
    result[id] = { category: entry.category };
  }
  return result;
}

export async function loadAdminOverrides(signal?: AbortSignal): Promise<AdminLoadResult> {
  const response = await fetch(overridesUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isMap(body) || body.ok !== true) {
    throw new Error(apiError(body, `HTTP ${response.status}`));
  }
  return {
    overrides: normalizeAdminDocument(body.overrides),
    sha: typeof body.sha === "string" ? body.sha : null,
    exists: body.exists === true,
    fallback: false,
  };
}

export async function saveAdminOverrides(
  overrides: AdminOverrides,
  sha: string | null,
  password: string,
) {
  const response = await fetch(overridesUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": password,
    },
    body: JSON.stringify({ sha, overrides: makeAdminDocument(overrides) }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isMap(body) || body.ok !== true) {
    if (response.status === 401) throw new Error("Неверный пароль администратора.");
    if (response.status === 409 || (isMap(body) && body.code === "SHA_CONFLICT")) {
      throw new Error("Overrides изменились после загрузки страницы. Обновите admin-режим и повторите правки.");
    }
    throw new Error(apiError(body, `HTTP ${response.status}`));
  }
  return {
    sha: typeof body.sha === "string" ? body.sha : null,
    created: body.created === true,
  };
}

function apiError(value: unknown, fallback: string) {
  return isMap(value) && typeof value.error === "string" ? value.error : fallback;
}

