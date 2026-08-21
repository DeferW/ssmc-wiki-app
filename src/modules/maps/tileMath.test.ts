import { describe, expect, it } from "vitest";
import { chooseLevel, mapPixelToWorld, visibleTiles, worldToMapPixel } from "./tileMath";
import type { GridManifest, TileLevel } from "./types";

const levels: TileLevel[] = [
  { z: 0, width: 250, height: 125, columns: 1, rows: 1, lossless: false, tiles: [[0, 0]] },
  { z: 1, width: 500, height: 250, columns: 2, rows: 1, lossless: false, tiles: [[0, 0], [1, 0]] },
  { z: 2, width: 1000, height: 500, columns: 4, rows: 2, lossless: true, tiles: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]] },
];

describe("map tile math", () => {
  it("chooses the smallest pyramid level sharp enough for the screen", () => {
    expect(chooseLevel(levels, 0.2, 1).z).toBe(0);
    expect(chooseLevel(levels, 0.3, 1).z).toBe(1);
    expect(chooseLevel(levels, 0.6, 2).z).toBe(2);
  });

  it("requests only present tiles intersecting the viewport", () => {
    expect(visibleTiles(levels[2], 1000, 500, 250, { x: 0, y: 0, scale: 1 }, { width: 400, height: 240 }, 0))
      .toEqual([[0, 0], [1, 0]]);
  });

  it("round-trips map and game coordinates with the vertical render flip", () => {
    const grid: GridManifest = {
      id: "1",
      offset: { X: 10, Y: 20 },
      worldMin: { X: -2, Y: -4 },
      pixelsPerMeter: 32,
      path: "tiles/{z}/{x}-{y}.webp",
      levels,
    };
    const world = { x: 13.5, y: 22.25 };
    const pixel = worldToMapPixel(grid, world);
    expect(mapPixelToWorld(grid, pixel)).toEqual(world);
  });
});
