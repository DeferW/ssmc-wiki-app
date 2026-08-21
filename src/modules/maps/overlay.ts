import type { MapArea, MapOverlay, OverlayCategory, OverlayOccurrence, OverlayPoint, OverlayPrototype, Point } from "./types";

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

const POINT_NAME_TRANSLATIONS: Record<string, string> = {
  DecalSpawnerBloodSplatters: "Генератор пятен крови",
  RMCAegisCorpseSpawner: "Генератор тела учёного AEGIS",
  RMCAegisSpawner: "Генератор ящика AEGIS",
  RMCBlockerVehicle: "Ограничитель транспорта",
  RMCCrashLandBarrier: "Граница аварийной посадки",
  RMCDecalSpawnerBloodSplatters: "Генератор пятен крови",
  RMCDecalSpawnerGibsDrone: "Генератор останков дрона",
  RMCDecalSpawnerGibsLesserDrone: "Генератор останков малого дрона",
  RMCDecalSpawnerOilSplatters: "Генератор масляных пятен",
  RMCDecalSpawnerXenoSplatters: "Генератор крови ксеноморфа",
  RMCRequisitionsChairMarkerWest: "Маркер кресла отдела снабжения",
  RMCSpawnerCommunicationsTowerOne: "Точка башни связи",
  RMCSpawnerCommunicationsTowerTwo: "Точка башни связи",
  RMCSpawnerEvacuationPodEast: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodNorth: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodSouth: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodWest: "Точка эвакуационной капсулы",
  RMCSpawnerLifeboat: "Точка спасательной шлюпки",
  RMCTriggerTeleporter: "Телепорт",
  RMCTriggerTeleporterViewer: "Обзор телепорта",
  STHunterTeleportDestination: "Точка телепорта Охотника",
  STHunterTeleportDestinationAlmayer: "Точка телепорта Охотника",
  WarpPoint: "Точка перехода",
};

const CORPSE_ROLE_TRANSLATIONS: Record<string, string> = {
  "Unknown": "неизвестный",
  "Chef": "повар",
  "CLF Soldier": "солдат ФОК",
  "Colonist": "колонист",
  "Colonist Kutjevo": "колонист Кутьево",
  "TSEPA Constable": "констебль TSEPA",
  "CMB Deputy": "помощник маршала КБМ",
  "Doctor": "врач",
  "Engineer": "инженер",
  "UNMC Reconnaissance Spotter": "корректировщик разведки ККМП ООН",
  "Corporate Liaison": "корпоративный связной",
  "Shaft Miner": "шахтёр",
  "Prisoner": "заключённый",
  "Prison Guard": "тюремный охранник",
  "Russian": "русский",
  "Scientist": "учёный",
  "Security Officer": "офицер охраны",
  "SPP Soldier": "солдат СПН",
  "CMB Riot Control Officer": "офицер подавления беспорядков КБМ",
  "We-Ya Goon": "оперативник Вестон-Ямада",
  "We-Ya Goon Hybrisa": "оперативник Вестон-Ямада на Гибрисе",
  "We-Ya Goon Kutjevo": "оперативник Вестон-Ямада на Кутьево",
  "We-Ya Goon Lead": "ведущий оперативник Вестон-Ямада",
  "Corporate Supervisor": "корпоративный руководитель",
  "We-Ya PMC Standard": "боец ЧВК Вестон-Ямада",
};

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

export function pointDisplayName(point: OverlayPoint): string {
  if (point.label) return point.label;
  const translated = POINT_NAME_TRANSLATIONS[point.prototypeId];
  if (translated) return translated;
  const corpse = /^Corpse Spawner - (.+)$/.exec(point.name);
  if (corpse) return `Генератор тела: ${CORPSE_ROLE_TRANSLATIONS[corpse[1]] ?? corpse[1]}`;
  return point.name;
}

export function areaAt(overlay: MapOverlay | undefined, point: Point | undefined): MapArea | undefined {
  if (!overlay?.areas || !point) return undefined;
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const row = overlay.areas.rows.find((candidate) => candidate[0] === y);
  if (!row) return undefined;
  for (let index = 1; index + 2 < row.length; index += 3) {
    const start = row[index];
    const length = row[index + 1];
    if (x < start || x >= start + length) continue;
    const area = overlay.areas.types[row[index + 2]];
    if (!area) return undefined;
    return { prototypeId: area[0], name: area[1], supportMask: area[2] };
  }
  return undefined;
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
