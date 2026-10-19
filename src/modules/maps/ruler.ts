import type { Point } from "./types";

export type RulerState = { start?: Point; end?: Point };

export type RulerMeasure = {
  /** Signed tile offsets from start to end; +Y points north as in game coordinates. */
  dx: number;
  dy: number;
  /** Straight line between tile centres, in tiles (1 tile = 1 m). */
  distance: number;
};

export function tileAt(world: Point): Point {
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}

export function tileCentre(tile: Point): Point {
  return { x: tile.x + 0.5, y: tile.y + 0.5 };
}

/** Next ruler state after a tap: start, then end, then a fresh start. */
export function addRulerPoint(state: RulerState, tile: Point): RulerState {
  if (!state.start || state.end) return { start: tile };
  return { start: state.start, end: tile };
}

export function measureTiles(start: Point, end: Point): RulerMeasure {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return { dx, dy, distance: Math.hypot(dx, dy) };
}

function tilesWord(value: number): string {
  if (!Number.isInteger(value)) return "тайла";
  const tens = value % 100;
  const units = value % 10;
  if (tens >= 11 && tens <= 14) return "тайлов";
  if (units === 1) return "тайл";
  if (units >= 2 && units <= 4) return "тайла";
  return "тайлов";
}

/** "12 тайлов", "12,4 тайла": one decimal only when the distance is fractional. */
export function formatDistance(distance: number): string {
  const rounded = Math.round(distance * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  return `${text} ${tilesWord(rounded)}`;
}
