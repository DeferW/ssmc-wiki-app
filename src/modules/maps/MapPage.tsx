import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { REMOTE_DATA_UNAVAILABLE_MESSAGE } from "../../data/remoteJson";
import { modulePath } from "../../routes";
import { loadMapCatalog, loadMapOverlay, loadMapStaticItems, loadTileManifest } from "./api";
import { mapDataUrl } from "./config";
import { MapCanvas, type MapCanvasHandle, type SelectionAnchor } from "./MapCanvas";
import { activeInsertPlacements, areaAt, describeComponents, effectiveInsertProbability, flattenOverlay, flattenStaticItems, insertVariations, pointDisplayName, pointProbabilityDescriptions, restoreInsertSelections, serializeInsertSelections, spawnOptions } from "./overlay";
import type { ActiveInsertRender, CanvasStats, LayerSettings, MapCatalog, MapOverlay, MapStaticItem, MapStaticItemCatalog, OverlayCategory, OverlayGroup, OverlayPoint, Point, TileManifest } from "./types";

const SETTINGS_KEY = "ssmc-map-layers-v4";
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
  item: true,
};
const DEFAULT_LAYERS: LayerSettings = {
  loot: false,
  insert: false,
  label: false,
  spawn: false,
  marker: false,
  item: true,
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
  item: "Предмет",
};

function itemDescription(value: unknown): string {
  if (typeof value === "string") return value.replace(/^\{\s*""\s*\}$/, "").trim();
  return "";
}

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
  const [staticItemCatalog, setStaticItemCatalog] = useState<MapStaticItemCatalog>();
  const [manifestResult, setManifestResult] = useState<{ url: string; value: TileManifest }>();
  const [overlayResult, setOverlayResult] = useState<{ url: string; value: MapOverlay }>();
  const [insertManifests, setInsertManifests] = useState<Record<string, TileManifest>>({});
  const [insertSelection, setInsertSelection] = useState<{ scope: string; value: Record<string, string> }>({ scope: "", value: {} });
  const [layers, setLayers] = useState<LayerSettings>(initialLayers);
  const [search, setSearch] = useState("");
  const [itemPanelOpen, setItemPanelOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemCategories, setItemCategories] = useState<Set<string>>(() => new Set());
  const [activeItemId, setActiveItemId] = useState<string>();
  const [selected, setSelected] = useState<OverlayPoint>();
  const [selectionChoices, setSelectionChoices] = useState<OverlayPoint[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor>();
  const [coordinate, setCoordinate] = useState<Point>();
  const [coordinateAnchor, setCoordinateAnchor] = useState<SelectionAnchor>();
  const [stats, setStats] = useState<CanvasStats>({ loadedTiles: 0, loadedBytes: 0, pendingTiles: 0, zoom: 0 });
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const requestedMap = searchParams.get("map");
  const requestedXValue = searchParams.get("x");
  const requestedYValue = searchParams.get("y");
  const requestedZoomValue = searchParams.get("zoom");
  const requestedInsertKey = searchParams.getAll("insert").join("\0");
  const requestedInsertTokens = useMemo(
    () => requestedInsertKey ? requestedInsertKey.split("\0") : [],
    [requestedInsertKey],
  );
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

  useEffect(() => {
    let active = true;
    loadMapStaticItems()
      .then((value) => { if (active) setStaticItemCatalog(value); })
      .catch(() => { /* Site remains usable while the new dataset is being published. */ });
    return () => { active = false; };
  }, []);

  const entry = useMemo(
    () => catalog?.maps.find((map) => map.id === requestedMap) ?? catalog?.maps[0],
    [catalog, requestedMap],
  );
  const manifestUrl = entry ? mapDataUrl(entry.tiles) : "";
  const overlayUrl = entry ? mapDataUrl(entry.overlay) : "";
  const manifest = manifestResult?.url === manifestUrl ? manifestResult.value : undefined;
  const overlay = overlayResult?.url === overlayUrl ? overlayResult.value : undefined;
  const insertSelectionScope = `${overlayUrl}\0${requestedInsertTokens.join("\0")}`;
  const urlActiveInserts = useMemo(
    () => overlay ? restoreInsertSelections(overlay, requestedInsertTokens) : {},
    [overlay, requestedInsertTokens],
  );
  const activeInserts = insertSelection.scope === insertSelectionScope
    ? insertSelection.value
    : urlActiveInserts;
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
  const overlayPoints = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return allPoints;
    return allPoints.filter((point) => `${pointDisplayName(point)} ${point.name} ${point.prototypeId}`.toLocaleLowerCase("ru").includes(query));
  }, [allPoints, search]);
  const allItemPoints = useMemo(
    () => overlay && staticItemCatalog
      ? flattenStaticItems(overlay, staticItemCatalog, allPoints, activeInserts)
      : [],
    [activeInserts, allPoints, overlay, staticItemCatalog],
  );
  const itemCounts = useMemo(() => allItemPoints.reduce<Record<string, number>>((counts, point) => {
    counts[point.prototypeId] = (counts[point.prototypeId] ?? 0) + 1;
    return counts;
  }, {}), [allItemPoints]);
  const availableItemCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of allItemPoints) {
      const category = point.item?.category ?? "Другое";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([first], [second]) => first.localeCompare(second, "ru"));
  }, [allItemPoints]);
  const availableItems = useMemo(() => {
    if (!staticItemCatalog) return [] as MapStaticItem[];
    return staticItemCatalog.publicCatalog.itemIds
      .filter((id) => itemCounts[id])
      .map((id) => staticItemCatalog.items[id])
      .sort((first, second) => first.name.localeCompare(second.name, "ru") || first.id.localeCompare(second.id));
  }, [itemCounts, staticItemCatalog]);
  const searchableItems = useMemo(() => {
    const query = itemSearch.trim().toLocaleLowerCase("ru");
    return availableItems.filter((item) => !query || `${item.name} ${item.id} ${item.category}`.toLocaleLowerCase("ru").includes(query));
  }, [availableItems, itemSearch]);
  const itemResults = useMemo(
    () => searchableItems.filter((item) => !itemCategories.size || itemCategories.has(item.category)),
    [itemCategories, searchableItems],
  );
  const highlightedItemIds = useMemo(() => {
    if (activeItemId && itemCounts[activeItemId]) return new Set([activeItemId]);
    if (!itemSearch.trim() && itemCategories.size === 0) return new Set<string>();
    const ids = new Set(itemSearch.trim() ? searchableItems.map((item) => item.id) : []);
    for (const item of availableItems) {
      if (itemCategories.has(item.category)) ids.add(item.id);
    }
    return ids;
  }, [activeItemId, availableItems, itemCategories, itemCounts, itemSearch, searchableItems]);
  const itemPoints = useMemo(
    () => allItemPoints.map((point) => ({ ...point, highlighted: highlightedItemIds.has(point.prototypeId) })),
    [allItemPoints, highlightedItemIds],
  );
  const points = useMemo(() => [...overlayPoints, ...itemPoints], [itemPoints, overlayPoints]);
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
  const toggleItemCategory = (category: string) => {
    setActiveItemId(undefined);
    setItemCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };
  const clearItemFilters = () => {
    setItemSearch("");
    setItemCategories(new Set());
    setActiveItemId(undefined);
  };
  const onStats = useCallback((value: CanvasStats) => setStats(value), []);
  const onCoordinate = useCallback((value?: Point, anchor?: SelectionAnchor) => {
    setCoordinate(value);
    setCoordinateAnchor(anchor);
  }, []);
  const onSelect = useCallback((values: OverlayPoint[]) => {
    if (values.length === 1) {
      setSelected(values[0]);
      setSelectionChoices([]);
      return;
    }
    setSelected(undefined);
    setSelectionChoices(values);
  }, []);
  const onSelectedAnchor = useCallback((value?: SelectionAnchor) => setSelectionAnchor(value), []);
  const onShareTile = useCallback((value: Point, zoom: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("map", entry?.id ?? requestedMap ?? "");
    next.set("x", String(Math.floor(value.x)));
    next.set("y", String(Math.floor(value.y)));
    next.set("zoom", zoom.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    next.delete("insert");
    for (const token of serializeInsertSelections(allPoints, activeInserts)) {
      next.append("insert", token);
    }
    setSearchParams(next);
  }, [activeInserts, allPoints, entry?.id, requestedMap, searchParams, setSearchParams]);
  const setInsertAtSelectedTile = (path?: string) => {
    if (!selected) return;
    setInsertSelection(() => {
      const current = activeInserts;
      const next = { ...current };
      for (const point of allPoints) {
        if (
          point.category === "insert"
          && Math.floor(point.x) === Math.floor(selected.x)
          && Math.floor(point.y) === Math.floor(selected.y)
        ) {
          delete next[point.key];
        }
      }
      if (path) next[selected.key] = path;
      return { scope: insertSelectionScope, value: next };
    });
  };

  return (
    <main className="maps-page">
      <header className="maps-toolbar">
        <div className="maps-panel-toggles">
          <button
            className={sidebarOpen ? "maps-sidebar-toggle is-active" : "maps-sidebar-toggle"}
            type="button"
            aria-label="Слои карты"
            aria-expanded={sidebarOpen}
            aria-controls="map-layers"
            onClick={() => {
              setItemPanelOpen(false);
              setSidebarOpen((value) => !value);
            }}
            title="Слои карты"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4" /></svg>
          </button>
          <button
            className={itemPanelOpen ? "maps-sidebar-toggle is-active" : "maps-sidebar-toggle"}
            type="button"
            aria-label="Предметы на карте"
            aria-expanded={itemPanelOpen}
            aria-controls="map-items"
            onClick={() => {
              setSidebarOpen(false);
              setItemPanelOpen((value) => !value);
            }}
            title="Предметы на карте"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5V8Zm3 0V5h8v3M9 12h6M12 10v4" /></svg>
          </button>
        </div>
        <div className="maps-map-picker">
          {catalog && (
            <MapPicker
              maps={catalog.maps}
              value={entry?.id ?? ""}
              onChange={(mapId) => {
              setSelected(undefined);
              setSelectionChoices([]);
              setActiveItemId(undefined);
              setInsertSelection({ scope: "", value: {} });
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
              anchorKey={selected?.key ?? selectionChoices[0]?.key}
              onSelect={onSelect}
              onSelectedAnchor={onSelectedAnchor}
              onCoordinate={onCoordinate}
              onShareTile={onShareTile}
              onStats={onStats}
            />
          ) : (
            <div className="maps-loading"><span className="maps-loader" />{error ? "Карта недоступна" : "Загрузка манифеста карты…"}</div>
          )}

          <div className="maps-corner-tools">
            <div className="maps-coordinate">{formatCoordinate(coordinate)}</div>
            <nav className="maps-mode-dock" aria-label="Режим работы карты">
              <button className="is-active" type="button" aria-current="page">
                <span aria-hidden="true">⌖</span><strong>Просмотр карты</strong>
              </button>
              <button type="button" disabled>
                <span aria-hidden="true">✎</span><strong>Редактор</strong>
              </button>
              <button type="button" disabled>
                <span aria-hidden="true">◎</span><strong>Зоны огня</strong>
              </button>
            </nav>
          </div>

          {!coordinatesReady && manifest && (
            <div className="maps-data-warning" role="status">
              Координаты слоёв ожидают обновления данных карт. Сам рендер доступен, маркеры временно скрыты.
            </div>
          )}
          {error && (
            <div className="maps-error" role="alert">
              <strong>{error === REMOTE_DATA_UNAVAILABLE_MESSAGE ? "GitHub не отвечает" : "Ошибка данных"}</strong>
              <span>{error}</span>
              <button type="button" onClick={() => window.location.reload()}>Повторить</button>
            </div>
          )}
          {(search || highlightedItemIds.size > 0) && (
            <div className="maps-result-count">
              {search ? `Маркеров: ${overlayPoints.length}` : ""}
              {search && highlightedItemIds.size > 0 ? " · " : ""}
              {highlightedItemIds.size > 0 ? `Предметов: ${itemPoints.filter((point) => point.highlighted).length}` : ""}
            </div>
          )}

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

          {selectionChoices.length > 1 && selectionAnchor && (
            <section
              className={`maps-inspector maps-marker-picker maps-inspector--${selectionAnchor.align} maps-inspector--${selectionAnchor.vertical ?? "below"}`}
              style={{ left: selectionAnchor.x, top: selectionAnchor.y }}
            >
              <button className="maps-inspector-close" type="button" onClick={() => setSelectionChoices([])} aria-label="Закрыть выбор">×</button>
              <div className="maps-point-badge">Один тайл</div>
              <h2>Выберите объект</h2>
              <p>Объектов в этой точке: {selectionChoices.length}.</p>
              <div className="maps-marker-picker-list">
                {selectionChoices.map((point) => (
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(point);
                      setSelectionChoices([]);
                    }}
                    key={point.key}
                  >
                    <span className={`maps-marker-picker-dot maps-marker-picker-dot--${point.category}`} aria-hidden="true" />
                    <span><strong>{pointDisplayName(point)}</strong><code>{point.prototypeId}</code></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {selected && (selected.category === "insert" || selectionAnchor) && (
            <section
              className={selected.category === "insert"
                ? "maps-inspector maps-inspector--insert"
                : `maps-inspector maps-inspector--${selectionAnchor!.align} maps-inspector--${selectionAnchor!.vertical ?? "below"}`}
              style={selected.category === "insert" ? undefined : { left: selectionAnchor!.x, top: selectionAnchor!.y }}
            >
              <button className="maps-inspector-close" type="button" onClick={() => setSelected(undefined)} aria-label="Закрыть информацию">×</button>
              <div className={`maps-point-badge maps-point-badge--${selected.category}`}>{CATEGORY_LABELS[selected.category]}</div>
              <h2>{pointDisplayName(selected)}</h2>
              <code>{selected.prototypeId}</code>
              <p>X {selected.x.toFixed(1)} · Y {selected.y.toFixed(1)}</p>
              {selected.category === "item" && selected.item && (
                <>
                  <div className="maps-item-inspector-summary">
                    {selected.item.image && (
                      <img
                        className="maps-item-inspector-sprite"
                        src={mapDataUrl(selected.item.image)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {itemDescription(selected.item.description) && (
                      <p>{itemDescription(selected.item.description)}</p>
                    )}
                  </div>
                  <Link
                    className="maps-catalog-link"
                    to={`${modulePath("equipment")}?item=${encodeURIComponent(selected.prototypeId)}`}
                    title="Открыть карточку предмета в каталоге"
                  >
                    <span>Открыть в каталоге</span><strong aria-hidden="true">→</strong>
                  </Link>
                </>
              )}
              {selected.probability !== undefined && entry && (
                <p>Вероятность инсерта: {Math.round(effectiveInsertProbability(selected.probability, selected.nightmareScenario, entry) * 100)}%</p>
              )}
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
                    onClick={() => setInsertAtSelectedTile()}
                  >
                    <span>Обычная карта</span><output>База</output>
                  </button>
                  {selectedInsertVariants.map((variation, index) => {
                    const available = Boolean(overlay?.insertMaps[variation.path]?.tiles);
                    const probability = entry
                      ? effectiveInsertProbability(variation.probability, variation.nightmareScenario, entry)
                      : variation.probability;
                    return (
                      <button
                        type="button"
                        className={activeInserts[selected.key] === variation.path ? "is-active" : ""}
                        disabled={!available}
                        onClick={() => setInsertAtSelectedTile(variation.path)}
                        key={`${variation.path}:${index}`}
                      >
                        <span>{variation.path.split("/").at(-1)?.replace(/\.yml$/i, "") ?? `Вариант ${index + 1}`}</span>
                        <output title={probability === 0 && variation.nightmareScenario ? "Сценарий отключён в текущем пуле карты" : undefined}>
                          {Math.round(probability * 100)}%{probability === 0 && variation.nightmareScenario ? " · отключён" : ""}
                        </output>
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

        <aside id="map-items" className={itemPanelOpen ? "maps-items-panel is-open" : "maps-items-panel"}>
          <div className="maps-items-heading">
            <div><span className="eyebrow">Поиск на карте</span><h1>Предметы</h1></div>
            <button type="button" onClick={() => setItemPanelOpen(false)} aria-label="Закрыть поиск предметов">×</button>
          </div>
          <label className="maps-search maps-item-search">
            <span>Название, ID или категория</span>
            <input
              value={itemSearch}
              onChange={(event) => {
                setItemSearch(event.target.value);
                setActiveItemId(undefined);
              }}
              placeholder="M41A, медицина, броня…"
            />
          </label>
          <div className="maps-items-summary">
            <span>{activeItemId ? "Выбран один тип" : `В списке: ${itemResults.length}`}</span>
            {(itemSearch || itemCategories.size > 0 || activeItemId) && (
              <button type="button" onClick={clearItemFilters}>Сбросить</button>
            )}
          </div>
          <div className="maps-item-sections">
            {availableItemCategories.map(([category, count]) => {
              const categoryItems = searchableItems.filter((item) => item.category === category);
              if (!categoryItems.length) return null;
              return (
                <details className="maps-item-section" open={itemSearch.trim() ? true : undefined} key={category}>
                  <summary>
                    <input
                      type="checkbox"
                      checked={itemCategories.has(category)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleItemCategory(category)}
                      aria-label={`Выбрать категорию: ${category}`}
                    />
                    <strong>{category}</strong><output>{count}</output><i className="maps-layer-chevron" aria-hidden="true" />
                  </summary>
                  <div className="maps-item-results">
                    {categoryItems.map((item) => (
                      <button
                        className={activeItemId === item.id ? "is-active" : ""}
                        type="button"
                        onClick={() => {
                          setItemCategories(new Set());
                          setActiveItemId((current) => current === item.id ? undefined : item.id);
                        }}
                        key={item.id}
                      >
                        <span className="maps-item-result-sprite">
                          {item.image
                            ? <img src={mapDataUrl(item.image)} alt="" loading="lazy" decoding="async" />
                            : <i aria-hidden="true">?</i>}
                        </span>
                        <span><strong>{item.name}</strong><code>{item.id}</code></span>
                        <output>{itemCounts[item.id]}</output>
                      </button>
                    ))}
                  </div>
                </details>
              );
            })}
            {!searchableItems.length && <p>На этой карте совпадений нет.</p>}
          </div>
          <p className="maps-sidebar-hint">
            Поиск подсвечивает совпадения. Без подсветки предмет можно открыть кликом по его спрайту на близком масштабе.
          </p>
        </aside>
      </div>
    </main>
  );
}
