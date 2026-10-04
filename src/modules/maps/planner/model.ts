import type { Point } from "../types";

/**
 * The seven tactical map colours of RMC14 in game order
 * (Content.Client/_RMC14/TacticalMap/TacticalMapWrapper.xaml.cs), plus white,
 * which stays readable on dark map renders.
 */
export const PLAN_COLORS = [
  { id: 0, name: "Чёрный", value: "#000000" },
  { id: 1, name: "Красный", value: "#F40002" },
  { id: 2, name: "Оранжевый", value: "#F39504" },
  { id: 3, name: "Синий", value: "#015CF5" },
  { id: 4, name: "Фиолетовый", value: "#BF00F1" },
  { id: 5, name: "Зелёный", value: "#00BB48" },
  { id: 6, name: "Коричневый", value: "#5A3121" },
  { id: 7, name: "Белый", value: "#F2F5F3" },
] as const;

/** Game line thickness range (TacticalMapWrapper LineThicknessSlider). */
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 8;

export const STAMPS = [
  { id: 0, name: "Сбор" },
  { id: 1, name: "ФОБ" },
  { id: 2, name: "Оборона" },
  { id: 3, name: "Атака" },
  { id: 4, name: "Опасность" },
  { id: 5, name: "Улей" },
  { id: 6, name: "Медпункт" },
  { id: 7, name: "Техника" },
  { id: 8, name: "Цель" },
] as const;

export const MAX_ELEMENTS = 300;
export const MAX_STROKE_POINTS = 600;
export const MAX_LABEL_LENGTH = 48;

/**
 * Drawing is free-hand: positions are stored as integers in eighths of a tile,
 * fine enough to follow the cursor and still short in a plan code.
 */
export const UNITS_PER_TILE = 8;

/** Plan coordinates in eighths of a tile; +Y points north like game coordinates. */
export type PlanElement =
  | { kind: "stroke"; color: number; width: number; points: Point[] }
  | { kind: "arrow"; color: number; width: number; points: [Point, Point] }
  | { kind: "area"; color: number; filled: boolean; from: Point; to: Point }
  | { kind: "label"; color: number; at: Point; text: string }
  | { kind: "stamp"; color: number; stamp: number; at: Point };

export type Plan = { mapId: string; elements: PlanElement[] };

/** World position (tiles, fractional) → plan units. */
export function toUnits(world: Point): Point {
  return { x: Math.round(world.x * UNITS_PER_TILE), y: Math.round(world.y * UNITS_PER_TILE) };
}

/** Plan units → world position in tiles. */
export function toWorld(point: Point): Point {
  return { x: point.x / UNITS_PER_TILE, y: point.y / UNITS_PER_TILE };
}

export function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

export function colorValue(color: number): string {
  return PLAN_COLORS[color]?.value ?? PLAN_COLORS[1].value;
}

export function cleanLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
}

/** A brush point is kept only after the cursor moved a quarter of a tile, so slow strokes stay compact. */
export function appendStrokePoint(points: Point[], point: Point): Point[] {
  const last = points.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < UNITS_PER_TILE / 4) return points;
  if (points.length >= MAX_STROKE_POINTS) return points;
  return [...points, point];
}

/**
 * Snaps a straight line to the nearest of eight directions, like the game's
 * "Линии" mode (TacticalMapControl.SnapToStraightLine).
 */
export function snapLine(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay * 2) return { x: end.x, y: start.y };
  if (ay > ax * 2) return { x: start.x, y: end.y };
  const length = Math.min(ax, ay);
  return { x: start.x + (dx >= 0 ? length : -length), y: start.y + (dy >= 0 ? length : -length) };
}

export function translateElement(element: PlanElement, dx: number, dy: number): PlanElement {
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
  switch (element.kind) {
    case "stroke": return { ...element, points: element.points.map(move) };
    case "arrow": return { ...element, points: [move(element.points[0]), move(element.points[1])] };
    case "area": return { ...element, from: move(element.from), to: move(element.to) };
    case "label":
    case "stamp": return { ...element, at: move(element.at) };
  }
}

function segmentDistance(point: Point, from: Point, to: Point): number {
  const lengthSquared = (to.x - from.x) ** 2 + (to.y - from.y) ** 2;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) / lengthSquared));
  return Math.hypot(point.x - (from.x + t * (to.x - from.x)), point.y - (from.y + t * (to.y - from.y)));
}

/** Whether a tap at `point` touches the element; `tolerance` is in plan units. */
export function hitsElement(element: PlanElement, point: Point, tolerance = UNITS_PER_TILE * 0.75): boolean {
  switch (element.kind) {
    case "stroke":
    case "arrow": {
      const points = element.points;
      if (points.length === 1) return segmentDistance(point, points[0], points[0]) <= tolerance;
      for (let index = 1; index < points.length; index += 1) {
        if (segmentDistance(point, points[index - 1], points[index]) <= tolerance) return true;
      }
      return false;
    }
    case "area": {
      const left = Math.min(element.from.x, element.to.x);
      const right = Math.max(element.from.x, element.to.x);
      const bottom = Math.min(element.from.y, element.to.y);
      const top = Math.max(element.from.y, element.to.y);
      if (point.x < left - tolerance || point.x > right + tolerance || point.y < bottom - tolerance || point.y > top + tolerance) return false;
      if (element.filled) return true;
      // An outline is only grabbed near its border so it does not swallow taps inside it.
      return Math.min(Math.abs(point.x - left), Math.abs(point.x - right), Math.abs(point.y - bottom), Math.abs(point.y - top)) <= tolerance;
    }
    case "label":
      return Math.abs(point.x - element.at.x) <= UNITS_PER_TILE * 1.5 && Math.abs(point.y - element.at.y) <= UNITS_PER_TILE * 0.6;
    case "stamp":
      return Math.hypot(point.x - element.at.x, point.y - element.at.y) <= UNITS_PER_TILE * 0.9;
  }
}

/** Index of the topmost element under the tap, or -1. */
export function topElementAt(elements: PlanElement[], point: Point): number {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    if (hitsElement(elements[index], point)) return index;
  }
  return -1;
}
