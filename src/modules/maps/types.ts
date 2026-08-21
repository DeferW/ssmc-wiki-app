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
  insertMaps: Record<string, { occurrences: Record<string, OverlayOccurrence[]> }>;
};

export type OverlayCategory = "loot" | "insert" | "label" | "spawn" | "marker";

export type OverlayPoint = {
  key: string;
  prototypeId: string;
  name: string;
  category: OverlayCategory;
  x: number;
  y: number;
  rotation: number;
  label?: string;
  components?: OverlayPrototype["components"];
  insertPath?: string;
  probability?: number;
};

export type LayerSettings = Record<OverlayCategory, boolean> & {
  coordinateGrid: boolean;
  markerScale: number;
};

export type ViewState = { x: number; y: number; scale: number };
export type CanvasStats = { loadedTiles: number; loadedBytes: number; pendingTiles: number; zoom: number };
