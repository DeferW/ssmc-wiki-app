import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadMapCatalog, loadMapOverlay, loadTileManifest } from "./api";
import { mapDataUrl } from "./config";
import { MapCanvas, type MapCanvasHandle, type SelectionAnchor } from "./MapCanvas";
import { areaAt, describeComponents, flattenOverlay, pointDisplayName, spawnOptions } from "./overlay";
import type { CanvasStats, LayerSettings, MapCatalog, MapOverlay, OverlayCategory, OverlayPoint, Point, TileManifest } from "./types";

const SETTINGS_KEY = "ssmc-map-layers-v2";
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

const CATEGORY_LABELS: Record<OverlayCategory, string> = {
  loot: "Лут",
  insert: "Инсерт",
  label: "Надпись",
  spawn: "Точка появления",
  marker: "Технический маркер",
};

const AREA_SUPPORT = [
  { bit: 0, label: "Авиаудар (CAS)" },
  { bit: 1, label: "Эвакуация «Фултон»" },
  { bit: 2, label: "Лазерное целеуказание" },
  { bit: 3, label: "Установка миномёта" },
  { bit: 4, label: "Огонь миномёта" },
  { bit: 5, label: "Медэвак" },
  { bit: 6, label: "Десантирование" },
  { bit: 7, label: "Орбитальный удар" },
  { bit: 8, label: "Сброс снабжения" },
] as const;

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
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor>();
  const [coordinate, setCoordinate] = useState<Point>();
  const [coordinateAnchor, setCoordinateAnchor] = useState<SelectionAnchor>();
  const [stats, setStats] = useState<CanvasStats>({ loadedTiles: 0, loadedBytes: 0, pendingTiles: 0, zoom: 0 });
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const manifestUrl = entry ? mapDataUrl(entry.tiles) : "";
  const overlayUrl = entry ? mapDataUrl(entry.overlay) : "";
  const manifest = manifestResult?.url === manifestUrl ? manifestResult.value : undefined;
  const overlay = overlayResult?.url === overlayUrl ? overlayResult.value : undefined;
  const coordinatesReady = Boolean(
    manifest
    && manifest.schemaVersion >= 3
    && manifest.grids.every((grid) => Boolean(grid.worldMin)),
  );

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
    if (!entry || overlay) return;
    const controller = new AbortController();
    loadMapOverlay(overlayUrl, controller.signal)
      .then((value) => setOverlayResult({ url: overlayUrl, value }))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные слоёв.");
        }
      });
    return () => controller.abort();
  }, [entry, overlay, overlayUrl]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(layers)); } catch { /* private storage may be unavailable */ }
  }, [layers]);

  const allPoints = useMemo(() => overlay ? flattenOverlay(overlay) : [], [overlay]);
  const points = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return allPoints;
    return allPoints.filter((point) => `${pointDisplayName(point)} ${point.name} ${point.prototypeId}`.toLocaleLowerCase("ru").includes(query));
  }, [allPoints, search]);
  const pointCounts = useMemo(() => allPoints.reduce<Record<string, number>>((counts, point) => {
    counts[point.category] = (counts[point.category] ?? 0) + 1;
    return counts;
  }, {}), [allPoints]);
  const selectedOptions = useMemo(() => selected ? spawnOptions(selected) : [], [selected]);
  const hoveredArea = useMemo(() => areaAt(overlay, coordinate), [coordinate, overlay]);

  const toggleLayer = (key: OverlayCategory) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const onStats = useCallback((value: CanvasStats) => setStats(value), []);
  const onCoordinate = useCallback((value?: Point, anchor?: SelectionAnchor) => {
    setCoordinate(value);
    setCoordinateAnchor(anchor);
  }, []);
  const onSelect = useCallback((value?: OverlayPoint) => setSelected(value), []);
  const onSelectedAnchor = useCallback((value?: SelectionAnchor) => setSelectionAnchor(value), []);

  return (
    <main className="maps-page">
      <header className="maps-toolbar">
        <button
          className="maps-sidebar-toggle"
          type="button"
          aria-expanded={sidebarOpen}
          aria-controls="map-layers"
          onClick={() => setSidebarOpen((value) => !value)}
          title={sidebarOpen ? "Свернуть слои" : "Открыть слои"}
        >
          {sidebarOpen ? "‹" : "☰"}
        </button>
        <div className="maps-map-picker">
          <label className="sr-only" htmlFor="map-select">Карта</label>
          <select
            id="map-select"
            value={entry?.id ?? ""}
            disabled={!catalog}
            onChange={(event) => {
              setSelected(undefined);
              setCoordinate(undefined);
              setCoordinateAnchor(undefined);
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
        </div>
        <div className="maps-network" title="В памяти находятся только тайлы вокруг видимой области">
          <span className={stats.pendingTiles ? "maps-network-dot is-loading" : "maps-network-dot"} />
          {stats.loadedTiles} тайлов · {formatBytes(stats.loadedBytes)} · Z{stats.zoom}
        </div>
      </header>

      <div className="maps-workspace">
        <section className="maps-stage">
          {manifest && entry ? (
            <MapCanvas
              ref={canvasRef}
              manifest={manifest}
              manifestUrl={manifestUrl}
              points={coordinatesReady ? points : []}
              layers={layers}
              selectedKey={selected?.key}
              onSelect={onSelect}
              onSelectedAnchor={onSelectedAnchor}
              onCoordinate={onCoordinate}
              onStats={onStats}
            />
          ) : (
            <div className="maps-loading"><span className="maps-loader" />{error ? "Карта недоступна" : "Загрузка манифеста карты…"}</div>
          )}

          <nav className="maps-mode-dock" aria-label="Режим работы карты">
            <button className="is-active" type="button" aria-current="page" aria-label="Просмотр карты" title="Просмотр карты">⌖</button>
            <button type="button" disabled aria-label="Редактор разметки — запланировано" title="Редактор разметки — следующий модуль">✎</button>
            <button type="button" disabled aria-label="Расчёт зон огня — запланировано" title="Расчёт зон огня — следующий модуль">◎</button>
          </nav>

          {!coordinatesReady && manifest && (
            <div className="maps-data-warning" role="status">
              Координаты слоёв ожидают обновления данных карт. Сам рендер доступен, маркеры временно скрыты.
            </div>
          )}
          {error && <div className="maps-error" role="alert"><strong>Ошибка данных</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Повторить</button></div>}
          <div className="maps-coordinate">{formatCoordinate(coordinate)}</div>
          {search && <div className="maps-result-count">Найдено: {points.length}</div>}

          {coordinate && coordinateAnchor && hoveredArea && (
            <section
              className={`maps-tile-info maps-tile-info--${coordinateAnchor.align} maps-tile-info--${coordinateAnchor.vertical ?? "above"}`}
              style={{ left: coordinateAnchor.x, top: coordinateAnchor.y }}
            >
              <div className="maps-tile-info-heading">
                <span>Поддержка тайла</span>
                <code>X {Math.floor(coordinate.x)} · Y {Math.floor(coordinate.y)}</code>
              </div>
              <strong>{hoveredArea.name}</strong>
              <div className="maps-support-grid">
                {AREA_SUPPORT.map((support) => {
                  const allowed = Boolean(hoveredArea.supportMask & (1 << support.bit));
                  return (
                    <span className={allowed ? "is-allowed" : "is-blocked"} key={support.bit}>
                      <i aria-hidden="true">{allowed ? "✓" : "—"}</i>{support.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {selected && selectionAnchor && (
            <section
              className={`maps-inspector maps-inspector--${selectionAnchor.align}`}
              style={{ left: selectionAnchor.x, top: selectionAnchor.y }}
            >
              <button className="maps-inspector-close" type="button" onClick={() => setSelected(undefined)} aria-label="Закрыть информацию">×</button>
              <div className={`maps-point-badge maps-point-badge--${selected.category}`}>{CATEGORY_LABELS[selected.category]}</div>
              <h2>{pointDisplayName(selected)}</h2>
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
          )}
        </section>

        <aside id="map-layers" className={sidebarOpen ? "maps-sidebar is-open" : "maps-sidebar"}>
          <div className="maps-sidebar-heading">
            <div><span className="eyebrow">Отображение</span><h1>Слои</h1></div>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Свернуть панель">‹</button>
          </div>

          <label className="maps-search">
            <span>Поиск точки</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="лут, эвакуация…" />
          </label>

          <section className="maps-layer-list" aria-label="Слои данных">
            {LAYER_OPTIONS.map((option) => (
              <label className="maps-layer" key={option.key}>
                <input type="checkbox" checked={layers[option.key]} onChange={() => toggleLayer(option.key)} />
                <span title={option.detail}><strong>{option.label}</strong></span>
                {overlay && <output>{pointCounts[option.key] ?? 0}</output>}
              </label>
            ))}
            <label className="maps-layer">
              <input type="checkbox" checked={layers.coordinateGrid} onChange={() => setLayers((value) => ({ ...value, coordinateGrid: !value.coordinateGrid }))} />
              <span title="Шаг 10 игровых метров"><strong>Сетка координат</strong></span>
            </label>
          </section>

          <label className="maps-marker-size">
            <span>Размер маркеров <output>{layers.markerScale.toFixed(1)}×</output></span>
            <input type="range" min="0.6" max="1.8" step="0.1" value={layers.markerScale} onChange={(event) => setLayers((value) => ({ ...value, markerScale: Number(event.target.value) }))} />
          </label>

          <p className="maps-sidebar-hint">Колесо — масштаб · перетаскивание — обзор · клик — данные точки</p>
        </aside>
      </div>
    </main>
  );
}
