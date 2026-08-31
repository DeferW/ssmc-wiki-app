import type { InsertPlacement, MapArea, MapAreaGrid, MapEntry, MapOverlay, MapStaticItemCatalog, MapTileFootprint, OverlayCategory, OverlayGroup, OverlayOccurrence, OverlayPoint, OverlayPrototype, Point } from "./types";

const LOOT_COMPONENTS = new Set([
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
  CMRandomPosterAny: "Случайный постер",
  CMRandomPosterSPP: "Случайный постер СПН",
  CMRandomPosterUN: "Случайный постер ООН",
  CMSpawnMobJones: "Точка появления Джонса",
  CMSpawnMobMonkey: "Точка появления обезьяны",
  CMSpawnMobMouse: "Точка появления мыши",
  CMSpawnMobOrion: "Точка появления Ориона",
  CMSpawnMobWiggles: "Точка появления мистера Вигглса",
  CMPottedPlantRandom: "Случайное комнатное растение",
  PottedPlantRandom: "Случайное комнатное растение",
  RandomArcade: "Случайный аркадный автомат",
  RandomSoakedCigarette: "Случайная размокшая сигарета",
  RandomSpawner100: "Случайный мусор",
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
  RMCSpawnerIntelClose: "Случайные разведданные — ближняя зона",
  RMCSpawnerIntelMedium: "Случайные разведданные — средняя зона",
  RMCSpawnerIntelFar: "Случайные разведданные — дальняя зона",
  RMCSpawnerIntelScience: "Случайные разведданные — научная зона",
  RMCSpawnerCommunicationsTowerOne: "Точка башни связи",
  RMCSpawnerCommunicationsTowerTwo: "Точка башни связи",
  RMCSpawnerEvacuationPodEast: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodNorth: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodSouth: "Точка эвакуационной капсулы",
  RMCSpawnerEvacuationPodWest: "Точка эвакуационной капсулы",
  RMCSpawnerLifeboat: "Точка спасательной шлюпки",
  RMCSpawnerRandomAttachment: "Случайный оружейный модуль",
  RMCSpawnerRandomCrateLoot: "Случайный лут в ящике",
  RMCSpawnerRandomFolder: "Случайная папка с документами",
  RMCSpawnerRandomGoggles: "Случайные очки",
  RMCSpawnerRandomGogglesHighChance: "Случайные очки — высокий шанс",
  RMCSpawnerRandomGogglesMidChance: "Случайные очки — средний шанс",
  RMCSpawnerRandomGogglesLowChance: "Случайные очки — низкий шанс",
  RMCSpawnerRandomPillBottle: "Случайная банка таблеток",
  RMCSpawnerRandomPillBottleHighChance: "Случайная банка таблеток — высокий шанс",
  RMCSpawnerRandomPillBottleMidChance: "Случайная банка таблеток — средний шанс",
  RMCSpawnerRandomPillBottleLowChance: "Случайная банка таблеток — низкий шанс",
  RMCSpawnerRandomPowercell: "Случайная батарея",
  RMCSpawnerRandomSentry: "Случайная турель",
  RMCSpawnerRandomSentryHighChance: "Случайная турель — высокий шанс",
  RMCSpawnerRandomSentryMidChance: "Случайная турель — средний шанс",
  RMCSpawnerRandomSentryLowChance: "Случайная турель — низкий шанс",
  RMCSpawnerRandomSupplyKit: "Случайный комплект снабжения",
  RMCSpawnerRandomTechSupply: "Случайное техническое снабжение",
  RMCSpawnerRandomToolbox: "Случайный ящик с инструментами",
  RMCSpawnerRandomTools: "Случайные инструменты",
  RMCSpawnMobBernard: "Точка появления Бернарда",
  RMCSpawnMobButtons: "Точка появления Баттонса",
  RMCSpawnMobGarry: "Точка появления Гарри",
  RMCSpawnRatBlack: "Точка появления чёрной крысы",
  RMCSpawnRatBrown: "Точка появления коричневой крысы",
  RMCSpawnRatBrownTimmyHybrisa: "Точка появления Тимми",
  RMCSpawnRatGray: "Точка появления серой крысы",
  RMCSpawnRatWhite: "Точка появления белой крысы",
  RMCSpawnRatWhiteMilkyHybrisa: "Точка появления Милки",
  SpawnMobCarp: "Точка появления космического карпа",
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

const COMPONENT_TRANSLATIONS: Record<string, string> = {
  CommunicationsTowerSpawner: "Спавнер вышки связи",
  ConditionalSpawner: "Условный спавнер",
  EntityTableSpawner: "Табличный спавнер",
  GunSpawner: "Спавнер оружия",
  IntelSpawner: "Спавнер разведданных",
  ItemPoolSpawner: "Спавнер набора предметов",
  MapInsert: "Вариативная часть карты",
  ProportionalSpawner: "Пропорциональный спавнер",
  RandomSpawner: "Случайный спавнер",
  SpawnPoint: "Точка появления роли",
  SquadSpawner: "Спавнер отряда",
  UniqueRandomSpawner: "Уникальный случайный спавнер",
};

const CERTAIN_SPAWNER_COMPONENTS = new Set([
  "ConditionalSpawner",
  "EntityTableSpawner",
  "GunSpawner",
  "RandomSpawner",
  "UniqueRandomSpawner",
]);

const ROLE_TRANSLATIONS: Record<string, string> = {
  CombatTech: "боевого техника",
  FireteamLeader: "командира огневой группы",
  HospitalCorpsman: "санитара",
  Rifleman: "стрелка",
  SmartGunOperator: "оператора смартгана",
  SquadLeader: "командира отряда",
  WeaponsSpecialist: "оружейного специалиста",
};

const SQUAD_TRANSLATIONS: Record<string, string> = {
  Alpha: "Альфа",
  Bravo: "Браво",
  Charlie: "Чарли",
  Delta: "Дельта",
};

export type InsertVariationOption = {
  path: string;
  probability: number;
  nightmareScenario?: string;
  offset: Point;
  index: number;
};

function categoryOf(id: string, prototype: OverlayPrototype, occurrence: OverlayOccurrence): OverlayCategory {
  if (typeof occurrence[4] === "string") return "label";
  const components = Object.keys(prototype.components ?? {});
  if (prototype.kind === "insert" || components.includes("MapInsert")) return "insert";
  if (components.includes("SpawnPoint") || components.includes("SquadSpawner") || /spawn.?point/i.test(id)) return "spawn";
  if (components.some((component) => LOOT_COMPONENTS.has(component))) return "loot";
  if (prototype.kind === "spawner" && /intel|objective|loot|gun|ammo|buckshot|attachment|goggles|pill|sentry|tool|power.?cell|supply|equipment|gear|warhead/i.test(`${id} ${prototype.name}`)) return "loot";
  return "marker";
}

function groupOf(category: OverlayCategory, id: string, name: string): OverlayGroup {
  const source = `${id} ${name}`;
  if (category === "loot") {
    if (/intel|objective|folder/i.test(source)) return "loot-intel";
    if (/ammo|buckshot/i.test(source)) return "loot-ammo";
    if (/gun|rifle|pistol|shotgun|smg|sentry|attachment|warhead|bomb/i.test(source)) return "loot-weapons";
    if (/tool|power.?cell|tech/i.test(source)) return "loot-tools";
    if (/pill|medical|medkit/i.test(source)) return "loot-medical";
    if (/goggles|equipment|gear|armor/i.test(source)) return "loot-equipment";
    if (/crate|supply|aegis/i.test(source)) return "loot-supplies";
    return "loot-other";
  }
  if (category === "spawn" || /spawn.?point|latejoin|observer/i.test(source)) return "misc-spawns";
  if (/corpse|mob|rat|mouse|monkey|carp|blood|gib|oil/i.test(source)) return "misc-creatures";
  if (/evac|lifeboat|teleport|warp|dropship/i.test(source)) return "misc-transport";
  if (/blocker|barrier|fog/i.test(source)) return "misc-boundaries";
  if (/poster|plant|arcade|cigarette|bedsheet|decal|chair/i.test(source)) return "misc-decor";
  return "misc-other";
}

function probabilityValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function russianCount(value: number, one: string, few: string, many: string): string {
  const tens = value % 100;
  const units = value % 10;
  const form = tens >= 11 && tens <= 14 ? many : units === 1 ? one : units >= 2 && units <= 4 ? few : many;
  return `${value} ${form}`;
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
      const category = categoryOf(prototypeId, prototype, entry);
      points.push({
        key: `${prefix}:${prototypeId}:${index}`,
        prototypeId,
        name: prototype.name || prototypeId,
        category,
        group: groupOf(category, prototypeId, prototype.name),
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

function vector(value: unknown): Point {
  if (typeof value === "string") {
    const [x, y, ...rest] = value.split(",").map(Number);
    if (rest.length === 0 && Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number")) {
    return { x: value[0], y: value[1] };
  }
  return { x: 0, y: 0 };
}

export function insertVariations(point: OverlayPoint): InsertVariationOption[] {
  const insert = point.components?.MapInsert;
  const variations = Array.isArray(insert?.variations) ? insert.variations : [];
  return variations.flatMap((rawVariation, index) => {
    if (!rawVariation || typeof rawVariation !== "object") return [];
    const variation = rawVariation as Record<string, unknown>;
    if (typeof variation.spawn !== "string") return [];
    return [{
      path: variation.spawn,
      probability: probabilityValue(variation.probability) ?? 1,
      nightmareScenario: typeof variation.nightmareScenario === "string" ? variation.nightmareScenario : undefined,
      offset: vector(variation.offset),
      index,
    }];
  });
}

export function insertOrigin(anchor: OverlayPoint, variation: InsertVariationOption): Point {
  // Mirrors MapInsertSystem: map coordinates - 0.5, then the variation offset,
  // finally a C# integer cast (truncation toward zero). Inserts are not rotated.
  return {
    x: Math.trunc(anchor.x - 0.5 + variation.offset.x),
    y: Math.trunc(anchor.y - 0.5 + variation.offset.y),
  };
}

function pointInFootprint(footprint: MapTileFootprint, origin: Point, point: Point): boolean {
  const x = Math.floor(point.x - origin.x);
  const y = Math.floor(point.y - origin.y);
  const row = footprint.rows.find((candidate) => candidate[0] === y);
  if (!row) return false;
  for (let index = 1; index + 1 < row.length; index += 2) {
    if (x >= row[index] && x < row[index] + row[index + 1]) return true;
  }
  return false;
}

export function flattenOverlay(
  overlay: MapOverlay,
  activeInserts: Record<string, string> = {},
): OverlayPoint[] {
  const points = pointsFor(overlay.occurrences, overlay.prototypes, "map");
  const expand = (anchors: OverlayPoint[]) => {
    for (const anchor of anchors.filter((point) => point.category === "insert")) {
      const selectedPath = activeInserts[anchor.key];
      const variation = insertVariations(anchor).find((candidate) => candidate.path === selectedPath);
      if (!variation) continue;
      const insertMap = overlay.insertMaps[variation.path];
      if (!insertMap) continue;
      const origin = insertOrigin(anchor, variation);
      if (anchor.components?.MapInsert?.clearEntities === true && insertMap.footprint) {
        for (let index = points.length - 1; index >= 0; index -= 1) {
          const point = points[index];
          if (point.category !== "insert" && pointInFootprint(insertMap.footprint, origin, point)) {
            points.splice(index, 1);
          }
        }
      }
      const inserted = pointsFor(
        insertMap.occurrences,
        overlay.prototypes,
        `insert:${anchor.key}:${variation.index}`,
      ).map((local) => ({
        ...local,
        key: `${local.key}:${anchor.key}`,
        x: origin.x + local.x,
        y: origin.y + local.y,
        insertPath: variation.path,
        probability: variation.probability,
        nightmareScenario: variation.nightmareScenario,
      }));
      points.push(...inserted);
      expand(inserted);
    }
  };
  expand(points);
  return points;
}

function staticItemPoints(
  occurrences: Record<string, OverlayOccurrence[]> | undefined,
  catalog: MapStaticItemCatalog,
  prefix: string,
  origin: Point = { x: 0, y: 0 },
): OverlayPoint[] {
  if (!occurrences) return [];
  return Object.entries(occurrences).flatMap(([prototypeId, entries]) => {
    const item = catalog.items[prototypeId];
    if (!item) return [];
    return entries.map((entry, index) => ({
      key: `${prefix}:${prototypeId}:${index}`,
      prototypeId,
      name: item.name,
      category: "item" as const,
      group: "item" as const,
      x: origin.x + entry[0],
      y: origin.y + entry[1],
      rotation: entry[2] ?? 0,
      item,
    }));
  });
}

export function flattenStaticItems(
  overlay: MapOverlay,
  catalog: MapStaticItemCatalog,
  overlayPoints: OverlayPoint[],
  activeInserts: Record<string, string>,
): OverlayPoint[] {
  const points = staticItemPoints(overlay.itemOccurrences, catalog, "map-item");
  for (const placement of activeInsertPlacements(overlay, overlayPoints, activeInserts)) {
    const insert = overlay.insertMaps[placement.path];
    if (placement.clearEntities && insert?.footprint) {
      for (let index = points.length - 1; index >= 0; index -= 1) {
        if (pointInFootprint(insert.footprint, placement.origin, points[index])) points.splice(index, 1);
      }
    }
    points.push(...staticItemPoints(
      insert?.itemOccurrences,
      catalog,
      `insert-item:${placement.key}`,
      placement.origin,
    ));
  }
  return points;
}

export function effectiveInsertProbability(
  probability: number,
  nightmareScenario: string | undefined,
  map: Pick<MapEntry, "nightmareScenarios">,
): number {
  if (!nightmareScenario) return probability;
  const scenario = map.nightmareScenarios?.find((candidate) => candidate.scenarioName === nightmareScenario);
  return probability * (scenario?.scenarioProbability ?? 0);
}

export function serializeInsertSelections(
  points: OverlayPoint[],
  activeInserts: Record<string, string>,
): string[] {
  return points.flatMap((point) => {
    if (point.category !== "insert") return [];
    const selectedPath = activeInserts[point.key];
    const variation = insertVariations(point).find((candidate) => candidate.path === selectedPath);
    return variation ? [`${point.key}|${variation.index}`] : [];
  });
}

export function restoreInsertSelections(
  overlay: MapOverlay,
  tokens: string[],
): Record<string, string> {
  const requested = new Map<string, number>();
  for (const token of tokens) {
    const separator = token.lastIndexOf("|");
    const index = Number(token.slice(separator + 1));
    if (separator > 0 && Number.isInteger(index) && index >= 0) {
      requested.set(token.slice(0, separator), index);
    }
  }

  const restored: Record<string, string> = {};
  for (let pass = 0; pass <= requested.size; pass += 1) {
    let changed = false;
    for (const point of flattenOverlay(overlay, restored)) {
      if (point.category !== "insert" || restored[point.key]) continue;
      const index = requested.get(point.key);
      const variation = index === undefined
        ? undefined
        : insertVariations(point).find((candidate) => candidate.index === index);
      if (!variation || !overlay.insertMaps[variation.path]) continue;
      restored[point.key] = variation.path;
      changed = true;
    }
    if (!changed) break;
  }
  return restored;
}

export function activeInsertPlacements(
  overlay: MapOverlay,
  points: OverlayPoint[],
  activeInserts: Record<string, string>,
): InsertPlacement[] {
  return points.flatMap((anchor) => {
    if (anchor.category !== "insert") return [];
    const path = activeInserts[anchor.key];
    const variation = insertVariations(anchor).find((candidate) => candidate.path === path);
    const insertMap = variation ? overlay.insertMaps[variation.path] : undefined;
    if (!variation || !insertMap?.tiles) return [];
    const component = anchor.components?.MapInsert;
    return [{
      key: anchor.key,
      path: variation.path,
      origin: insertOrigin(anchor, variation),
      tiles: insertMap.tiles,
      clearEntities: component?.clearEntities === true,
      clearDecals: component?.clearDecals === true,
      replaceAreas: component?.replaceAreas === true,
    }];
  });
}

export function pointDisplayName(point: OverlayPoint): string {
  if (point.label) return point.label;
  const translated = POINT_NAME_TRANSLATIONS[point.prototypeId];
  if (translated) return translated;
  const corpse = /^Corpse Spawner - (.+)$/.exec(point.name);
  if (corpse) return `Генератор тела: ${CORPSE_ROLE_TRANSLATIONS[corpse[1]] ?? corpse[1]}`;
  const squadSpawn = /^CMSpawnPoint(.+?)(Alpha|Bravo|Charlie|Delta)$/.exec(point.prototypeId);
  if (squadSpawn) {
    const role = ROLE_TRANSLATIONS[squadSpawn[1]] ?? squadSpawn[1];
    return `Точка появления ${role}, отряд ${SQUAD_TRANSLATIONS[squadSpawn[2]]}`;
  }
  if (/spawnpointsurvivor/i.test(point.prototypeId)) return "Точка появления выжившего";
  const randomGun = /^RMCSpawnerRandomGun(Civ|CMB|Corp|Pistol|Rifle|Shotgun|SMG|Special)/.exec(point.prototypeId);
  if (randomGun) {
    const kind: Record<string, string> = {
      Civ: "гражданского оружия",
      CMB: "оружия КБМ",
      Corp: "корпоративного оружия",
      Pistol: "пистолета",
      Rifle: "винтовки",
      Shotgun: "дробовика",
      SMG: "пистолета-пулемёта",
      Special: "особого оружия",
    };
    return `Случайная точка ${kind[randomGun[1]]}`;
  }
  const exactNameTranslations: Record<string, string> = {
    "objective landmark close": "Разведданные — ближняя точка",
    "objective landmark medium": "Разведданные — средняя точка",
    "objective landmark far": "Разведданные — дальняя точка",
    "objective landmark science": "Разведданные — научная точка",
    "random orbital warhead": "Случайная орбитальная боеголовка",
    "bomb supply": "Боеприпасы для взрывчатки",
    "random potted plant spawner": "Случайное комнатное растение",
    "random poster spawner": "Случайный постер",
    "random arcade spawner": "Случайный аркадный автомат",
    "random sheet spawner": "Случайная простыня",
    "patron figurine spawner": "Случайная фигурка покровителя",
    "escape pod spawner": "Точка эвакуационной капсулы",
    "lifeboat spawner": "Точка спасательной шлюпки",
    "latejoin spawn point": "Точка позднего подключения",
    "observer spawn point": "Точка появления наблюдателя",
  };
  const byName = exactNameTranslations[point.name.toLocaleLowerCase("en")];
  if (byName) return byName;
  return point.name;
}

export function pointsOnSameTile(points: OverlayPoint[], target: OverlayPoint): OverlayPoint[] {
  const tileX = Math.floor(target.x);
  const tileY = Math.floor(target.y);
  return points.filter((point) => (
    Math.floor(point.x) === tileX && Math.floor(point.y) === tileY
  ));
}

function areaInGrid(grid: MapAreaGrid | null | undefined, point: Point): MapArea | undefined {
  if (!grid) return undefined;
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const row = grid.rows.find((candidate) => candidate[0] === y);
  if (!row) return undefined;
  for (let index = 1; index + 2 < row.length; index += 3) {
    const start = row[index];
    const length = row[index + 1];
    if (x < start || x >= start + length) continue;
    const area = grid.types[row[index + 2]];
    if (!area) return undefined;
    return { prototypeId: area[0], name: area[1], supportMask: area[2] };
  }
  return undefined;
}

export function areaAt(
  overlay: MapOverlay | undefined,
  point: Point | undefined,
  inserts: InsertPlacement[] = [],
): MapArea | undefined {
  if (!overlay || !point) return undefined;
  for (const insert of [...inserts].reverse()) {
    if (!insert.replaceAreas) continue;
    const area = areaInGrid(overlay.insertMaps[insert.path]?.areas, {
      x: point.x - insert.origin.x,
      y: point.y - insert.origin.y,
    });
    if (area) return area;
  }
  return areaInGrid(overlay.areas, point);
}

export function describeComponents(point: OverlayPoint): string[] {
  const result: string[] = [];
  for (const [name, component] of Object.entries(point.components ?? {})) {
    const chance = probabilityValue(component.chance)
      ?? probabilityValue(component.chanceToSpawn)
      ?? (CERTAIN_SPAWNER_COMPONENTS.has(name) ? 1 : undefined);
    const rareChance = probabilityValue(component.rareChance);
    const prototypes = Array.isArray(component.prototypes) ? component.prototypes : [];
    const groups = Array.isArray(component.groups) ? component.groups : [];
    const bits = [COMPONENT_TRANSLATIONS[name] ?? name];
    if (chance !== undefined) bits.push(`шанс ${Math.round(chance * 100)}%`);
    if (rareChance !== undefined) bits.push(`редкий вариант ${Math.round(rareChance * 100)}%`);
    if (prototypes.length) bits.push(russianCount(prototypes.length, "вариант", "варианта", "вариантов"));
    if (groups.length) bits.push(russianCount(groups.length, "группа", "группы", "групп"));
    result.push(bits.join(" · "));
  }
  return result;
}

export function pointProbabilityDescriptions(point: OverlayPoint, points: OverlayPoint[]): string[] {
  const result: string[] = [];
  const tower = point.components?.CommunicationsTowerSpawner;
  if (typeof tower?.group === "string") {
    const candidates = points.filter((candidate) => (
      candidate.components?.CommunicationsTowerSpawner?.group === tower.group
    ));
    if (candidates.length > 0) {
      result.push(`Вероятность появления вышки: ${Math.round(100 / candidates.length)}%`);
    }
  }
  return result;
}

export function spawnOptions(point: OverlayPoint): string[] {
  const options = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (Array.isArray(value)) {
      if (/prototypes?|entities|choices|spawns?/i.test(key)) {
        for (const item of value) {
          if (typeof item === "string" && !/\.ya?ml$/i.test(item)) options.add(item);
        }
      }
      for (const item of value) visit(item, key);
    } else if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) visit(child, childKey);
    } else if (typeof value === "string" && /prototype|entity|spawn/i.test(key) && !/\.ya?ml$/i.test(value)) {
      options.add(value);
    }
  };
  visit(point.components);
  return [...options].sort((a, b) => a.localeCompare(b));
}
