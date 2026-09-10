import { afterEach, describe, expect, it, vi } from "vitest";
import { TileLoader, type LoadedTile } from "./tileLoader";

function tile() {
  return { image: { width: 512, height: 512, close: vi.fn() } as unknown as ImageBitmap, bytes: 20 };
}
function harness(concurrency = 2, memory = 128 * 1024 * 1024) {
  const requests: { url: string; signal: AbortSignal; resolve: (tile: LoadedTile) => void; reject: (error: Error) => void }[] = [];
  const load = vi.fn((url: string, signal: AbortSignal) => new Promise<LoadedTile>((resolve, reject) => {
    requests.push({ url, signal, resolve, reject });
  }));
  const loader = new TileLoader(vi.fn(), load, concurrency, memory);
  return { loader, requests };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe("viewport tile queue", () => {
  it("bounds concurrency and replaces obsolete zoom requests with the final viewport", async () => {
    const { loader, requests } = harness();
    loader.setWanted(["old-centre", "old-edge", "old-neighbour"]);
    expect(requests.map((request) => request.url)).toEqual(["old-centre", "old-edge"]);
    loader.setWanted(["final-centre", "final-edge", "final-neighbour"]);
    expect(requests.slice(0, 2).every((request) => request.signal.aborted)).toBe(true);
    expect(requests.slice(2).map((request) => request.url)).toEqual(["final-centre", "final-edge"]);
    const obsolete = tile();
    requests[0].resolve(obsolete);
    await flush();
    expect(obsolete.image.close).toHaveBeenCalledOnce();
    requests[2].resolve(tile());
    await flush();
    expect(requests.at(-1)?.url).toBe("final-neighbour");
    expect(requests.some((request) => request.url === "old-neighbour")).toBe(false);
    loader.dispose();
  });

  it("keeps shared requests and does not let an old completion clear a replacement", async () => {
    const { loader, requests } = harness(1);
    loader.setWanted(["same"]);
    loader.setWanted(["same", "next"]);
    expect(requests).toHaveLength(1);
    loader.setWanted(["different"]);
    loader.setWanted(["same", "next"]);
    requests[0].reject(new Error("aborted late"));
    await flush();
    expect(requests).toHaveLength(3);
    requests[2].resolve(tile());
    await flush();
    expect(requests[3].url).toBe("next");
    loader.dispose();
  });

  it("evicts decoded pixels rather than counting compressed bytes and closes on disposal", async () => {
    const { loader, requests } = harness(1, 1024 * 1024);
    const first = tile();
    loader.setWanted(["first"]);
    requests[0].resolve(first);
    await flush();
    loader.setWanted(["second"]);
    requests[1].resolve(tile());
    await flush();
    expect(loader.get("first")).toBeUndefined();
    expect(first.image.close).toHaveBeenCalledOnce();
    const second = loader.get("second")!;
    loader.dispose();
    expect(second.image.close).toHaveBeenCalledOnce();
  });

  it("retries transient failures without requiring a pan and reports exhausted attempts", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    const loader = new TileLoader(vi.fn(), load);
    loader.setWanted(["tile"]);
    await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(3);
    expect(loader.stats()).toMatchObject({ pendingTiles: 0, failedTiles: 1 });
    load.mockResolvedValue(tile());
    loader.retry();
    await flush();
    expect(loader.stats()).toMatchObject({ loadedTiles: 1, failedTiles: 0 });
    loader.dispose();
  });
});
