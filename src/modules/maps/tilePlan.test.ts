import { describe, expect, it } from "vitest";
import { planTiles, prioritizeTiles, tileUrl } from "./tilePlan";
import type { GridManifest } from "./types";

const grid: GridManifest = {
  id: "0", offset: { X: 0, Y: 0 }, pixelsPerMeter: 32, path: "tiles/g0/{z}/{x}-{y}.webp",
  levels: [1, 2, 4, 8].map((count, z) => ({
    z, width: count * 512, height: count * 512, columns: count, rows: count, lossless: z === 3,
    tiles: Array.from({ length: count * count }, (_, i) => [i % count, Math.floor(i / count)] as [number, number]),
  })),
};
const url = "https://example.test/data/maps/map/tiles.json?v=content-hash";

describe("tile selection", () => {
  it("prioritizes visible detail over neighbours and retains intermediate cached levels", () => {
    const plan = planTiles(grid, url, 512, { x: -1536, y: -1536, scale: 1 }, { width: 512, height: 512 }, 1);
    const ordered = prioritizeTiles(plan.requests);
    expect(ordered[0]).toContain("/3/3-3.webp");
    expect(plan.draw.some((tile) => tile.url.includes("/2/"))).toBe(true);
    expect(plan.requests.filter((request) => request.priority === 0).length).toBeLessThan(10);
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it("does not download a whole large insert when only one corner is visible", () => {
    const plan = planTiles(grid, url, 512, { x: -3800, y: -3800, scale: 1 }, { width: 800, height: 600 }, 1);
    expect(prioritizeTiles(plan.requests).length).toBeLessThan(12);
    expect(plan.draw.length).toBeLessThan(12);
  });

  it("does not queue an offscreen insert", () => {
    expect(planTiles(grid, url, 512, { x: 10000, y: 10000, scale: 1 }, { width: 800, height: 600 }, 1).requests).toEqual([]);
  });

  it("inherits a content revision without inventing a schema-based cache key", () => {
    expect(tileUrl(grid.path, url, 2, 1, 0)).toBe("https://example.test/data/maps/map/tiles/g0/2/1-0.webp?v=content-hash");
    expect(tileUrl(grid.path, url.split("?")[0], 2, 1, 0)).not.toContain("?");
  });
});
