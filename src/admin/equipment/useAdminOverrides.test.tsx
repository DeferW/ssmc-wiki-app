import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalog } from "../../modules/equipment/types";

const apiMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    loadAdminOverrides: apiMocks.load,
    saveAdminOverrides: apiMocks.save,
  };
});

import { useAdminOverrides } from "./useAdminOverrides";

const DRAFT_KEY = "ssmc.admin.catalog-overrides.v2";
const catalog = {
  items: {
    Item: {
      id: "Item",
      name: "Item",
      category: "Медицина",
      classification: { automaticCategory: "Медицина" },
    },
  },
} as unknown as Catalog;

const roots: Root[] = [];

function Harness({ onChange }: {
  onChange: (value: ReturnType<typeof useAdminOverrides>) => void;
}) {
  const value = useAdminOverrides(true, catalog);
  useEffect(() => onChange(value), [onChange, value]);
  return null;
}

async function mountHarness() {
  let latest: ReturnType<typeof useAdminOverrides> | undefined;
  const capture = (value: ReturnType<typeof useAdminOverrides>) => { latest = value; };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => {
    root.render(<Harness onChange={capture} />);
    await Promise.resolve();
  });
  return () => {
    if (!latest) throw new Error("Admin hook did not render");
    return latest;
  };
}

beforeEach(() => {
  localStorage.clear();
  apiMocks.load.mockReset().mockResolvedValue({
    overrides: { Item: { category: "Броня" } },
    sha: "sha",
    exists: true,
    fallback: false,
  });
  apiMocks.save.mockReset().mockResolvedValue({ sha: "next-sha", created: false });
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  vi.restoreAllMocks();
});

describe("admin override draft persistence", () => {
  it("does not store freshly loaded remote overrides as a local draft", async () => {
    const current = await mountHarness();

    expect(current().hydrated).toBe(true);
    expect(current().draft).toEqual({ Item: { category: "Броня" } });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("stores an actual category edit as a local draft", async () => {
    const current = await mountHarness();

    await act(async () => {
      current().setCategory("Item", "Снаряжение", catalog.items.Item);
    });

    expect(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null")).toEqual({
      schemaVersion: 2,
      items: { Item: { category: "Снаряжение" } },
    });
  });

  it("does not report a successful remote save as failed when storage is blocked", async () => {
    const current = await mountHarness();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    await act(async () => current().setPassword("test-password"));
    let saved = false;
    await act(async () => {
      saved = await current().save();
    });

    expect(saved).toBe(true);
    expect(current().state).toBe("saved");
  });
});
