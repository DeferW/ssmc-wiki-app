import { afterEach, expect, it, vi } from "vitest";
import { fetchRemoteJson } from "./remoteJson";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("does not fetch when the caller has already cancelled", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const controller = new AbortController();
  controller.abort();
  await expect(fetchRemoteJson("/data", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});

it("times out a stalled request and releases its timer", async () => {
  vi.useFakeTimers();
  vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const result = expect(fetchRemoteJson("/data")).rejects.toThrow("Не удалось загрузить данные");
  await vi.runAllTimersAsync();
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
