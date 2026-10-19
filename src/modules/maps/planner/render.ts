import type { Point } from "../types";
import { colorValue, toWorld, type PlanElement } from "./model";

/** Maps a world point (tile coordinates) to canvas pixels. */
export type ToScreen = (world: Point) => Point;

const FONT = "700 12px IBM Plex Mono, monospace";


/** Light halo for dark colours, dark halo otherwise, so every colour reads on any render. */
function halo(color: number): string {
  return color === 0 || color === 6 ? "rgba(242, 245, 243, .55)" : "rgba(2, 5, 3, .7)";
}

function strokeWidth(width: number): number {
  return 1 + width * 0.75;
}

function polyline(context: CanvasRenderingContext2D, points: Point[]) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
}

function arrowHead(context: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - size * Math.cos(angle - 0.45), to.y - size * Math.sin(angle - 0.45));
  context.lineTo(to.x - size * Math.cos(angle + 0.45), to.y - size * Math.sin(angle + 0.45));
  context.closePath();
}

function tileRect(element: Extract<PlanElement, { kind: "area" }>, toScreen: ToScreen) {
  const topLeft = toScreen(toWorld({ x: Math.min(element.from.x, element.to.x), y: Math.max(element.from.y, element.to.y) }));
  const bottomRight = toScreen(toWorld({ x: Math.max(element.from.x, element.to.x), y: Math.min(element.from.y, element.to.y) }));
  return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
}

type StampDrawer = (context: CanvasRenderingContext2D, r: number) => void;

// Glyphs are drawn around (0, 0) inside a circle of radius r, in the stamp colour.
const STAMP_GLYPHS: StampDrawer[] = [
  (c, r) => { // Сбор: flag
    c.beginPath(); c.moveTo(-r * .35, r * .55); c.lineTo(-r * .35, -r * .55); c.stroke();
    c.beginPath(); c.moveTo(-r * .35, -r * .55); c.lineTo(r * .5, -r * .3); c.lineTo(-r * .35, -r * .02); c.closePath(); c.fill();
  },
  (c, r) => { // ФОБ: fortified square
    c.strokeRect(-r * .5, -r * .5, r, r);
    c.beginPath(); c.moveTo(-r * .5, 0); c.lineTo(r * .5, 0); c.moveTo(0, -r * .5); c.lineTo(0, r * .5); c.stroke();
  },
  (c, r) => { // Оборона: shield
    c.beginPath(); c.moveTo(0, -r * .6); c.lineTo(r * .5, -r * .38); c.lineTo(r * .42, r * .2); c.lineTo(0, r * .62);
    c.lineTo(-r * .42, r * .2); c.lineTo(-r * .5, -r * .38); c.closePath(); c.stroke();
  },
  (c, r) => { // Атака: double chevron
    for (const offset of [-.18, .22]) {
      c.beginPath(); c.moveTo(-r * .45, r * (offset + .25)); c.lineTo(0, r * (offset - .2)); c.lineTo(r * .45, r * (offset + .25)); c.stroke();
    }
  },
  (c, r) => { // Опасность: warning triangle
    c.beginPath(); c.moveTo(0, -r * .58); c.lineTo(r * .55, r * .45); c.lineTo(-r * .55, r * .45); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0, -r * .2); c.lineTo(0, r * .12); c.stroke();
    c.beginPath(); c.arc(0, r * .28, r * .05, 0, Math.PI * 2); c.fill();
  },
  (c, r) => { // Улей: hexagon
    c.beginPath();
    for (let side = 0; side < 6; side += 1) {
      const angle = Math.PI / 6 + side * Math.PI / 3;
      const x = Math.cos(angle) * r * .55;
      const y = Math.sin(angle) * r * .55;
      if (side) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath(); c.stroke();
    c.beginPath(); c.arc(0, 0, r * .16, 0, Math.PI * 2); c.fill();
  },
  (c, r) => { // Медпункт: cross
    const a = r * .16;
    const b = r * .5;
    c.fillRect(-a, -b, a * 2, b * 2);
    c.fillRect(-b, -a, b * 2, a * 2);
  },
  (c, r) => { // Техника: vehicle
    c.strokeRect(-r * .55, -r * .25, r * 1.1, r * .45);
    c.strokeRect(-r * .2, -r * .5, r * .45, r * .25);
    for (const x of [-.32, .32]) { c.beginPath(); c.arc(r * x, r * .32, r * .13, 0, Math.PI * 2); c.fill(); }
  },
  (c, r) => { // Цель: crosshair
    c.beginPath(); c.arc(0, 0, r * .42, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(0, -r * .65); c.lineTo(0, -r * .2); c.moveTo(0, r * .2); c.lineTo(0, r * .65);
    c.moveTo(-r * .65, 0); c.lineTo(-r * .2, 0); c.moveTo(r * .2, 0); c.lineTo(r * .65, 0);
    c.stroke();
  },
];

export function drawStamp(context: CanvasRenderingContext2D, stamp: number, color: string, x: number, y: number, radius = 12) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "rgba(3, 6, 4, .88)";
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill(); context.stroke();
  context.fillStyle = color;
  context.lineWidth = 1.8;
  context.lineJoin = "round";
  context.lineCap = "round";
  (STAMP_GLYPHS[stamp] ?? STAMP_GLYPHS[0])(context, radius);
  context.restore();
}

function drawElement(context: CanvasRenderingContext2D, element: PlanElement, toScreen: ToScreen) {
  const color = colorValue(element.color);
  switch (element.kind) {
    case "stroke":
    case "arrow": {
      const points = element.points.map((point) => toScreen(toWorld(point)));
      const width = strokeWidth(element.width);
      const head = 8 + width * 2;
      for (const [style, extra] of [[halo(element.color), 3], [color, 0]] as const) {
        context.strokeStyle = style;
        context.fillStyle = style;
        context.lineWidth = width + extra;
        if (points.length === 1) {
          context.beginPath(); context.arc(points[0].x, points[0].y, (width + extra) / 2, 0, Math.PI * 2); context.fill();
          continue;
        }
        polyline(context, points);
        context.stroke();
        if (element.kind === "arrow") {
          arrowHead(context, points[0], points[1], head + extra);
          context.fill();
        }
      }
      break;
    }
    case "area": {
      const rect = tileRect(element, toScreen);
      if (element.filled) {
        context.fillStyle = color;
        context.globalAlpha = 0.22;
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.globalAlpha = 1;
      }
      context.strokeStyle = halo(element.color);
      context.lineWidth = 4;
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash(element.filled ? [] : [8, 5]);
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.setLineDash([]);
      break;
    }
    case "label": {
      const point = toScreen(toWorld(element.at));
      context.font = FONT;
      const width = context.measureText(element.text).width + 12;
      context.fillStyle = "rgba(3, 6, 4, .9)";
      context.fillRect(point.x - width / 2, point.y - 10, width, 20);
      context.strokeStyle = color === "#000000" ? "#8a958d" : color;
      context.lineWidth = 1;
      context.strokeRect(point.x - width / 2 + .5, point.y - 9.5, width - 1, 19);
      context.fillStyle = color === "#000000" ? "#e8ece9" : color;
      context.textBaseline = "middle";
      context.textAlign = "center";
      context.fillText(element.text, point.x, point.y + .5);
      context.textAlign = "start";
      break;
    }
    case "stamp": {
      const point = toScreen(toWorld(element.at));
      drawStamp(context, element.stamp, color === "#000000" ? "#e8ece9" : color, point.x, point.y);
      break;
    }
  }
}

/** Screen-space box around an element, used to show the selection. */
export function elementBounds(element: PlanElement, toScreen: ToScreen): { x: number; y: number; width: number; height: number } {
  if (element.kind === "area") return tileRect(element, toScreen);
  const points = element.kind === "label" || element.kind === "stamp" ? [element.at] : element.points;
  const screen = points.map((point) => toScreen(toWorld(point)));
  const xs = screen.map((point) => point.x);
  const ys = screen.map((point) => point.y);
  const pad = element.kind === "label" ? 30 : 14;
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - 14, width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + 28 };
}

export function drawPlan(
  context: CanvasRenderingContext2D,
  elements: PlanElement[],
  toScreen: ToScreen,
  options: { selected?: number; hidden?: Set<number>; preview?: PlanElement } = {},
) {
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  elements.forEach((element, index) => {
    if (!options.hidden?.has(index)) drawElement(context, element, toScreen);
  });
  if (options.preview) {
    context.globalAlpha = 0.75;
    drawElement(context, options.preview, toScreen);
    context.globalAlpha = 1;
  }
  const selected = options.selected !== undefined ? elements[options.selected] : undefined;
  if (selected && !options.hidden?.has(options.selected!)) {
    const box = elementBounds(selected, toScreen);
    context.strokeStyle = "#72d895";
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    context.strokeRect(box.x - 3, box.y - 3, box.width + 6, box.height + 6);
    context.setLineDash([]);
  }
  context.restore();
}
