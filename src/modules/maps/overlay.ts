import type { MapOverlay, OverlayCategory, OverlayOccurrence, OverlayPoint, OverlayPrototype } from "./types";

const LOOT_COMPONENTS = new Set([
  "RandomSpawner",
  "UniqueRandomSpawner",
  "ConditionalSpawner",
  "GunSpawner",
  "IntelSpawner",
  "ItemPoolSpawner",
  "EntityTableSpawner",
  "ProportionalSpawner",
  "RandomPatronFigurineSpawner",
]);

function categoryOf(id: string, prototype: OverlayPrototype, occurrence: OverlayOccurrence): OverlayCategory {
  if (typeof occurrence[4] === "string") return "label";
  const components = Object.keys(prototype.components ?? {});
  if (prototype.kind === "insert" || components.includes("MapInsert")) return "insert";
  if (components.includes("SquadSpawner") || /spawn.?point/i.test(id)) return "spawn";
  if (components.some((component) => LOOT_COMPONENTS.has(component))) return "loot";
  if (prototype.kind === "spawner" && /loot|toolbox|power.?cell|equipment|gear/i.test(`${id} ${prototype.name}`)) return "loot";
  return "marker";
}

function probabilityValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pointsFor(
  occurrences: Record<string, OverlayOccurrence[]>,
  prototypes: MapOverlay["prototypes"],
  prefix: string,
): OverlayPoint[] {
  const points: OverlayPoint[] = [];
  for (const [prototypeId, entries] of Object.entries(occurrences)) {
    const prototype = prototypes[prototypeId];
    if (!prototype) continue;
    entries.forEach((entry, index) => {
      points.push({
        key: `${prefix}:${prototypeId}:${index}`,
        prototypeId,
        name: prototype.name || prototypeId,
        category: categoryOf(prototypeId, prototype, entry),
        x: entry[0],
        y: entry[1],
        rotation: entry[2] ?? 0,
        label: typeof entry[4] === "string" ? entry[4] : undefined,
        components: prototype.components,
      });
    });
  }
  return points;
}

function rotate(x: number, y: number, radians: number): [number, number] {
  return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
}

export function flattenOverlay(overlay: MapOverlay): OverlayPoint[] {
  const points = pointsFor(overlay.occurrences, overlay.prototypes, "map");
  for (const anchor of points.filter((point) => point.category === "insert")) {
    const insert = overlay.prototypes[anchor.prototypeId]?.components?.MapInsert;
    const variations = Array.isArray(insert?.variations) ? insert.variations : [];
    variations.forEach((rawVariation, variationIndex) => {
      if (!rawVariation || typeof rawVariation !== "object") return;
      const variation = rawVariation as Record<string, unknown>;
      const path = variation.spawn;
      if (typeof path !== "string") return;
      const insertMap = overlay.insertMaps[path];
      if (!insertMap) return;
      for (const local of pointsFor(insertMap.occurrences, overlay.prototypes, `insert:${anchor.key}:${variationIndex}`)) {
        const [x, y] = rotate(local.x, local.y, anchor.rotation);
        points.push({
          ...local,
          key: `${local.key}:${anchor.key}`,
          x: anchor.x + x,
          y: anchor.y + y,
          insertPath: path,
          probability: probabilityValue(variation.probability),
        });
      }
    });
  }
  return points;
}

export function describeComponents(point: OverlayPoint): string[] {
  const result: string[] = [];
  for (const [name, component] of Object.entries(point.components ?? {})) {
    const chance = probabilityValue(component.chance);
    const prototypes = Array.isArray(component.prototypes) ? component.prototypes : [];
    const groups = Array.isArray(component.groups) ? component.groups : [];
    const bits = [name];
    if (chance !== undefined) bits.push(`шанс ${Math.round(chance * 100)}%`);
    if (prototypes.length) bits.push(`${prototypes.length} вариантов`);
    if (groups.length) bits.push(`${groups.length} групп`);
    result.push(bits.join(" · "));
  }
  return result;
}

export function spawnOptions(point: OverlayPoint): string[] {
  const options = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (Array.isArray(value)) {
      if (/prototypes?|entities|choices|spawns?/i.test(key)) {
        for (const item of value) if (typeof item === "string") options.add(item);
      }
      for (const item of value) visit(item, key);
    } else if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) visit(child, childKey);
    } else if (typeof value === "string" && /prototype|entity|spawn/i.test(key)) {
      options.add(value);
    }
  };
  visit(point.components);
  return [...options].sort((a, b) => a.localeCompare(b));
}
