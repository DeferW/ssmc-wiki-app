import { chooseLevel, visibleTiles } from "./tileMath";
import type { GridManifest, TileLevel, ViewState } from "./types";

export type TileRequest = { url: string; priority: number; distance: number };
export type TileDraw = { url: string; x: number; y: number; width: number; height: number };

export function tileUrl(pattern: string, manifestUrl: string, z: number, x: number, y: number): string {
  const url = new URL(pattern.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), manifestUrl);
  const revision = new URL(manifestUrl).searchParams.get("v");
  if (revision) url.searchParams.set("v", revision);
  return url.toString();
}

export function planTiles(
  grid: GridManifest,
  manifestUrl: string,
  tileSize: number,
  view: ViewState,
  size: { width: number; height: number },
  pixelRatio: number,
) {
  const maximum = grid.levels.at(-1)!;
  const level = chooseLevel(grid.levels, view.scale, pixelRatio);
  const requests: TileRequest[] = [];
  const draw: TileDraw[] = [];
  const index = grid.levels.indexOf(level);
  const centre = { x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale };
  const describe = (entry: TileLevel, x: number, y: number): TileDraw => ({
    url: tileUrl(grid.path, manifestUrl, entry.z, x, y),
    x: x * tileSize * maximum.width / entry.width,
    y: y * tileSize * maximum.height / entry.height,
    width: Math.min(tileSize, entry.width - x * tileSize) * maximum.width / entry.width,
    height: Math.min(tileSize, entry.height - y * tileSize) * maximum.height / entry.height,
  });
  const request = (tile: TileDraw, priority: number) => requests.push({
    url: tile.url,
    priority,
    distance: Math.hypot(tile.x + tile.width / 2 - centre.x, tile.y + tile.height / 2 - centre.y) * view.scale,
  });
  // Cached intermediate levels stay on screen while detail arrives. This also
  // preserves already decoded high resolution tiles when zooming back out.
  for (const entry of grid.levels) {
    for (const [x, y] of visibleTiles(entry, maximum.width, maximum.height, tileSize, view, size, 0)) {
      const tile = describe(entry, x, y);
      draw.push(tile);
      if (entry === level) request(tile, 0);
      else if (entry === grid.levels[index - 1]) request(tile, 1);
      else if (entry === grid.levels[0]) request(tile, 2);
    }
  }
  // One neighbouring ring is speculative; it can never run ahead of detail.
  for (const [x, y] of visibleTiles(level, maximum.width, maximum.height, tileSize, view, size, 1)) {
    request(describe(level, x, y), 3);
  }
  return { level, requests, draw };
}

export function prioritizeTiles(requests: TileRequest[]): string[] {
  return [...new Set(requests
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance)
    .map((request) => request.url))];
}
