export type Point = { x: number; y: number };

export type MapEntry = {
  id: string;
  name: string;
  kind: "ship" | "planet";
  mapPath: string;
  origin: "stories" | "rmc14";
  overlay: string;
  tiles: string;
  nightmareScenarios?: {
    scenarioName: string;
    scenarioProbability: number;
  }[];
};

export type MapCatalog = {
  schemaVersion: number;
  gameCommit: string;
  items?: string;
  maps: MapEntry[];
  counts: { maps: number; ships: number; planets: number; assetBytes: number };
};

export type TileLevel = {
  z: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  lossless: boolean;
  tiles: [number, number][];
};

export type GridManifest = {
  id: string;
  offset: { X: number; Y: number };
  extent?: { X1: number; Y1: number; X2: number; Y2: number } | null;
  worldMin?: { X: number; Y: number };
  pixelsPerMeter: number;
  path: string;
  levels: TileLevel[];
};

export type TileManifest = {
  schemaVersion: number;
  tileSize: number;
  format: "webp";
  quality: number;
  maxZoomLossless: boolean;
  renderScale: number;
  grids: GridManifest[];
};

export type OverlayPrototype = {
  name: string;
  kind: "spawner" | "marker" | "insert";
  components?: Record<string, Record<string, unknown>>;
};

export type OverlayOccurrence = [x: number, y: number, rotation?: number, parent?: string | number, label?: string];

export type MapOverlay = {
  schemaVersion: number;
  mapPath: string;
  prototypes: Record<string, OverlayPrototype>;
  occurrences: Record<string, OverlayOccurrence[]>;
  itemOccurrences?: Record<string, OverlayOccurrence[]>;
  objectGroups?: MapObjectGroup[];
  objectPrototypes?: Record<string, MapObjectPrototype>;
  objectOccurrences?: Record<string, OverlayOccurrence[]>;
  insertMaps: Record<string, {
    occurrences: Record<string, OverlayOccurrence[]>;
    itemOccurrences?: Record<string, OverlayOccurrence[]>;
    objectOccurrences?: Record<string, OverlayOccurrence[]>;
    tiles?: string;
    areas?: MapAreaGrid | null;
    footprint?: MapTileFootprint | null;
  }>;
  areas?: MapAreaGrid | null;
};

export type MapObjectGroup = { id: string; name: string; detail?: string };
export type MapObjectPrototype = { name: string; group: string };

export type MapTileFootprint = {
  rows: number[][];
};

export type MapAreaGrid = {
  types: [prototypeId: string, name: string, supportMask: number][];
  rows: number[][];
};

export type MapArea = {
  prototypeId: string;
  name: string;
  supportMask: number;
};

export type OverlayCategory = "loot" | "insert" | "label" | "spawn" | "marker" | "item" | "object";

export type OverlayGroup =
  | "loot-intel"
  | "loot-weapons"
  | "loot-ammo"
  | "loot-attachments"
  | "loot-tools"
  | "loot-medical"
  | "loot-equipment"
  | "loot-defense"
  | "loot-supplies"
  | "loot-other"
  | "misc-spawns"
  | "misc-creatures"
  | "misc-fauna"
  | "misc-remains"
  | "misc-corpses"
  | "misc-traces"
  | "misc-communications"
  | "misc-transport"
  | "misc-evacuation"
  | "misc-teleports"
  | "misc-boundaries"
  | "misc-decor"
  | "misc-other"
  | "misc-technical"
  | "misc-unclassified"
  | "item"
  | "object";

export type MapStaticItem = {
  id: string;
  name: string;
  baseName?: string;
  description?: unknown;
  category: string;
  image?: string;
  types?: string[];
  tags?: string[];
  componentTypes?: string[];
  classification?: { category?: string; categoryId?: string; reason?: string };
};

export type MapStaticItemCatalog = {
  schemaVersion: number;
  gameCommit: string;
  source: string;
  locale?: string;
  items: Record<string, MapStaticItem>;
  publicCatalog: { itemIds: string[]; categories: Record<string, string[]> };
  counts: { items: number };
};

export type OverlayPoint = {
  key: string;
  prototypeId: string;
  name: string;
  category: OverlayCategory;
  group: OverlayGroup;
  x: number;
  y: number;
  rotation: number;
  label?: string;
  components?: OverlayPrototype["components"];
  insertPath?: string;
  probability?: number;
  nightmareScenario?: string;
  item?: MapStaticItem;
  object?: MapObjectPrototype;
  highlighted?: boolean;
};

export type InsertPlacement = {
  key: string;
  path: string;
  origin: Point;
  tiles: string;
  clearEntities: boolean;
  clearDecals: boolean;
  replaceAreas: boolean;
};

export type ActiveInsertRender = InsertPlacement & {
  manifest: TileManifest;
  manifestUrl: string;
};

export type LayerSettings = Record<OverlayCategory, boolean> & {
  coordinateGrid: boolean;
  areaSupport: boolean;
  markerScale: number;
  groups: Record<OverlayGroup, boolean>;
};

export type ViewState = { x: number; y: number; scale: number };
export type CanvasStats = { loadedTiles: number; loadedBytes: number; pendingTiles: number; zoom: number };
