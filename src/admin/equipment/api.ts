import { CATEGORY_ORDER } from "../../modules/equipment/config";
import { isMap } from "../../modules/equipment/format";
import type { AdminLoadResult, AdminOverrides, AdminOverridesDocument } from "./types";

const WORKER_ROOT = "https://ssmc-wiki-admin-api.24dfffer.workers.dev";
const GITHUB_CONTENTS_URL =
  "https://api.github.com/repos/DeferW/ssmc-wiki-app/contents/config/catalog-overrides.json?ref=main";

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
  return loadOverridesFromGitHub(signal);
}

async function loadOverridesFromGitHub(signal?: AbortSignal): Promise<AdminLoadResult> {
  const response = await fetch(GITHUB_CONTENTS_URL, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (response.status === 404) return { overrides: {}, sha: null, exists: false, fallback: true };
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isMap(body)) throw new Error(apiError(body, `GitHub HTTP ${response.status}`));
  const content = typeof body.content === "string" ? decodeBase64Utf8(body.content) : "";
  const document = content.trim() ? JSON.parse(content) as unknown : {};
  return {
    overrides: normalizeAdminDocument(document),
    sha: typeof body.sha === "string" ? body.sha : null,
    exists: true,
    fallback: true,
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

function decodeBase64Utf8(value: string) {
  const binary = window.atob(value.replace(/\s/gu, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
