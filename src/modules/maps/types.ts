export type Point = { x: number; y: number };

export type MapEntry = {
  id: string;
  name: string;
  kind: "ship" | "planet";
  mapPath: string;
  origin: "stories" | "rmc14";
  overlay: string;
  tiles: string;
};

export type MapCatalog = {
  schemaVersion: number;
  gameCommit: string;
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
  insertMaps: Record<string, {
    occurrences: Record<string, OverlayOccurrence[]>;
    tiles?: string;
    areas?: MapAreaGrid | null;
    footprint?: MapTileFootprint | null;
  }>;
  areas?: MapAreaGrid | null;
};

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

export type OverlayCategory = "loot" | "insert" | "label" | "spawn" | "marker";

export type OverlayGroup =
  | "loot-intel"
  | "loot-weapons"
  | "loot-ammo"
  | "loot-tools"
  | "loot-medical"
  | "loot-equipment"
  | "loot-supplies"
  | "loot-other"
  | "misc-spawns"
  | "misc-creatures"
  | "misc-transport"
  | "misc-boundaries"
  | "misc-decor"
  | "misc-other";

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
