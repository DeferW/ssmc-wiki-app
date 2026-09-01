import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { chooseLevel, fitView, gridWorldMin, mapPixelToWorld, visibleTiles, worldToMapPixel } from "./tileMath";
import { pointsOnSameTile } from "./overlay";
import { markerStyle, type MarkerIcon } from "./markerConfig";
import type { ActiveInsertRender, CanvasStats, GridManifest, LayerSettings, OverlayPoint, Point, TileLevel, TileManifest, ViewState } from "./types";

type Props = {
  manifest: TileManifest;
  manifestUrl: string;
  points: OverlayPoint[];
  insertRenders: ActiveInsertRender[];
  layers: LayerSettings;
  initialFocus?: { world: Point; scale: number; key: string };
  selectedKey?: string;
  anchorKey?: string;
  onSelect: (points: OverlayPoint[]) => void;
  onSelectedAnchor: (anchor?: SelectionAnchor) => void;
  onCoordinate: (point?: Point, anchor?: SelectionAnchor) => void;
  onShareTile: (point: Point, zoom: number) => void;
  onStats: (stats: CanvasStats) => void;
};

export type MapCanvasHandle = { reset: () => void; zoomBy: (factor: number) => void };
export type SelectionAnchor = {
  x: number;
  y: number;
  align: "left" | "right";
  vertical?: "above" | "below";
};

type CachedTile = { image: ImageBitmap; bytes: number; used: number };
type PointerDrag = { id: number; startX: number; startY: number; viewX: number; viewY: number; moved: boolean };
type PinchGesture = { distance: number; center: Point; view: ViewState };
type InsertTileLayer = {
  render: ActiveInsertRender;
  grid: GridManifest;
  level: TileLevel;
  maximum: TileLevel;
  urls: string[];
};

const TILE_CACHE_LIMIT = 160;
const SHARED_TILE_ZOOM = 2.5;
const CATEGORY_COLOR: Record<OverlayPoint["category"], string> = {
  loot: "#f0c15d",
  insert: "#53c8e8",
  label: "#8fe09e",
  spawn: "#ef7777",
  marker: "#b2bcb5",
  item: "#72d895",
  object: "#e9a052",
};

function drawMarkerIcon(
  context: CanvasRenderingContext2D,
  icon: MarkerIcon,
  x: number,
  y: number,
  radius: number,
  color: string,
  selected: boolean,
  scale: number,
) {
  const size = radius * 1.2;
  const line = (selected ? 2.4 : 1.8) / scale;
  context.save();
  context.translate(x, y);
  context.lineWidth = line;
  context.strokeStyle = selected ? "#ffffff" : color;
  context.fillStyle = selected ? "#ffffff" : color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0, 0, 0, .95)";
  context.shadowBlur = 2.5 / scale;

  const linePath = (...parts: number[]) => {
    context.beginPath();
    context.moveTo(parts[0] * size, parts[1] * size);
    for (let index = 2; index < parts.length; index += 2) context.lineTo(parts[index] * size, parts[index + 1] * size);
    context.stroke();
  };
  const circle = (cx: number, cy: number, r: number, fill = false) => {
    context.beginPath();
    context.arc(cx * size, cy * size, r * size, 0, Math.PI * 2);
    if (fill) context.fill(); else context.stroke();
  };

  switch (icon) {
    case "insert":
      linePath(-.9, -.35, -.9, -.9, -.35, -.9);
      linePath(.35, -.9, .9, -.9, .9, -.35);
      linePath(.9, .35, .9, .9, .35, .9);
      linePath(-.35, .9, -.9, .9, -.9, .35);
      circle(0, 0, .16, true);
      break;
    case "spawn":
      circle(0, -.48, .24, true);
      linePath(0, -.18, 0, .45, -.46, .82);
      linePath(0, .45, .46, .82);
      break;
    case "comms":
      linePath(0, -.72, 0, .78, -.38, .78, .38, .78);
      context.beginPath(); context.arc(0, -.48 * size, .42 * size, -Math.PI * .78, -Math.PI * .22); context.stroke();
      context.beginPath(); context.arc(0, -.48 * size, .72 * size, -Math.PI * .78, -Math.PI * .22); context.stroke();
      break;
    case "intel":
      context.strokeRect(-.65 * size, -.82 * size, 1.3 * size, 1.64 * size);
      linePath(-.38, -.3, .38, -.3);
      linePath(-.38, .05, .38, .05);
      linePath(-.38, .4, .15, .4);
      break;
    case "weapon":
      circle(0, 0, .54);
      linePath(-.9, 0, -.35, 0);
      linePath(.35, 0, .9, 0);
      linePath(0, -.9, 0, -.35);
      linePath(0, .35, 0, .9);
      break;
    case "ammo":
      context.beginPath();
      context.moveTo(0, -.9 * size); context.lineTo(.38 * size, -.48 * size);
      context.lineTo(.38 * size, .75 * size); context.lineTo(-.38 * size, .75 * size);
      context.lineTo(-.38 * size, -.48 * size); context.closePath(); context.fill();
      break;
    case "attachment":
      linePath(-.86, 0, .86, 0);
      linePath(-.5, -.55, -.5, .55);
      linePath(.5, -.55, .5, .55);
      circle(0, 0, .18, true);
      break;
    case "defense":
      context.beginPath(); context.moveTo(0, -.88 * size); context.lineTo(.82 * size, .7 * size);
      context.lineTo(-.82 * size, .7 * size); context.closePath(); context.stroke();
      circle(0, .12, .16, true);
      break;
    case "medical":
      context.fillRect(-.22 * size, -.82 * size, .44 * size, 1.64 * size);
      context.fillRect(-.82 * size, -.22 * size, 1.64 * size, .44 * size);
      break;
    case "tools":
      context.beginPath();
      for (let index = 0; index < 6; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI / 3;
        const px = Math.cos(angle) * .75 * size;
        const py = Math.sin(angle) * .75 * size;
        if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath(); context.stroke(); circle(0, 0, .2, true);
      break;
    case "equipment":
      context.beginPath(); context.moveTo(0, -.88 * size); context.lineTo(.7 * size, -.55 * size);
      context.lineTo(.55 * size, .4 * size); context.lineTo(0, .88 * size);
      context.lineTo(-.55 * size, .4 * size); context.lineTo(-.7 * size, -.55 * size);
      context.closePath(); context.stroke();
      break;
    case "supply":
      context.strokeRect(-.72 * size, -.72 * size, 1.44 * size, 1.44 * size);
      linePath(-.72, -.72, .72, .72);
      linePath(.72, -.72, -.72, .72);
      break;
    case "loot":
    case "decor":
      for (let index = 0; index < (icon === "decor" ? 6 : 8); index += 1) {
        const angle = index * Math.PI / (icon === "decor" ? 3 : 4);
        linePath(Math.cos(angle) * .2, Math.sin(angle) * .2, Math.cos(angle) * .82, Math.sin(angle) * .82);
      }
      circle(0, 0, .2, true);
      break;
    case "fauna":
      circle(0, .3, .42, true);
      circle(-.5, -.35, .2, true); circle(0, -.58, .2, true); circle(.5, -.35, .2, true);
      break;
    case "remains":
      linePath(-.72, -.72, .72, .72);
      linePath(.72, -.72, -.72, .72);
      circle(0, 0, .18, true);
      break;
    case "evacuation":
      linePath(-.76, .72, -.76, -.72, .15, -.72);
      linePath(-.1, .42, .78, -.46, .78, .18);
      linePath(.78, -.46, .14, -.46);
      break;
    case "teleport":
      circle(0, 0, .78); circle(0, 0, .4); circle(0, 0, .1, true);
      break;
    case "boundary":
      circle(0, 0, .78);
      linePath(-.55, .55, .55, -.55);
      break;
    case "technical":
      context.strokeRect(-.68 * size, -.68 * size, 1.36 * size, 1.36 * size);
      circle(0, 0, .2, true);
      break;
    default:
      context.font = `800 ${1.45 * size}px IBM Plex Mono, monospace`;
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText("?", 0, 0);
  }

  if (selected) {
    context.shadowBlur = 0;
    context.beginPath(); context.arc(0, 0, radius * 1.55, 0, Math.PI * 2);
    context.lineWidth = 1.4 / scale; context.strokeStyle = "#ffffff"; context.stroke();
  }
  context.restore();
}

function tileUrl(pattern: string, manifestUrl: string, revision: number, z: number, x: number, y: number): string {
  const url = new URL(pattern.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), manifestUrl);
  url.searchParams.set("v", new URL(manifestUrl).searchParams.get("v") ?? String(revision));
  return url.toString();
}

function eventPoint(event: { clientX: number; clientY: number }, element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function insertPixelToMapPixel(
  mainGrid: GridManifest,
  render: ActiveInsertRender,
  insertGrid: GridManifest,
  pixel: Point,
): Point {
  const maximum = insertGrid.levels.at(-1)!;
  const minimum = gridWorldMin(insertGrid);
  // MapInsertSystem replaces the saved grid transform with the target tile offset.
  // Only the insert's local bounds belong here; applying manifest offset a second
  // time shifts the render by the editor-time fractional grid position.
  const local = {
    x: pixel.x / insertGrid.pixelsPerMeter + minimum.x,
    y: (maximum.height - pixel.y) / insertGrid.pixelsPerMeter + minimum.y,
  };
  return worldToMapPixel(mainGrid, {
    x: render.origin.x + local.x,
    y: render.origin.y + local.y,
  });
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({
  manifest,
  manifestUrl,
  points,
  insertRenders,
  layers,
  initialFocus,
  selectedKey,
  anchorKey,
  onSelect,
  onSelectedAnchor,
  onCoordinate,
  onShareTile,
  onStats,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<string, CachedTile>());
  const pendingRef = useRef(new Map<string, AbortController>());
  const dragRef = useRef<PointerDrag | undefined>(undefined);
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<PinchGesture | undefined>(undefined);
  const viewRef = useRef<ViewState>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [hoverTile, setHoverTile] = useState<Point>();
  const [tileRevision, setTileRevision] = useState(0);
  const grid = manifest.grids[0];
  const maximum = grid.levels.at(-1)!;

  useEffect(() => { viewRef.current = view; }, [view]);

  const reset = useCallback(() => {
    setView(fitView(maximum.width, maximum.height, size.width, size.height));
  }, [maximum.height, maximum.width, size.height, size.width]);

  const zoomAround = useCallback((factor: number, anchor = { x: size.width / 2, y: size.height / 2 }) => {
    setView((current) => {
      const scale = Math.min(8, Math.max(0.02, current.scale * factor));
      const mapX = (anchor.x - current.x) / current.scale;
      const mapY = (anchor.y - current.y) / current.scale;
      return { scale, x: anchor.x - mapX * scale, y: anchor.y - mapY * scale };
    });
  }, [size.height, size.width]);

  useImperativeHandle(ref, () => ({ reset, zoomBy: (factor) => zoomAround(factor) }), [reset, zoomAround]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setSize({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!initialFocus) {
      reset();
      return;
    }
    const pixel = worldToMapPixel(grid, initialFocus.world);
    setView({
      scale: initialFocus.scale,
      x: size.width / 2 - pixel.x * initialFocus.scale,
      y: size.height / 2 - pixel.y * initialFocus.scale,
    });
  }, [grid, initialFocus, manifestUrl, reset, size.height, size.width]);

  useEffect(() => setHoverTile(undefined), [manifestUrl]);

  useEffect(() => () => {
    for (const controller of pendingRef.current.values()) controller.abort();
    pendingRef.current.clear();
    for (const tile of cacheRef.current.values()) tile.image.close();
    cacheRef.current.clear();
  }, [manifestUrl]);

  const level = useMemo(
    () => chooseLevel(grid.levels, view.scale, window.devicePixelRatio || 1),
    [grid.levels, view.scale],
  );
  const visible = useMemo(
    () => visibleTiles(level, maximum.width, maximum.height, manifest.tileSize, view, size, 2),
    [level, manifest.tileSize, maximum.height, maximum.width, size, view],
  );
  const visibleUrls = useMemo(
    () => visible.map(([x, y]) => tileUrl(grid.path, manifestUrl, manifest.schemaVersion, level.z, x, y)),
    [grid.path, level.z, manifest.schemaVersion, manifestUrl, visible],
  );
  const overview = grid.levels[0];
  const overviewUrls = useMemo(
    () => overview.tiles.map(([x, y]) => tileUrl(grid.path, manifestUrl, manifest.schemaVersion, overview.z, x, y)),
    [grid.path, manifest.schemaVersion, manifestUrl, overview],
  );
  const insertLayers = useMemo<InsertTileLayer[]>(() => insertRenders.flatMap((render) => (
    render.manifest.grids.flatMap((insertGrid) => {
      const insertMaximum = insertGrid.levels.at(-1)!;
      const insertScreenScale = view.scale * grid.pixelsPerMeter / insertGrid.pixelsPerMeter;
      const insertLevel = chooseLevel(insertGrid.levels, insertScreenScale, window.devicePixelRatio || 1);
      const corners = [
        insertPixelToMapPixel(grid, render, insertGrid, { x: 0, y: 0 }),
        insertPixelToMapPixel(grid, render, insertGrid, { x: insertMaximum.width, y: 0 }),
        insertPixelToMapPixel(grid, render, insertGrid, { x: 0, y: insertMaximum.height }),
        insertPixelToMapPixel(grid, render, insertGrid, { x: insertMaximum.width, y: insertMaximum.height }),
      ].map((point) => ({ x: view.x + point.x * view.scale, y: view.y + point.y * view.scale }));
      const left = Math.min(...corners.map((point) => point.x));
      const right = Math.max(...corners.map((point) => point.x));
      const top = Math.min(...corners.map((point) => point.y));
      const bottom = Math.max(...corners.map((point) => point.y));
      if (right < 0 || bottom < 0 || left > size.width || top > size.height) return [];
      return [{
        render,
        grid: insertGrid,
        level: insertLevel,
        maximum: insertMaximum,
        urls: insertLevel.tiles.map(([x, y]) => tileUrl(
          insertGrid.path,
          render.manifestUrl,
          render.manifest.schemaVersion,
          insertLevel.z,
          x,
          y,
        )),
      }];
    })
  )), [grid, insertRenders, size.height, size.width, view]);
  const neededUrls = useMemo(
    () => [...new Set([...overviewUrls, ...visibleUrls, ...insertLayers.flatMap((layer) => layer.urls)])],
    [insertLayers, overviewUrls, visibleUrls],
  );

  useEffect(() => {
    const needed = new Set(neededUrls);
    for (const url of neededUrls) {
      const cached = cacheRef.current.get(url);
      if (cached) {
        cached.used = performance.now();
        continue;
      }
      if (pendingRef.current.has(url)) continue;
      const controller = new AbortController();
      pendingRef.current.set(url, controller);
      void fetch(url, { signal: controller.signal, cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
          return response.blob();
        })
        .then(async (blob) => ({ image: await createImageBitmap(blob), bytes: blob.size }))
        .then(({ image, bytes }) => {
          if (controller.signal.aborted) {
            image.close();
            return;
          }
          cacheRef.current.set(url, { image, bytes, used: performance.now() });
          const candidates = [...cacheRef.current.entries()]
            .filter(([key]) => !needed.has(key))
            .sort((a, b) => a[1].used - b[1].used);
          while (cacheRef.current.size > TILE_CACHE_LIMIT && candidates.length) {
            const [key, tile] = candidates.shift()!;
            cacheRef.current.delete(key);
            tile.image.close();
          }
          setTileRevision((value) => value + 1);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) console.warn(error);
        })
        .finally(() => {
          if (pendingRef.current.get(url) === controller) pendingRef.current.delete(url);
          setTileRevision((value) => value + 1);
        });
    }
  }, [neededUrls]);

  useEffect(() => {
    const bytes = [...cacheRef.current.values()].reduce((sum, tile) => sum + tile.bytes, 0);
    onStats({
      loadedTiles: cacheRef.current.size,
      loadedBytes: bytes,
      pendingTiles: pendingRef.current.size,
      zoom: level.z,
    });
  }, [level.z, onStats, tileRevision]);

  const visiblePoints = useMemo(() => points.filter((point) => (
    layers[point.category]
    && (!["loot", "spawn", "marker"].includes(point.category) || layers.groups[point.group])
  )), [layers, points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = "#020503";
    context.fillRect(0, 0, size.width, size.height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.imageSmoothingEnabled = false;

    const overviewRatioX = overview.width / maximum.width;
    const overviewRatioY = overview.height / maximum.height;
    overview.tiles.forEach(([x, y], index) => {
      const tile = cacheRef.current.get(overviewUrls[index]);
      if (!tile) return;
      const sourceX = x * manifest.tileSize;
      const sourceY = y * manifest.tileSize;
      const sourceWidth = Math.min(manifest.tileSize, overview.width - sourceX);
      const sourceHeight = Math.min(manifest.tileSize, overview.height - sourceY);
      context.drawImage(
        tile.image,
        sourceX / overviewRatioX,
        sourceY / overviewRatioY,
        sourceWidth / overviewRatioX,
        sourceHeight / overviewRatioY,
      );
    });

    const ratioX = level.width / maximum.width;
    const ratioY = level.height / maximum.height;
    visible.forEach(([x, y], index) => {
      const tile = cacheRef.current.get(visibleUrls[index]);
      if (!tile) return;
      const sourceX = x * manifest.tileSize;
      const sourceY = y * manifest.tileSize;
      const sourceWidth = Math.min(manifest.tileSize, level.width - sourceX);
      const sourceHeight = Math.min(manifest.tileSize, level.height - sourceY);
      context.drawImage(tile.image, sourceX / ratioX, sourceY / ratioY, sourceWidth / ratioX, sourceHeight / ratioY);
    });

    for (const layer of insertLayers) {
      const origin = insertPixelToMapPixel(grid, layer.render, layer.grid, { x: 0, y: 0 });
      const horizontal = insertPixelToMapPixel(grid, layer.render, layer.grid, { x: 1, y: 0 });
      const vertical = insertPixelToMapPixel(grid, layer.render, layer.grid, { x: 0, y: 1 });
      const ratioInsertX = layer.level.width / layer.maximum.width;
      const ratioInsertY = layer.level.height / layer.maximum.height;
      context.save();
      context.transform(
        horizontal.x - origin.x,
        horizontal.y - origin.y,
        vertical.x - origin.x,
        vertical.y - origin.y,
        origin.x,
        origin.y,
      );
      layer.level.tiles.forEach(([x, y], index) => {
        const tile = cacheRef.current.get(layer.urls[index]);
        if (!tile) return;
        const sourceX = x * layer.render.manifest.tileSize;
        const sourceY = y * layer.render.manifest.tileSize;
        const sourceWidth = Math.min(layer.render.manifest.tileSize, layer.level.width - sourceX);
        const sourceHeight = Math.min(layer.render.manifest.tileSize, layer.level.height - sourceY);
        context.drawImage(
          tile.image,
          sourceX / ratioInsertX,
          sourceY / ratioInsertY,
          sourceWidth / ratioInsertX,
          sourceHeight / ratioInsertY,
        );
      });
      context.restore();
    }

    if (hoverTile) {
      const topLeft = worldToMapPixel(grid, { x: hoverTile.x, y: hoverTile.y + 1 });
      const bottomRight = worldToMapPixel(grid, { x: hoverTile.x + 1, y: hoverTile.y });
      const width = bottomRight.x - topLeft.x;
      const height = bottomRight.y - topLeft.y;
      if (topLeft.x < maximum.width && topLeft.y < maximum.height && bottomRight.x > 0 && bottomRight.y > 0) {
        context.save();
        context.fillStyle = "rgba(139, 92, 181, .25)";
        context.strokeStyle = "rgba(222, 194, 244, .88)";
        context.lineWidth = 1.25 / view.scale;
        context.setLineDash([4 / view.scale, 3 / view.scale]);
        context.fillRect(topLeft.x, topLeft.y, width, height);
        context.strokeRect(topLeft.x, topLeft.y, width, height);
        context.restore();
      }
    }

    if (layers.coordinateGrid && view.scale * grid.pixelsPerMeter >= 18) {
      const step = grid.pixelsPerMeter * 10;
      context.lineWidth = 1.35 / view.scale;
      context.strokeStyle = "rgba(114, 216, 149, .5)";
      context.beginPath();
      for (let x = 0; x <= maximum.width; x += step) { context.moveTo(x, 0); context.lineTo(x, maximum.height); }
      for (let y = 0; y <= maximum.height; y += step) { context.moveTo(0, y); context.lineTo(maximum.width, y); }
      context.stroke();
    }

    const markerRadius = Math.max(4 / view.scale, (5.5 * layers.markerScale) / Math.sqrt(Math.max(view.scale, 0.08)));
    const bounds = {
      left: -view.x / view.scale - markerRadius * 4,
      top: -view.y / view.scale - markerRadius * 4,
      right: (size.width - view.x) / view.scale + markerRadius * 4,
      bottom: (size.height - view.y) / view.scale + markerRadius * 4,
    };
    const drawnDataTiles = new Set<string>();
    for (const point of visiblePoints) {
      const pixel = worldToMapPixel(grid, point);
      if (pixel.x < bounds.left || pixel.x > bounds.right || pixel.y < bounds.top || pixel.y > bounds.bottom) continue;
      const selected = point.key === selectedKey;

      if (point.category === "item" || point.category === "object") {
        if (!point.highlighted && !selected) continue;
        const tileKey = `${point.category}:${Math.floor(point.x)}:${Math.floor(point.y)}`;
        if (drawnDataTiles.has(tileKey) && !selected) continue;
        drawnDataTiles.add(tileKey);
        const radius = Math.max(6 / view.scale, (7.5 * layers.markerScale) / Math.sqrt(Math.max(view.scale, 0.08)));
        const color = CATEGORY_COLOR[point.category];
        context.save();
        context.translate(pixel.x, pixel.y);
        context.rotate(Math.PI / 4);
        context.strokeStyle = selected ? "#ffffff" : color;
        context.fillStyle = selected ? `${color}42` : `${color}1f`;
        context.lineWidth = (selected ? 2.6 : 1.4) / view.scale;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.strokeRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
        continue;
      }

      if (point.category === "label" && point.label) {
        const fontSize = 17 / view.scale;
        context.save();
        context.globalAlpha = selected ? 1 : 0.88;
        context.font = `700 ${fontSize}px IBM Plex Mono, monospace`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineJoin = "round";
        context.lineWidth = (selected ? 5.5 : 4.5) / view.scale;
        context.strokeStyle = "rgba(0, 0, 0, .9)";
        context.strokeText(point.label, pixel.x, pixel.y);
        context.fillStyle = selected ? "#ffffff" : CATEGORY_COLOR.label;
        context.fillText(point.label, pixel.x, pixel.y);
        context.restore();
        continue;
      }

      const style = markerStyle(point);
      drawMarkerIcon(context, style.icon, pixel.x, pixel.y, markerRadius, style.color, selected, view.scale);
    }
    context.restore();
  }, [grid, hoverTile, insertLayers, layers, level, manifest.tileSize, maximum, overview, overviewUrls, selectedKey, size, tileRevision, view, visible, visiblePoints, visibleUrls]);

  const mapPointAt = useCallback((screen: Point) => ({
    x: (screen.x - view.x) / view.scale,
    y: (screen.y - view.y) / view.scale,
  }), [view]);

  const nearestPoint = useCallback((screen: Point): OverlayPoint | undefined => {
    const mapPoint = mapPointAt(screen);
    let winner: OverlayPoint | undefined;
    let winnerDistance = Number.POSITIVE_INFINITY;
    for (const point of visiblePoints) {
      const quietDataPoint = (point.category === "item" || point.category === "object") && !point.highlighted;
      const radius = (quietDataPoint ? 8 : 14) / view.scale;
      const pixel = worldToMapPixel(grid, point);
      const distance = (pixel.x - mapPoint.x) ** 2 + (pixel.y - mapPoint.y) ** 2;
      if (distance <= radius * radius && distance < winnerDistance) { winner = point; winnerDistance = distance; }
    }
    return winner;
  }, [grid, mapPointAt, view.scale, visiblePoints]);

  useEffect(() => {
    if (!anchorKey) {
      onSelectedAnchor(undefined);
      return;
    }
    const point = visiblePoints.find((candidate) => candidate.key === anchorKey);
    if (!point) {
      onSelectedAnchor(undefined);
      return;
    }
    const pixel = worldToMapPixel(grid, point);
    const screen = { x: view.x + pixel.x * view.scale, y: view.y + pixel.y * view.scale };
    const visible = screen.x >= 0 && screen.x <= size.width && screen.y >= 0 && screen.y <= size.height;
    onSelectedAnchor(visible ? {
      ...screen,
      align: screen.x > size.width * 0.64 ? "right" : "left",
      vertical: screen.y > size.height * 0.55 ? "above" : "below",
    } : undefined);
  }, [anchorKey, grid, onSelectedAnchor, size.height, size.width, view, visiblePoints]);

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      tabIndex={0}
      aria-label="Интерактивная карта. Перетаскивайте мышью, изменяйте масштаб колесом."
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        event.preventDefault();
        const screen = eventPoint(event, event.currentTarget);
        const world = mapPixelToWorld(grid, mapPointAt(screen));
        onShareTile(world, SHARED_TILE_ZOOM);
      }}
      onWheel={(event) => {
        event.preventDefault();
        zoomAround(Math.exp(-event.deltaY * 0.0015), eventPoint(event, event.currentTarget));
      }}
      onPointerDown={(event) => {
        const point = eventPoint(event, event.currentTarget);
        event.currentTarget.setPointerCapture(event.pointerId);
        pointersRef.current.set(event.pointerId, point);
        if (pointersRef.current.size === 1) {
          dragRef.current = { id: event.pointerId, startX: point.x, startY: point.y, viewX: view.x, viewY: view.y, moved: false };
          pinchRef.current = undefined;
        } else if (pointersRef.current.size === 2) {
          const [first, second] = [...pointersRef.current.values()];
          pinchRef.current = {
            distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
            center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
            view,
          };
          dragRef.current = undefined;
        }
      }}
      onPointerMove={(event) => {
        const screen = eventPoint(event, event.currentTarget);
        const world = mapPixelToWorld(grid, mapPointAt(screen));
        const tile = { x: Math.floor(world.x), y: Math.floor(world.y) };
        setHoverTile((current) => current?.x === tile.x && current.y === tile.y ? current : tile);
        onCoordinate(world, {
          ...screen,
          align: screen.x > size.width * 0.64 ? "right" : "left",
          vertical: screen.y > size.height * 0.45 ? "above" : "below",
        });
        if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, screen);
        const pinch = pinchRef.current;
        if (pinch && pointersRef.current.size >= 2) {
          const [first, second] = [...pointersRef.current.values()];
          const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
          const scale = Math.min(8, Math.max(0.02, pinch.view.scale * distance / pinch.distance));
          const mapX = (pinch.center.x - pinch.view.x) / pinch.view.scale;
          const mapY = (pinch.center.y - pinch.view.y) / pinch.view.scale;
          const nextView = { scale, x: center.x - mapX * scale, y: center.y - mapY * scale };
          viewRef.current = nextView;
          setView(nextView);
          return;
        }
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = screen.x - drag.startX;
        const dy = screen.y - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        const wasPinching = Boolean(pinchRef.current);
        if (!wasPinching && drag && !drag.moved) {
          const nearest = nearestPoint(eventPoint(event, event.currentTarget));
          onSelect(nearest ? pointsOnSameTile(visiblePoints, nearest) : []);
        }
        pointersRef.current.delete(event.pointerId);
        pinchRef.current = undefined;
        const remaining = [...pointersRef.current.entries()][0];
        const currentView = viewRef.current;
        dragRef.current = remaining
          ? { id: remaining[0], startX: remaining[1].x, startY: remaining[1].y, viewX: currentView.x, viewY: currentView.y, moved: true }
          : undefined;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pointersRef.current.delete(event.pointerId);
        pinchRef.current = undefined;
        dragRef.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerLeave={() => {
        setHoverTile(undefined);
        onCoordinate(undefined, undefined);
      }}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 160 : 60;
        if (event.key === "+" || event.key === "=") zoomAround(1.25);
        else if (event.key === "-") zoomAround(0.8);
        else if (event.key === "0") reset();
        else if (["ArrowLeft", "a", "A"].includes(event.key)) setView((current) => ({ ...current, x: current.x + amount }));
        else if (["ArrowRight", "d", "D"].includes(event.key)) setView((current) => ({ ...current, x: current.x - amount }));
        else if (["ArrowUp", "w", "W"].includes(event.key)) setView((current) => ({ ...current, y: current.y + amount }));
        else if (["ArrowDown", "s", "S"].includes(event.key)) setView((current) => ({ ...current, y: current.y - amount }));
        else return;
        event.preventDefault();
      }}
    />
  );
});
