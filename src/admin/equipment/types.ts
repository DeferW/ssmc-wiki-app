export type AdminOverride = {
  category: string;
};

export type AdminOverrides = Record<string, AdminOverride>;

export type AdminOverridesDocument = {
  schemaVersion: 2;
  items: AdminOverrides;
};

export type AdminLoadResult = {
  overrides: AdminOverrides;
  sha: string | null;
  exists: boolean;
  fallback: boolean;
};

export type AdminSyncState = "loading" | "ready" | "saving" | "saved" | "error";
