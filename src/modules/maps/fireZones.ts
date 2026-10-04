import { fetchRemoteJson } from "../../data/remoteJson";
import { dataRoot } from "../../data/paths";
import type { Point } from "./types";

// Public contract of ssmc-wiki-data/data/fire-zones/catalog.json.
export type FireZonePart =
  | { shape: "circle"; radius: number }
  | { shape: "diamond"; radius: number }
  | { shape: "scatter"; radius: number; spread: number; count: number };

export type FireZoneCatalog = {
  schemaVersion: 1;
  gameCommit: string;
  mortars: { id: string; name: string; minRange: number; maxRange: number }[];
  orbitalWarheads: { id: string; name: string; explosionId: string; parts: FireZonePart[] }[];
  roofs: { id: string; name: string; radius: number; blocks: string[] }[];
};

export const FIRE_ZONES_URL = new URL("catalog.json", dataRoot("fire-zones", import.meta.env.VITE_FIRE_ZONES_DATA_ROOT)).toString();

let catalogPromise: Promise<FireZoneCatalog> | undefined;

export function requireFireZoneCatalog(value: unknown): FireZoneCatalog {
  const catalog = value as FireZoneCatalog | undefined;
  if (
    !catalog || typeof catalog !== "object" || catalog.schemaVersion !== 1
    || !Array.isArray(catalog.mortars) || !Array.isArray(catalog.orbitalWarheads) || !Array.isArray(catalog.roofs)
  ) {
    throw new Error("Каталог зон огня имеет неподдерживаемый формат.");
  }
  return catalog;
}

export function loadFireZoneCatalog(): Promise<FireZoneCatalog> {
  catalogPromise ??= fetchRemoteJson(FIRE_ZONES_URL, { cache: "no-cache" }).then(requireFireZoneCatalog).catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

/**
 * Tiles around the zone centre, measured between tile centres: a circle keeps
 * tiles with distance ≤ radius (< radius when `open`), a diamond keeps
 * |dx| + |dy| ≤ radius, and `minRadius` cuts out the tiles closer than it.
 */
export type ZoneShape = {
  shape: "circle" | "diamond";
  radius: number;
  minRadius?: number;
  open?: boolean;
  fill: string;
  stroke: string;
  dashed?: boolean;
};

/** [x, y, length] tile runs and outline segments [x1, y1, x2, y2] in tile coordinates. */
export type TileRegion = { runs: [number, number, number][]; edges: [number, number, number, number][] };

function inShape(shape: ZoneShape, dx: number, dy: number): boolean {
  if (shape.shape === "diamond") return Math.abs(dx) + Math.abs(dy) <= shape.radius;
  const distance = Math.hypot(dx, dy);
  if (shape.minRadius !== undefined && distance < shape.minRadius) return false;
  return shape.open ? distance < shape.radius : distance <= shape.radius;
}

/** Tiles of one shape centred on `centre`, with the outline merged into straight segments. */
export function tileRegion(shape: ZoneShape, centre: Point): TileRegion {
  const reach = Math.floor(shape.radius);
  const inside = (dx: number, dy: number) => Math.abs(dx) <= reach && Math.abs(dy) <= reach && inShape(shape, dx, dy);
  const runs: TileRegion["runs"] = [];
  // Boundary pieces grouped by line: horizontal ones by y, vertical ones by x.
  const horizontal = new Map<number, number[]>();
  const vertical = new Map<number, number[]>();
  const add = (lines: Map<number, number[]>, line: number, start: number) => {
    const list = lines.get(line);
    if (list) list.push(start); else lines.set(line, [start]);
  };
  for (let dy = -reach; dy <= reach; dy += 1) {
    let start: number | undefined;
    for (let dx = -reach; dx <= reach + 1; dx += 1) {
      const filled = dx <= reach && inside(dx, dy);
      if (filled) {
        start ??= dx;
        if (!inside(dx, dy - 1)) add(horizontal, centre.y + dy, centre.x + dx);
        if (!inside(dx, dy + 1)) add(horizontal, centre.y + dy + 1, centre.x + dx);
        if (!inside(dx - 1, dy)) add(vertical, centre.x + dx, centre.y + dy);
        if (!inside(dx + 1, dy)) add(vertical, centre.x + dx + 1, centre.y + dy);
      } else if (start !== undefined) {
        runs.push([centre.x + start, centre.y + dy, dx - start]);
        start = undefined;
      }
    }
  }
  const edges: TileRegion["edges"] = [];
  const merge = (lines: Map<number, number[]>, segment: (line: number, from: number, to: number) => TileRegion["edges"][number]) => {
    for (const [line, starts] of lines) {
      starts.sort((first, second) => first - second);
      let from = starts[0];
      let to = from + 1;
      for (const start of starts.slice(1)) {
        if (start === to) { to += 1; continue; }
        edges.push(segment(line, from, to));
        from = start;
        to = start + 1;
      }
      edges.push(segment(line, from, to));
    }
  };
  merge(horizontal, (y, from, to) => [from, y, to, y]);
  merge(vertical, (x, from, to) => [x, from, x, to]);
  return { runs, edges };
}

export type ZoneTemplate = {
  id: string;
  kind: "mortar" | "orbital" | "roof";
  label: string;
  title: string;
  details: string[];
  color: string;
  /** Drawn in order, so larger shapes come first. */
  shapes: ZoneShape[];
};

const SUPPORT_LABELS: Record<string, string> = {
  OB: "орбитальный удар",
  CAS: "авиаудар (CAS)",
  mortarFire: "огонь миномёта",
  mortarPlacement: "установку миномёта",
  lasing: "лазер",
  medevac: "медэвак",
  fulton: "«Фултон»",
  paradropping: "десант",
  supplyDrop: "сброс снабжения",
};

const WARHEAD_COLORS: Record<string, string> = {
  circle: "#ff8a3d",
  diamond: "#4aa8ff",
  scatter: "#ffb43d",
};

function tiles(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",")) + " т";
}

function alpha(hex: string, value: number): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${value})`;
}

function warheadLabel(name: string): string {
  const kind = /\(([^)]+)\)/.exec(name)?.[1];
  return kind ? `OB · ${kind.toLocaleLowerCase("ru")}` : name;
}

function partShapes(part: FireZonePart): ZoneShape[] {
  const color = WARHEAD_COLORS[part.shape];
  if (part.shape === "scatter") {
    return [
      { shape: "circle", radius: part.spread + part.radius, fill: alpha(color, .16), stroke: color, dashed: true },
      { shape: "circle", radius: part.spread, fill: alpha(color, .24), stroke: color },
    ];
  }
  return [{ shape: part.shape, radius: part.radius, fill: alpha(color, part.shape === "diamond" ? .2 : .26), stroke: color }];
}

function partDetail(part: FireZonePart): string {
  if (part.shape === "diamond") return `Огонь ромбом на ${tiles(part.radius)}`;
  if (part.shape === "scatter") return `${part.count} взрывов по ≈ ${tiles(part.radius)} в круге ${tiles(part.spread)}`;
  return `Взрыв ≈ ${tiles(part.radius)}`;
}

/** Zone templates in palette order: mortars, warheads, roofs. */
export function zoneTemplates(catalog: FireZoneCatalog): ZoneTemplate[] {
  const mortars = catalog.mortars.map<ZoneTemplate>((mortar) => ({
    id: mortar.id,
    kind: "mortar",
    label: ["Миномёт", /M\d+/.exec(mortar.name)?.[0]].filter(Boolean).join(" "),
    title: mortar.name,
    details: [`Стреляет на ${tiles(mortar.minRange)} – ${tiles(mortar.maxRange)}`, `Ближе ${tiles(mortar.minRange)} — слишком близко`],
    color: "#6fc3ff",
    shapes: [
      // MortarSystem rejects targets with distance < minRange, so the ring starts at it.
      { shape: "circle", radius: mortar.maxRange, minRadius: mortar.minRange, fill: alpha("#6fc3ff", .16), stroke: "#6fc3ff" },
      { shape: "circle", radius: mortar.minRange, open: true, fill: alpha("#ff6b6b", .24), stroke: "#ff6b6b", dashed: true },
    ],
  }));
  const warheads = catalog.orbitalWarheads.map<ZoneTemplate>((warhead) => {
    const parts = [...warhead.parts].sort((first, second) => outerRadius(second) - outerRadius(first));
    const main = parts[0];
    return {
      id: warhead.id,
      kind: "orbital",
      label: warheadLabel(warhead.name),
      title: warhead.name,
      details: parts.map(partDetail),
      color: WARHEAD_COLORS[main.shape],
      shapes: parts.flatMap(partShapes),
    };
  });
  const roofs = catalog.roofs.map<ZoneTemplate>((roof) => {
    const allowsOrbital = !roof.blocks.includes("OB");
    return {
      id: roof.id,
      kind: "roof",
      label: roof.name,
      title: roof.name,
      details: [
        `Крыша радиусом ${tiles(roof.radius)}`,
        `Блокирует ${roof.blocks.map((block) => SUPPORT_LABELS[block] ?? block).join(", ")}`,
        ...(allowsOrbital ? ["Орбитальный удар проходит"] : []),
      ],
      color: allowsOrbital ? "#d79bff" : "#a46bff",
      shapes: [{ shape: "circle", radius: roof.radius, fill: alpha(allowsOrbital ? "#d79bff" : "#a46bff", .24), stroke: allowsOrbital ? "#d79bff" : "#a46bff" }],
    };
  });
  return [...mortars, ...warheads, ...roofs];
}

function outerRadius(part: FireZonePart): number {
  return part.shape === "scatter" ? part.spread + part.radius : part.radius;
}

export type PlacedZone = { templateId: string; tile: Point };

/** Zones per map; keeps the canvas readable and the shared link short. */
export const MAX_ZONES = 7;
const ZONE_TOKEN = /^([A-Za-z0-9]+):(-?\d+):(-?\d+)$/;

/** URL tokens `TemplateId:x:y`; unknown templates and malformed tokens are dropped. */
export function parseZones(tokens: string[], templateIds: Set<string>): PlacedZone[] {
  const zones: PlacedZone[] = [];
  for (const token of tokens) {
    const match = ZONE_TOKEN.exec(token);
    if (!match || !templateIds.has(match[1])) continue;
    zones.push({ templateId: match[1], tile: { x: Number(match[2]), y: Number(match[3]) } });
    if (zones.length >= MAX_ZONES) break;
  }
  return zones;
}

export function serializeZones(zones: PlacedZone[]): string[] {
  return zones.map((zone) => `${zone.templateId}:${zone.tile.x}:${zone.tile.y}`);
}

/**
 * Tapping the same template on the same tile removes it; otherwise the zone is
 * added on top. A full list is returned unchanged instead of dropping old zones.
 */
export function toggleZone(zones: PlacedZone[], templateId: string, tile: Point): PlacedZone[] {
  const index = zones.findIndex((zone) => zone.templateId === templateId && zone.tile.x === tile.x && zone.tile.y === tile.y);
  if (index >= 0) return zones.filter((_, current) => current !== index);
  if (zones.length >= MAX_ZONES) return zones;
  return [...zones, { templateId, tile }];
}

export type LabelBox = { x: number; y: number; width: number; height: number };

/**
 * Upward shifts that keep every label clear of the ones before it. Earlier zones
 * keep their place; a later label climbs in steps until it finds free space.
 */
export function liftLabels(boxes: LabelBox[], gap = 3, maxSteps = 8): number[] {
  const placed: LabelBox[] = [];
  return boxes.map((box) => {
    const step = box.height + gap;
    let lift = 0;
    for (let attempt = 0; attempt <= maxSteps; attempt += 1) {
      lift = attempt * step;
      const top = box.y - lift;
      const clear = placed.every((other) => (
        box.x + box.width <= other.x || other.x + other.width <= box.x
        || top + box.height + gap <= other.y || other.y + other.height + gap <= top
      ));
      if (clear) break;
    }
    placed.push({ ...box, y: box.y - lift });
    return lift;
  });
}
