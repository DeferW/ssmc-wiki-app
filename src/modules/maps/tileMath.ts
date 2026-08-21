import type { GridManifest, Point, TileLevel, ViewState } from "./types";

export function chooseLevel(levels: TileLevel[], viewScale: number, devicePixelRatio = 1): TileLevel {
  const maximum = levels.at(-1)!;
  const requiredRatio = Math.min(1, Math.max(0, viewScale * devicePixelRatio));
  return levels.find((level) => level.width / maximum.width >= requiredRatio) ?? maximum;
}

export function visibleTiles(
  level: TileLevel,
  maxWidth: number,
  maxHeight: number,
  tileSize: number,
  view: ViewState,
  viewport: { width: number; height: number },
  margin = 1,
): [number, number][] {
  const ratioX = level.width / maxWidth;
  const ratioY = level.height / maxHeight;
  const left = Math.max(0, Math.floor(((0 - view.x) / view.scale) * ratioX / tileSize) - margin);
  const top = Math.max(0, Math.floor(((0 - view.y) / view.scale) * ratioY / tileSize) - margin);
  const right = Math.min(level.columns - 1, Math.floor(((viewport.width - view.x) / view.scale) * ratioX / tileSize) + margin);
  const bottom = Math.min(level.rows - 1, Math.floor(((viewport.height - view.y) / view.scale) * ratioY / tileSize) + margin);
  if (right < left || bottom < top) return [];
  const present = new Set(level.tiles.map(([x, y]) => `${x}:${y}`));
  const result: [number, number][] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (present.has(`${x}:${y}`)) result.push([x, y]);
    }
  }
  return result;
}

export function gridWorldMin(grid: GridManifest): Point {
  if (grid.worldMin) return { x: grid.worldMin.X, y: grid.worldMin.Y };
  if (grid.extent) {
    return {
      x: grid.extent.X1 / grid.pixelsPerMeter,
      y: grid.extent.Y1 / grid.pixelsPerMeter,
    };
  }
  return { x: 0, y: 0 };
}

export function worldToMapPixel(grid: GridManifest, world: Point): Point {
  const maximum = grid.levels.at(-1)!;
  const minimum = gridWorldMin(grid);
  return {
    x: (world.x - grid.offset.X - minimum.x) * grid.pixelsPerMeter,
    y: maximum.height - (world.y - grid.offset.Y - minimum.y) * grid.pixelsPerMeter,
  };
}

export function mapPixelToWorld(grid: GridManifest, pixel: Point): Point {
  const maximum = grid.levels.at(-1)!;
  const minimum = gridWorldMin(grid);
  return {
    x: pixel.x / grid.pixelsPerMeter + grid.offset.X + minimum.x,
    y: (maximum.height - pixel.y) / grid.pixelsPerMeter + grid.offset.Y + minimum.y,
  };
}

export function fitView(mapWidth: number, mapHeight: number, width: number, height: number): ViewState {
  const scale = Math.min(width / mapWidth, height / mapHeight) * 0.94;
  return {
    scale,
    x: (width - mapWidth * scale) / 2,
    y: (height - mapHeight * scale) / 2,
  };
}
