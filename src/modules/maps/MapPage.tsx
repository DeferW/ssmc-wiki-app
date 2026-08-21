import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadMapCatalog, loadMapOverlay, loadTileManifest } from "./api";
import { MAP_DATA_ROOT } from "./config";
import { MapCanvas, type MapCanvasHandle } from "./MapCanvas";
import { describeComponents, flattenOverlay, spawnOptions } from "./overlay";
import type { CanvasStats, LayerSettings, MapCatalog, MapOverlay, OverlayCategory, OverlayPoint, Point, TileManifest } from "./types";

const SETTINGS_KEY = "ssmc-map-layers-v1";
const DEFAULT_LAYERS: LayerSettings = {
  loot: true,
  insert: true,
  label: true,
  spawn: false,
  marker: false,
  coordinateGrid: false,
  markerScale: 1,
};

const LAYER_OPTIONS: { key: OverlayCategory; label: string; detail: string }[] = [
  { key: "loot", label: "Возможный лут", detail: "случайные и условные спавнеры" },
  { key: "insert", label: "Инсерты", detail: "вариативные части карты" },
  { key: "label", label: "Надписи", detail: "именованные точки и переходы" },
  { key: "spawn", label: "Точки появления", detail: "спавны ролей и отрядов" },
  { key: "marker", label: "Прочие маркеры", detail: "технические точки карты" },
];

function initialLayers(): LayerSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<LayerSettings> | null;
    return saved ? { ...DEFAULT_LAYERS, ...saved } : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function formatCoordinate(point?: Point): string {
  return point ? `X ${point.x.toFixed(1)} · Y ${point.y.toFixed(1)}` : "Наведите на карту";
}

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canvasRef = useRef<MapCanvasHandle>(null);
  const [catalog, setCatalog] = useState<MapCatalog>();
  const [manifestResult, setManifestResult] = useState<{ url: string; value: TileManifest }>();
  const [overlayResult, setOverlayResult] = useState<{ url: string; value: MapOverlay }>();
  const [layers, setLayers] = useState<LayerSettings>(initialLayers);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OverlayPoint>();
  const [coordinate, setCoordinate] = useState<Point>();
  const [stats, setStats] = useState<CanvasStats>({ loadedTiles: 0, loadedBytes: 0, pendingTiles: 0, zoom: 0 });
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const requestedMap = searchParams.get("map");

  useEffect(() => {
    let active = true;
    loadMapCatalog()
      .then((value) => {
        if (!active) return;
        setCatalog(value);
        if (!requestedMap || !value.maps.some((map) => map.id === requestedMap)) {
          setSearchParams({ map: value.maps[0].id }, { replace: true });
        }
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог карт."));
    return () => { active = false; };
  }, [requestedMap, setSearchParams]);

  const entry = useMemo(
    () => catalog?.maps.find((map) => map.id === requestedMap) ?? catalog?.maps[0],
    [catalog, requestedMap],
  );
  const manifestUrl = entry ? new URL(entry.tiles, MAP_DATA_ROOT).toString() : "";
  const overlayUrl = entry ? new URL(entry.overlay, MAP_DATA_ROOT).toString() : "";
  const manifest = manifestResult?.url === manifestUrl ? manifestResult.value : undefined;
  const overlay = overlayResult?.url === overlayUrl ? overlayResult.value : undefined;
  const overlaysEnabled = LAYER_OPTIONS.some(({ key }) => layers[key]);

  useEffect(() => {
    if (!entry) return;
    const controller = new AbortController();
    loadTileManifest(manifestUrl, controller.signal)
      .then((value) => {
        setManifestResult({ url: manifestUrl, value });
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить карту.");
        }
      });
    return () => controller.abort();
  }, [entry, manifestUrl]);

  useEffect(() => {
    if (!entry || !overlaysEnabled || overlay) return;
    const controller = new AbortController();
    loadMapOverlay(overlayUrl, controller.signal)
      .then((value) => setOverlayResult({ url: overlayUrl, value }))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные слоёв.");
        }
      });
    return () => controller.abort();
  }, [entry, overlay, overlayUrl, overlaysEnabled]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(layers)); } catch { /* private storage may be unavailable */ }
  }, [layers]);

  const allPoints = useMemo(() => overlay ? flattenOverlay(overlay) : [], [overlay]);
  const points = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return allPoints;
    return allPoints.filter((point) => `${point.name} ${point.prototypeId} ${point.label ?? ""}`.toLocaleLowerCase("ru").includes(query));
  }, [allPoints, search]);
  const pointCounts = useMemo(() => allPoints.reduce<Record<string, number>>((counts, point) => {
    counts[point.category] = (counts[point.category] ?? 0) + 1;
    return counts;
  }, {}), [allPoints]);
  const selectedOptions = useMemo(() => selected ? spawnOptions(selected) : [], [selected]);

  const toggleLayer = (key: OverlayCategory) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const onStats = useCallback((value: CanvasStats) => setStats(value), []);
  const onCoordinate = useCallback((value?: Point) => setCoordinate(value), []);
  const onSelect = useCallback((value?: OverlayPoint) => setSelected(value), []);

  return (
    <main className="maps-page">
      <header className="maps-toolbar">
        <div className="maps-map-picker">
          <label htmlFor="map-select">Карта</label>
          <select
            id="map-select"
            value={entry?.id ?? ""}
            disabled={!catalog}
            onChange={(event) => {
              setSelected(undefined);
              setError(undefined);
              setSearchParams({ map: event.target.value });
            }}
          >
            {catalog?.maps.map((map) => <option value={map.id} key={map.id}>{map.name}</option>)}
          </select>
          {entry && <span className={`map-kind map-kind--${entry.kind}`}>{entry.kind === "ship" ? "корабль" : "планета"}</span>}
        </div>
        <div className="maps-toolbar-actions" aria-label="Управление масштабом">
          <button type="button" onClick={() => canvasRef.current?.zoomBy(0.8)} aria-label="Уменьшить">−</button>
          <button type="button" onClick={() => canvasRef.current?.reset()}>Вписать</button>
          <button type="button" onClick={() => canvasRef.current?.zoomBy(1.25)} aria-label="Увеличить">+</button>
          <button className="maps-layers-button" type="button" onClick={() => setSidebarOpen((value) => !value)}>Слои</button>
        </div>
        <div className="maps-network" title="В памяти находятся только тайлы вокруг видимой области">
          <span className={stats.pendingTiles ? "maps-network-dot is-loading" : "maps-network-dot"} />
          {stats.loadedTiles} тайлов · {formatBytes(stats.loadedBytes)} · Z{stats.zoom}
        </div>
      </header>

      <div className="maps-workspace">
        <aside className={sidebarOpen ? "maps-sidebar is-open" : "maps-sidebar"}>
          <div className="maps-sidebar-heading">
            <div><span className="eyebrow">MAP-02</span><h1>Слои карты</h1></div>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Закрыть панель">×</button>
          </div>

          <label className="maps-search">
            <span>Поиск точки</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="лут, эвакуация…" />
          </label>

          <section className="maps-layer-list" aria-label="Слои данных">
            {LAYER_OPTIONS.map((option) => (
              <label className="maps-layer" key={option.key}>
                <input type="checkbox" checked={layers[option.key]} onChange={() => toggleLayer(option.key)} />
                <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                {overlay && <output>{pointCounts[option.key] ?? 0}</output>}
              </label>
            ))}
            <label className="maps-layer">
              <input type="checkbox" checked={layers.coordinateGrid} onChange={() => setLayers((value) => ({ ...value, coordinateGrid: !value.coordinateGrid }))} />
              <span><strong>Координатная сетка</strong><small>шаг 10 игровых метров</small></span>
            </label>
          </section>

          <label className="maps-marker-size">
            <span>Размер маркеров <output>{layers.markerScale.toFixed(1)}×</output></span>
            <input type="range" min="0.6" max="1.8" step="0.1" value={layers.markerScale} onChange={(event) => setLayers((value) => ({ ...value, markerScale: Number(event.target.value) }))} />
          </label>

          {selected ? (
            <section className="maps-inspector">
              <div className={`maps-point-badge maps-point-badge--${selected.category}`}>{selected.category}</div>
              <h2>{selected.label || selected.name}</h2>
              <code>{selected.prototypeId}</code>
              <p>X {selected.x.toFixed(1)} · Y {selected.y.toFixed(1)}</p>
              {selected.probability !== undefined && <p>Вероятность инсерта: {Math.round(selected.probability * 100)}%</p>}
              {selected.insertPath && <p className="maps-path">Вариант: {selected.insertPath}</p>}
              {describeComponents(selected).map((description) => <p key={description}>{description}</p>)}
              {selectedOptions.length > 0 && (
                <details className="maps-spawn-options">
                  <summary>Возможные сущности ({selectedOptions.length})</summary>
                  <ul>{selectedOptions.map((option) => <li key={option}><code>{option}</code></li>)}</ul>
                </details>
              )}
            </section>
          ) : (
            <p className="maps-sidebar-hint">Нажмите на маркер, чтобы открыть его параметры. Колесо — масштаб, перетаскивание — перемещение.</p>
          )}
        </aside>

        <section className="maps-stage">
          {manifest && entry ? (
            <MapCanvas
              ref={canvasRef}
              manifest={manifest}
              manifestUrl={manifestUrl}
              points={points}
              layers={layers}
              selectedKey={selected?.key}
              onSelect={onSelect}
              onCoordinate={onCoordinate}
              onStats={onStats}
            />
          ) : (
            <div className="maps-loading"><span className="maps-loader" />{error ? "Карта недоступна" : "Загрузка манифеста карты…"}</div>
          )}
          {error && <div className="maps-error" role="alert"><strong>Ошибка данных</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Повторить</button></div>}
          <div className="maps-coordinate">{formatCoordinate(coordinate)}</div>
          {search && <div className="maps-result-count">Найдено точек: {points.length}</div>}
        </section>
      </div>
    </main>
  );
}
