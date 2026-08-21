import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { chooseLevel, fitView, mapPixelToWorld, visibleTiles, worldToMapPixel } from "./tileMath";
import type { CanvasStats, LayerSettings, OverlayPoint, Point, TileManifest, ViewState } from "./types";

type Props = {
  manifest: TileManifest;
  manifestUrl: string;
  points: OverlayPoint[];
  layers: LayerSettings;
  selectedKey?: string;
  onSelect: (point?: OverlayPoint) => void;
  onSelectedAnchor: (anchor?: SelectionAnchor) => void;
  onCoordinate: (point?: Point, anchor?: SelectionAnchor) => void;
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

const TILE_CACHE_LIMIT = 80;
const CATEGORY_COLOR: Record<OverlayPoint["category"], string> = {
  loot: "#f0c15d",
  insert: "#53c8e8",
  label: "#8fe09e",
  spawn: "#ef7777",
  marker: "#b2bcb5",
};

const QUIET_MARKERS: Record<string, { glyph: string; color: string }> = {
  RMCCrashLandBarrier: { glyph: "H", color: "#c4cba6" },
  RMCBlockerVehicle: { glyph: "⊘", color: "#75a6a4" },
  RMCDecalSpawnerBloodSplatters: { glyph: "✦", color: "#a96767" },
};

function tileUrl(pattern: string, manifestUrl: string, revision: number, z: number, x: number, y: number): string {
  const url = new URL(pattern.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), manifestUrl);
  url.searchParams.set("v", String(revision));
  return url.toString();
}

function eventPoint(event: { clientX: number; clientY: number }, element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({
  manifest,
  manifestUrl,
  points,
  layers,
  selectedKey,
  onSelect,
  onSelectedAnchor,
  onCoordinate,
  onStats,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<string, CachedTile>());
  const pendingRef = useRef(new Map<string, AbortController>());
  const dragRef = useRef<PointerDrag | undefined>(undefined);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, scale: 1 });
  const [tileRevision, setTileRevision] = useState(0);
  const grid = manifest.grids[0];
  const maximum = grid.levels.at(-1)!;

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

  useEffect(() => reset(), [manifestUrl, size.width, size.height, reset]);

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
    () => visibleTiles(level, maximum.width, maximum.height, manifest.tileSize, view, size),
    [level, manifest.tileSize, maximum.height, maximum.width, size, view],
  );
  const visibleUrls = useMemo(
    () => visible.map(([x, y]) => tileUrl(grid.path, manifestUrl, manifest.schemaVersion, level.z, x, y)),
    [grid.path, level.z, manifest.schemaVersion, manifestUrl, visible],
  );

  useEffect(() => {
    const needed = new Set(visibleUrls);
    for (const [url, controller] of pendingRef.current) {
      if (!needed.has(url)) {
        controller.abort();
        pendingRef.current.delete(url);
      }
    }
    for (const url of visibleUrls) {
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
  }, [visibleUrls]);

  useEffect(() => {
    const bytes = [...cacheRef.current.values()].reduce((sum, tile) => sum + tile.bytes, 0);
    onStats({
      loadedTiles: cacheRef.current.size,
      loadedBytes: bytes,
      pendingTiles: pendingRef.current.size,
      zoom: level.z,
    });
  }, [level.z, onStats, tileRevision]);

  const visiblePoints = useMemo(() => points.filter((point) => layers[point.category]), [layers, points]);

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

    if (layers.coordinateGrid && view.scale * grid.pixelsPerMeter >= 18) {
      const step = grid.pixelsPerMeter * 10;
      context.lineWidth = 1 / view.scale;
      context.strokeStyle = "rgba(114, 216, 149, .22)";
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
    for (const point of visiblePoints) {
      const pixel = worldToMapPixel(grid, point);
      if (pixel.x < bounds.left || pixel.x > bounds.right || pixel.y < bounds.top || pixel.y > bounds.bottom) continue;
      const selected = point.key === selectedKey;

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

      const quiet = QUIET_MARKERS[point.prototypeId];
      if (quiet) {
        if (view.scale < 0.28 && !selected) continue;
        context.save();
        context.globalAlpha = selected ? 1 : 0.46;
        context.font = `${point.prototypeId === "RMCCrashLandBarrier" ? 700 : 500} ${10 / view.scale}px IBM Plex Mono, monospace`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = quiet.color;
        context.fillText(quiet.glyph, pixel.x, pixel.y);
        if (selected) {
          context.beginPath();
          context.arc(pixel.x, pixel.y, 8 / view.scale, 0, Math.PI * 2);
          context.lineWidth = 1.5 / view.scale;
          context.strokeStyle = "#ffffff";
          context.stroke();
        }
        context.restore();
        continue;
      }

      context.beginPath();
      context.arc(pixel.x, pixel.y, markerRadius * (selected ? 1.45 : 1), 0, Math.PI * 2);
      context.fillStyle = CATEGORY_COLOR[point.category];
      context.globalAlpha = point.insertPath ? 0.72 : 0.92;
      context.fill();
      context.globalAlpha = 1;
      context.lineWidth = (selected ? 3 : 1) / view.scale;
      context.strokeStyle = selected ? "#ffffff" : "rgba(0, 0, 0, .78)";
      context.stroke();
    }
    context.restore();
  }, [grid, layers, level, manifest.tileSize, maximum, selectedKey, size, tileRevision, view, visible, visiblePoints, visibleUrls]);

  const mapPointAt = useCallback((screen: Point) => ({
    x: (screen.x - view.x) / view.scale,
    y: (screen.y - view.y) / view.scale,
  }), [view]);

  const nearestPoint = useCallback((screen: Point): OverlayPoint | undefined => {
    const mapPoint = mapPointAt(screen);
    const radius = 14 / view.scale;
    let winner: OverlayPoint | undefined;
    let winnerDistance = radius * radius;
    for (const point of visiblePoints) {
      const pixel = worldToMapPixel(grid, point);
      const distance = (pixel.x - mapPoint.x) ** 2 + (pixel.y - mapPoint.y) ** 2;
      if (distance <= winnerDistance) { winner = point; winnerDistance = distance; }
    }
    return winner;
  }, [grid, mapPointAt, view.scale, visiblePoints]);

  useEffect(() => {
    if (!selectedKey) {
      onSelectedAnchor(undefined);
      return;
    }
    const point = visiblePoints.find((candidate) => candidate.key === selectedKey);
    if (!point) {
      onSelectedAnchor(undefined);
      return;
    }
    const pixel = worldToMapPixel(grid, point);
    const screen = { x: view.x + pixel.x * view.scale, y: view.y + pixel.y * view.scale };
    const visible = screen.x >= 0 && screen.x <= size.width && screen.y >= 0 && screen.y <= size.height;
    onSelectedAnchor(visible ? { ...screen, align: screen.x > size.width * 0.64 ? "right" : "left" } : undefined);
  }, [grid, onSelectedAnchor, selectedKey, size.height, size.width, view, visiblePoints]);

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      tabIndex={0}
      aria-label="Интерактивная карта. Перетаскивайте мышью, изменяйте масштаб колесом."
      onContextMenu={(event) => event.preventDefault()}
      onWheel={(event) => {
        event.preventDefault();
        zoomAround(Math.exp(-event.deltaY * 0.0015), eventPoint(event, event.currentTarget));
      }}
      onPointerDown={(event) => {
        const point = eventPoint(event, event.currentTarget);
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id: event.pointerId, startX: point.x, startY: point.y, viewX: view.x, viewY: view.y, moved: false };
      }}
      onPointerMove={(event) => {
        const screen = eventPoint(event, event.currentTarget);
        const world = mapPixelToWorld(grid, mapPointAt(screen));
        onCoordinate(world, {
          ...screen,
          align: screen.x > size.width * 0.64 ? "right" : "left",
          vertical: screen.y > size.height * 0.45 ? "above" : "below",
        });
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        const dx = screen.x - drag.startX;
        const dy = screen.y - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        setView((current) => ({ ...current, x: drag.viewX + dx, y: drag.viewY + dy }));
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (drag && !drag.moved) onSelect(nearestPoint(eventPoint(event, event.currentTarget)));
        dragRef.current = undefined;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerLeave={() => onCoordinate(undefined, undefined)}
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
