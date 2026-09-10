export type LoadedTile = { image: ImageBitmap; bytes: number };
type CachedTile = LoadedTile & { memory: number };
type LoadTile = (url: string, signal: AbortSignal) => Promise<LoadedTile>;

async function fetchTile(url: string, signal: AbortSignal): Promise<LoadedTile> {
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
  const blob = await response.blob();
  signal.throwIfAborted();
  return { image: await createImageBitmap(blob), bytes: blob.size };
}

/** One viewport owns the queue. Obsolete zoom levels cannot delay its new tiles. */
export class TileLoader {
  private cache = new Map<string, CachedTile>();
  private active = new Map<string, AbortController>();
  private wanted = new Set<string>();
  private failures = new Map<string, { attempts: number; retryAt: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private memory = 0;

  constructor(
    private changed: () => void,
    private load: LoadTile = fetchTile,
    private concurrency = 6,
    private memoryBudget = 128 * 1024 * 1024,
  ) {}

  get(url: string): LoadedTile | undefined {
    const tile = this.cache.get(url);
    if (tile) {
      this.cache.delete(url);
      this.cache.set(url, tile);
    }
    return tile;
  }

  /** URLs are ordered by viewport priority, then distance from its centre. */
  setWanted(urls: string[]) {
    if (this.disposed) return;
    this.wanted = new Set(urls);
    for (const [url, controller] of this.active) {
      if (this.wanted.has(url)) continue;
      this.active.delete(url);
      controller.abort();
    }
    for (const url of this.failures.keys()) {
      if (!this.wanted.has(url)) this.failures.delete(url);
    }
    this.trim();
    this.pump();
    this.changed();
  }

  retry() {
    this.failures.clear();
    this.pump();
    this.changed();
  }

  stats() {
    let pendingTiles = 0;
    let failedTiles = 0;
    for (const url of this.wanted) {
      if (this.cache.has(url)) continue;
      if ((this.failures.get(url)?.attempts ?? 0) >= 3) failedTiles += 1;
      else pendingTiles += 1;
    }
    return {
      loadedTiles: this.cache.size,
      loadedBytes: [...this.cache.values()].reduce((sum, tile) => sum + tile.bytes, 0),
      pendingTiles,
      failedTiles,
    };
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
    for (const tile of this.cache.values()) tile.image.close();
    this.cache.clear();
    this.wanted.clear();
    this.failures.clear();
    this.memory = 0;
  }

  private trim() {
    // Keep visible tiles pinned. Budget counts decoded pixels, not WebP bytes.
    for (const [url, tile] of this.cache) {
      if (this.memory <= this.memoryBudget) break;
      if (this.wanted.has(url)) continue;
      this.cache.delete(url);
      this.memory -= tile.memory;
      tile.image.close();
    }
  }

  private pump() {
    if (this.disposed) return;
    clearTimeout(this.timer);
    let nextRetry = Infinity;
    for (const url of this.wanted) {
      if (this.active.size >= this.concurrency) break;
      if (this.cache.has(url) || this.active.has(url)) continue;
      const failure = this.failures.get(url);
      if (failure && failure.attempts >= 3) continue;
      if (failure && failure.retryAt > Date.now()) {
        nextRetry = Math.min(nextRetry, failure.retryAt);
        continue;
      }
      const controller = new AbortController();
      this.active.set(url, controller);
      void this.load(url, controller.signal)
        .then((tile) => {
          if (this.disposed || controller.signal.aborted || this.active.get(url) !== controller) {
            tile.image.close();
            return;
          }
          const memory = tile.image.width * tile.image.height * 4;
          this.cache.set(url, { ...tile, memory });
          this.memory += memory;
          this.failures.delete(url);
          this.trim();
        })
        .catch(() => {
          if (controller.signal.aborted || this.disposed) return;
          const attempts = (this.failures.get(url)?.attempts ?? 0) + 1;
          this.failures.set(url, { attempts, retryAt: Date.now() + 500 * 2 ** (attempts - 1) });
        })
        .finally(() => {
          if (this.active.get(url) === controller) this.active.delete(url);
          if (this.disposed) return;
          this.pump();
          this.changed();
        });
    }
    if (Number.isFinite(nextRetry)) {
      this.timer = setTimeout(() => this.pump(), Math.max(0, nextRetry - Date.now()));
    }
  }
}
