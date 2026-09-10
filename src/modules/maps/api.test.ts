import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

it("deduplicates catalogue requests and allows retry after a network failure", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, maps: [{}] }) } as Response);
  const { loadMapCatalog } = await import("./api");
  const first = loadMapCatalog();
  expect(loadMapCatalog()).toBe(first);
  await expect(first).rejects.toThrow();
  await expect(loadMapCatalog()).resolves.toMatchObject({ schemaVersion: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not permanently cache a broken static item response", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 99 }) } as Response)
    .mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, items: {}, publicCatalog: { itemIds: [] } }) } as Response);
  const { loadMapStaticItems } = await import("./api");
  await expect(loadMapStaticItems()).rejects.toThrow();
  await expect(loadMapStaticItems()).resolves.toMatchObject({ schemaVersion: 1 });
});
