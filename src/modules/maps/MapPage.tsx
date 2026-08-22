import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadMapCatalog, loadMapOverlay, loadTileManifest } from "./api";
import { mapDataUrl } from "./config";
import { MapCanvas, type MapCanvasHandle, type SelectionAnchor } from "./MapCanvas";
import { activeInsertPlacements, areaAt, describeComponents, flattenOverlay, insertVariations, pointDisplayName, pointProbabilityDescriptions, spawnOptions } from "./overlay";
import type { ActiveInsertRender, CanvasStats, LayerSettings, MapCatalog, MapOverlay, OverlayCategory, OverlayGroup, OverlayPoint, Point, TileManifest } from "./types";

const SETTINGS_KEY = "ssmc-map-layers-v3";
const DEFAULT_GROUPS: Record<OverlayGroup, boolean> = {
  "loot-intel": true,
  "loot-weapons": true,
  "loot-ammo": true,
  "loot-tools": true,
  "loot-medical": true,
  "loot-equipment": true,
  "loot-supplies": true,
  "loot-other": true,
  "misc-spawns": true,
  "misc-creatures": true,
  "misc-transport": true,
  "misc-boundaries": true,
  "misc-decor": true,
  "misc-other": true,
};
const DEFAULT_LAYERS: LayerSettings = {
  loot: true,
  insert: true,
  label: true,
  spawn: false,
  marker: false,
  coordinateGrid: false,
  areaSupport: false,
  markerScale: 1,
  groups: DEFAULT_GROUPS,
};

const LOOT_GROUPS: { key: OverlayGroup; label: string }[] = [
  { key: "loot-intel", label: "Разведданные и документы" },
  { key: "loot-weapons", label: "Оружие" },
  { key: "loot-ammo", label: "Боеприпасы" },
  { key: "loot-tools", label: "Инструменты и техника" },
  { key: "loot-medical", label: "Медицина" },
  { key: "loot-equipment", label: "Экипировка" },
  { key: "loot-supplies", label: "Ящики и снабжение" },
  { key: "loot-other", label: "Прочий лут" },
];

const MISC_GROUPS: { key: OverlayGroup; label: string }[] = [
  { key: "misc-spawns", label: "Точки появления" },
  { key: "misc-creatures", label: "Тела, существа и следы" },
  { key: "misc-transport", label: "Эвакуация и переходы" },
  { key: "misc-boundaries", label: "Барьеры и ограничения" },
  { key: "misc-decor", label: "Декор и случайное окружение" },
  { key: "misc-other", label: "Прочие технические точки" },
];

const CATEGORY_LABELS: Record<OverlayCategory, string> = {
  loot: "Лут",
  insert: "Инсерт",
  label: "Надпись",
  spawn: "Точка появления",
  marker: "Технический маркер",
};

const AREA_SUPPORT_COLUMNS = [
  [
    { bit: 7, label: "Орбитальный удар" },
    { bit: 0, label: "Авиаудар (CAS)" },
    { bit: 4, label: "Огонь миномёта" },
    { bit: 3, label: "Установка миномёта" },
  ],
  [
    { bit: 5, label: "Медэвак" },
    { bit: 1, label: "Эвакуация «Фултон»" },
    { bit: 6, label: "Десантирование" },
    { bit: 8, label: "Сброс снабжения" },
  ],
] as const;

function initialLayers(): LayerSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<LayerSettings> | null;
    return saved ? { ...DEFAULT_LAYERS, ...saved, groups: { ...DEFAULT_GROUPS, ...saved.groups } } : DEFAULT_LAYERS;
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

function MapPicker({
  maps,
  value,
  onChange,
}: {
  maps: MapCatalog["maps"];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, maps.findIndex((map) => map.id === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = maps[selectedIndex];

  const choose = (index: number) => {
    const map = maps[index];
    if (!map) return;
    onChange(map.id);
    setOpen(false);
  };

  return (
    <div className="maps-picker-control" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        className="maps-picker-trigger"
        type="button"
        role="combobox"
        aria-label="Карта"
        aria-expanded={open}
        aria-controls="maps-picker-options"
        onClick={() => setOpen((valueOpen) => {
          if (!valueOpen) setActiveIndex(selectedIndex);
          return !valueOpen;
        })}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          if (event.key === "ArrowDown") setActiveIndex((index) => (index + 1) % maps.length);
          else if (event.key === "ArrowUp") setActiveIndex((index) => (index - 1 + maps.length) % maps.length);
          else choose(activeIndex);
        }}
      >
        <strong>{selected?.name ?? "Загрузка карт…"}</strong><span className="maps-picker-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="maps-picker-options" id="maps-picker-options" role="listbox">
          {maps.map((map, index) => (
            <button
              type="button"
              role="option"
              aria-selected={map.id === value}
              className={index === activeIndex ? "is-active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              key={map.id}
            >
              <strong>{map.name}</strong>
              <code>{map.kind === "ship" ? "Корабль" : "Планета"}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LayerGroupControl({
  label,
  detail,
  checked,
  count,
  groups,
  groupCounts,
  settings,
  onParentChange,
  onGroupChange,
  initiallyOpen = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  count: number;
  groups: { key: OverlayGroup; label: string }[];
  groupCounts: Partial<Record<OverlayGroup, number>>;
  settings: Record<OverlayGroup, boolean>;
  onParentChange: () => void;
  onGroupChange: (group: OverlayGroup) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details className="maps-layer-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="maps-layer maps-layer--group">
        <input
          type="checkbox"
          checked={checked}
          onClick={(event) => event.stopPropagation()}
          onChange={onParentChange}
          aria-label={`Показывать: ${label}`}
        />
        <span title={detail}><strong>{label}</strong></span>
        <output>{count}</output>
        <i className="maps-layer-chevron" aria-hidden="true" />
      </summary>
      <div className={checked ? "maps-layer-subgroups" : "maps-layer-subgroups is-disabled"}>
        {groups.map((group) => (
          <label className="maps-layer-subgroup" key={group.key}>
            <input
              type="checkbox"
              checked={settings[group.key]}
              disabled={!checked}
              onChange={() => onGroupChange(group.key)}
            />
            <span>{group.label}</span>
            <output>{groupCounts[group.key] ?? 0}</output>
          </label>
        ))}
      </div>
    </details>
  );
}

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canvasRef = useRef<MapCanvasHandle>(null);
  const [catalog, setCatalog] = useState<MapCatalog>();
  const [manifestResult, setManifestResult] = useState<{ url: string; value: TileManifest }>();
  const [overlayResult, setOverlayResult] = useState<{ url: string; value: MapOverlay }>();
  const [insertManifests, setInsertManifests] = useState<Record<string, TileManifest>>({});
  const [activeInserts, setActiveInserts] = useState<Record<string, string>>({});
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
  const requestedXValue = searchParams.get("x");
  const requestedYValue = searchParams.get("y");
  const requestedZoomValue = searchParams.get("zoom");
  const requestedX = requestedXValue === null ? Number.NaN : Number(requestedXValue);
  const requestedY = requestedYValue === null ? Number.NaN : Number(requestedYValue);
  const requestedZoom = requestedZoomValue === null ? Number.NaN : Number(requestedZoomValue);
  const sharedView = useMemo(() => (
    Number.isFinite(requestedX) && Number.isFinite(requestedY)
      ? {
          world: { x: requestedX + 0.5, y: requestedY + 0.5 },
          scale: Number.isFinite(requestedZoom) ? Math.min(8, Math.max(0.25, requestedZoom)) : 2.5,
          key: `${requestedMap}:${requestedX}:${requestedY}:${requestedZoom}`,
        }
      : undefined
  ), [requestedMap, requestedX, requestedY, requestedZoom]);

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

  const allPoints = useMemo(
    () => overlay ? flattenOverlay(overlay, activeInserts) : [],
    [activeInserts, overlay],
  );
  const points = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return allPoints;
    return allPoints.filter((point) => `${pointDisplayName(point)} ${point.name} ${point.prototypeId}`.toLocaleLowerCase("ru").includes(query));
  }, [allPoints, search]);
  const pointCounts = useMemo(() => allPoints.reduce<Record<string, number>>((counts, point) => {
    counts[point.category] = (counts[point.category] ?? 0) + 1;
    return counts;
  }, {}), [allPoints]);
  const groupCounts = useMemo(() => allPoints.reduce<Partial<Record<OverlayGroup, number>>>((counts, point) => {
    counts[point.group] = (counts[point.group] ?? 0) + 1;
    return counts;
  }, {}), [allPoints]);
  const selectedOptions = useMemo(() => selected ? spawnOptions(selected) : [], [selected]);
  const insertPlacements = useMemo(
    () => overlay ? activeInsertPlacements(overlay, allPoints, activeInserts) : [],
    [activeInserts, allPoints, overlay],
  );
  const activeInsertRenders = useMemo<ActiveInsertRender[]>(() => insertPlacements.flatMap((placement) => {
    const manifestUrlValue = mapDataUrl(placement.tiles);
    const insertManifest = insertManifests[manifestUrlValue];
    return insertManifest ? [{ ...placement, manifest: insertManifest, manifestUrl: manifestUrlValue }] : [];
  }), [insertManifests, insertPlacements]);
  const hoveredArea = useMemo(
    () => areaAt(overlay, coordinate, insertPlacements),
    [coordinate, insertPlacements, overlay],
  );
  const selectedInsertVariants = useMemo(
    () => selected?.category === "insert" ? insertVariations(selected) : [],
    [selected],
  );
  const selectedProbabilityDescriptions = useMemo(
    () => selected ? pointProbabilityDescriptions(selected, allPoints) : [],
    [allPoints, selected],
  );

  useEffect(() => {
    const missing = insertPlacements
      .map((placement) => mapDataUrl(placement.tiles))
      .filter((url) => !insertManifests[url]);
    if (missing.length === 0) return;
    const controller = new AbortController();
    Promise.all(missing.map(async (url) => [url, await loadTileManifest(url, controller.signal)] as const))
      .then((loaded) => setInsertManifests((current) => ({ ...current, ...Object.fromEntries(loaded) })))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить рендер инсерта.");
        }
      });
    return () => controller.abort();
  }, [insertManifests, insertPlacements]);

  const toggleLayer = (key: OverlayCategory) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const toggleGroup = (key: OverlayGroup) => setLayers((current) => ({
    ...current,
    groups: { ...current.groups, [key]: !current.groups[key] },
  }));
  const toggleMisc = () => setLayers((current) => {
    const enabled = current.marker || current.spawn;
    return { ...current, marker: !enabled, spawn: !enabled };
  });
  const onStats = useCallback((value: CanvasStats) => setStats(value), []);
  const onCoordinate = useCallback((value?: Point, anchor?: SelectionAnchor) => {
    setCoordinate(value);
    setCoordinateAnchor(anchor);
  }, []);
  const onSelect = useCallback((value?: OverlayPoint) => setSelected(value), []);
  const onSelectedAnchor = useCallback((value?: SelectionAnchor) => setSelectionAnchor(value), []);
  const onShareTile = useCallback((value: Point, zoom: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("map", entry?.id ?? requestedMap ?? "");
    next.set("x", String(Math.floor(value.x)));
    next.set("y", String(Math.floor(value.y)));
    next.set("zoom", zoom.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    setSearchParams(next);
  }, [entry?.id, requestedMap, searchParams, setSearchParams]);

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
          {catalog && (
            <MapPicker
              maps={catalog.maps}
              value={entry?.id ?? ""}
              onChange={(mapId) => {
              setSelected(undefined);
              setActiveInserts({});
              setInsertManifests({});
              setCoordinate(undefined);
              setCoordinateAnchor(undefined);
              setError(undefined);
                setSearchParams({ map: mapId });
              }}
            />
          )}
          {entry && <span className={`map-kind map-kind--${entry.kind}`}>{entry.kind === "ship" ? "корабль" : "планета"}</span>}
        </div>
        <div className="maps-toolbar-actions" aria-label="Управление масштабом">
          <button type="button" onClick={() => canvasRef.current?.zoomBy(0.8)} aria-label="Уменьшить">−</button>
          <button type="button" onClick={() => canvasRef.current?.reset()}>Сбросить</button>
          <button type="button" onClick={() => canvasRef.current?.zoomBy(1.25)} aria-label="Увеличить">+</button>
        </div>
        <div className="maps-network" title="Обзор карты остаётся видимым, детальные тайлы подгружаются поверх">
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
              insertRenders={activeInsertRenders}
              layers={layers}
              initialFocus={sharedView}
              selectedKey={selected?.key}
              onSelect={onSelect}
              onSelectedAnchor={onSelectedAnchor}
              onCoordinate={onCoordinate}
              onShareTile={onShareTile}
              onStats={onStats}
            />
          ) : (
            <div className="maps-loading"><span className="maps-loader" />{error ? "Карта недоступна" : "Загрузка манифеста карты…"}</div>
          )}

          <nav className="maps-mode-dock" aria-label="Режим работы карты">
            <button className="is-active" type="button" aria-current="page" aria-label="Просмотр карты" data-tooltip="Просмотр карты">⌖</button>
            <button type="button" disabled aria-label="Редактор разметки" data-tooltip="Редактор разметки">✎</button>
            <button type="button" disabled aria-label="Расчёт зон огня" data-tooltip="Расчёт зон огня">◎</button>
          </nav>

          {!coordinatesReady && manifest && (
            <div className="maps-data-warning" role="status">
              Координаты слоёв ожидают обновления данных карт. Сам рендер доступен, маркеры временно скрыты.
            </div>
          )}
          {error && <div className="maps-error" role="alert"><strong>Ошибка данных</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Повторить</button></div>}
          <div className="maps-coordinate">{formatCoordinate(coordinate)}</div>
          {search && <div className="maps-result-count">Найдено: {points.length}</div>}

          {layers.areaSupport && coordinate && coordinateAnchor && hoveredArea && (
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
                {AREA_SUPPORT_COLUMNS.map((column, columnIndex) => (
                  <div className="maps-support-column" key={columnIndex}>
                    {column.map((support) => {
                      const allowed = Boolean(hoveredArea.supportMask & (1 << support.bit));
                      return (
                        <span className={allowed ? "is-allowed" : "is-blocked"} key={support.bit}>
                          <i aria-hidden="true">{allowed ? "✓" : "—"}</i>{support.label}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {selected && selectionAnchor && (
            <section
              className={`maps-inspector maps-inspector--${selectionAnchor.align} maps-inspector--${selectionAnchor.vertical ?? "below"}`}
              style={{ left: selectionAnchor.x, top: selectionAnchor.y }}
            >
              <button className="maps-inspector-close" type="button" onClick={() => setSelected(undefined)} aria-label="Закрыть информацию">×</button>
              <div className={`maps-point-badge maps-point-badge--${selected.category}`}>{CATEGORY_LABELS[selected.category]}</div>
              <h2>{pointDisplayName(selected)}</h2>
              <code>{selected.prototypeId}</code>
              <p>X {selected.x.toFixed(1)} · Y {selected.y.toFixed(1)}</p>
              {selected.probability !== undefined && <p>Вероятность инсерта: {Math.round(selected.probability * 100)}%</p>}
              {selected.insertPath && <p className="maps-path">Вариант: {selected.insertPath}</p>}
              {selectedProbabilityDescriptions.map((description) => <p key={description}>{description}</p>)}
              {describeComponents(selected).map((description) => <p key={description}>{description}</p>)}
              {selectedInsertVariants.length > 0 && (
                <section className="maps-insert-switcher">
                  <strong>Рендер инсерта</strong>
                  <p>Можно подменить этот участок карты выбранным игровым вариантом.</p>
                  <button
                    type="button"
                    className={!activeInserts[selected.key] ? "is-active" : ""}
                    onClick={() => setActiveInserts((current) => {
                      const next = { ...current };
                      delete next[selected.key];
                      return next;
                    })}
                  >
                    <span>Обычная карта</span><output>База</output>
                  </button>
                  {selectedInsertVariants.map((variation, index) => {
                    const available = Boolean(overlay?.insertMaps[variation.path]?.tiles);
                    return (
                      <button
                        type="button"
                        className={activeInserts[selected.key] === variation.path ? "is-active" : ""}
                        disabled={!available}
                        onClick={() => setActiveInserts((current) => ({ ...current, [selected.key]: variation.path }))}
                        key={`${variation.path}:${index}`}
                      >
                        <span>{variation.path.split("/").at(-1)?.replace(/\.yml$/i, "") ?? `Вариант ${index + 1}`}</span>
                        <output>{Math.round(variation.probability * 100)}%</output>
                      </button>
                    );
                  })}
                  {selectedInsertVariants.some((variation) => !overlay?.insertMaps[variation.path]?.tiles) && (
                    <small>Рендеры появятся после обновления данных карт.</small>
                  )}
                </section>
              )}
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
          </div>

          <label className="maps-search">
            <span>Поиск точки</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="лут, эвакуация…" />
          </label>

          <section className="maps-layer-list" aria-label="Слои данных">
            <LayerGroupControl
              label="Лут маркеры"
              detail="случайный лут, разведданные и снабжение"
              checked={layers.loot}
              count={pointCounts.loot ?? 0}
              groups={LOOT_GROUPS}
              groupCounts={groupCounts}
              settings={layers.groups}
              onParentChange={() => toggleLayer("loot")}
              onGroupChange={toggleGroup}
              initiallyOpen
            />
            <LayerGroupControl
              label="Прочие маркеры"
              detail="точки появления и технические маркеры карты"
              checked={layers.marker || layers.spawn}
              count={(pointCounts.marker ?? 0) + (pointCounts.spawn ?? 0)}
              groups={MISC_GROUPS}
              groupCounts={groupCounts}
              settings={layers.groups}
              onParentChange={toggleMisc}
              onGroupChange={toggleGroup}
            />
            <label className="maps-layer">
              <input type="checkbox" checked={layers.insert} onChange={() => toggleLayer("insert")} />
              <span title="вариативные части карты"><strong>Инсерты</strong></span>
              {overlay && <output>{pointCounts.insert ?? 0}</output>}
            </label>
            <label className="maps-layer">
              <input type="checkbox" checked={layers.label} onChange={() => toggleLayer("label")} />
              <span title="именованные точки и переходы"><strong>Надписи</strong></span>
              {overlay && <output>{pointCounts.label ?? 0}</output>}
            </label>
            <label className="maps-layer">
              <input type="checkbox" checked={layers.areaSupport} onChange={() => setLayers((value) => ({ ...value, areaSupport: !value.areaSupport }))} />
              <span title="разрешения поддержки под курсором"><strong>Поддержка тайлов</strong></span>
            </label>
            <label className="maps-layer">
              <input type="checkbox" checked={layers.coordinateGrid} onChange={() => setLayers((value) => ({ ...value, coordinateGrid: !value.coordinateGrid }))} />
              <span title="шаг 10 игровых метров"><strong>Сетка координат</strong></span>
            </label>
          </section>

          <label className="maps-marker-size">
            <span>Размер маркеров <output>{layers.markerScale.toFixed(1)}×</output></span>
            <input type="range" min="0.6" max="1.8" step="0.1" value={layers.markerScale} onChange={(event) => setLayers((value) => ({ ...value, markerScale: Number(event.target.value) }))} />
          </label>

          <p className="maps-sidebar-hint">
            <span>Колесо или два пальца — масштаб</span>
            <span>Перетаскивание — обзор</span>
            <span>Клик — данные точки</span>
          </p>
        </aside>
      </div>
    </main>
  );
}
