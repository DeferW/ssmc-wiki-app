import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toggleZone, type PlacedZone } from "../fireZones";
import type { DrawingHandlers, PlanLayer } from "../MapCanvas";
import type { Point } from "../types";
import type { DecodedPlan } from "./codec";
import {
  appendStrokePoint, clampWidth, cleanLabel, hitsElement, snapLine, toUnits, translateElement, UNITS_PER_TILE,
  type PlanElement,
} from "./model";
import { EMPTY_PLAN, planReducer, type PlanAction, type PlanState } from "./state";
import { loadDraft, saveDraft } from "./storage";

export type PlannerTool = "pan" | "select" | "brush" | "line" | "arrow" | "area" | "label" | "stamp" | "zone" | "eraser";

/** Label being typed; `at` is in plan units. */
export type LabelEditor = { at: Point; index?: number; text: string };

type Gesture =
  | { tool: "brush"; points: Point[] }
  | { tool: "line" | "arrow" | "area"; start: Point; end: Point }
  | { tool: "select"; index: number; start: Point; delta: Point }
  | { tool: "eraser"; hidden: Set<number>; zoneTiles: Point[] }
  | { tool: "tap" };

type Options = {
  mapId: string;
  active: boolean;
  zones: PlacedZone[];
  onZonesChange: (update: (zones: PlacedZone[]) => PlacedZone[]) => void;
};

function draftState(mapId: string): PlanState {
  return { ...EMPTY_PLAN, elements: mapId ? loadDraft(mapId)?.elements ?? [] : [] };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Top element under the point (plan units) that is not already hidden by the current gesture. */
function hitIndex(elements: PlanElement[], point: Point, skip?: Set<number>, kind?: PlanElement["kind"]): number {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    if (skip?.has(index) || (kind && elements[index].kind !== kind)) continue;
    if (hitsElement(elements[index], point)) return index;
  }
  return -1;
}

/** Zones stay on whole game tiles. */
function tileOf(world: Point): Point {
  return { x: Math.floor(world.x), y: Math.floor(world.y) };
}

function hasZoneAt(zones: PlacedZone[], tile: Point): boolean {
  return zones.some((zone) => zone.tile.x === tile.x && zone.tile.y === tile.y);
}

export function usePlanner({ mapId, active, zones, onZonesChange }: Options) {
  // The plan is scoped to the map: switching maps loads that map's draft instead.
  const [store, setStore] = useState<{ scope: string; plan: PlanState }>({ scope: "", plan: EMPTY_PLAN });
  const fallback = useMemo(() => draftState(mapId), [mapId]);
  const plan = store.scope === mapId ? store.plan : fallback;
  const dispatch = useCallback((action: PlanAction) => {
    setStore((current) => ({
      scope: mapId,
      plan: planReducer(current.scope === mapId ? current.plan : draftState(mapId), action),
    }));
  }, [mapId]);

  const [tool, setToolState] = useState<PlannerTool>("brush");
  const [color, setColorState] = useState(1);
  const [width, setWidthState] = useState(3);
  const [filled, setFilled] = useState(true);
  const [snapAngles, setSnapAngles] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [zoneTemplateId, setZoneTemplateId] = useState<string>();
  const [selection, setSelection] = useState<{ scope: string; index: number }>();
  const [labelEditor, setLabelEditor] = useState<LabelEditor>();
  const [gesture, setGesture] = useState<Gesture>();
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const updateGesture = (next: Gesture | undefined) => {
    gestureRef.current = next;
    setGesture(next);
  };

  const selected = selection?.scope === mapId && plan.elements[selection.index] ? selection.index : undefined;
  const select = useCallback((index?: number) => setSelection(index === undefined ? undefined : { scope: mapId, index }), [mapId]);

  const setTool = useCallback((next: PlannerTool) => {
    setToolState(next);
    setLabelEditor(undefined);
    if (next !== "select") setSelection(undefined);
  }, []);

  // Changing colour or width while something is selected restyles it.
  const restyle = useCallback((change: { color?: number; width?: number }) => {
    if (selected === undefined) return;
    const element = plan.elements[selected];
    const next = { ...element, ...(change.color !== undefined ? { color: change.color } : {}) } as PlanElement;
    if (change.width !== undefined && (next.kind === "stroke" || next.kind === "arrow")) next.width = change.width;
    dispatch({ type: "replace", index: selected, element: next });
  }, [dispatch, plan.elements, selected]);
  const setColor = useCallback((value: number) => { setColorState(value); restyle({ color: value }); }, [restyle]);
  const setWidth = useCallback((value: number) => { const next = clampWidth(value); setWidthState(next); restyle({ width: next }); }, [restyle]);

  useEffect(() => {
    if (!mapId) return;
    const timer = window.setTimeout(() => saveDraft({ mapId, elements: plan.elements, zones: [] }), 300);
    return () => window.clearTimeout(timer);
  }, [mapId, plan.elements]);

  const removeSelected = useCallback(() => {
    if (selected === undefined) return;
    dispatch({ type: "remove", index: selected });
    setSelection(undefined);
  }, [dispatch, selected]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "я")) {
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if ((event.ctrlKey || event.metaKey) && (key === "y" || key === "н")) {
        dispatch({ type: "redo" });
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected !== undefined) {
        removeSelected();
      } else if (event.key === "Escape" && (selected !== undefined || labelEditor)) {
        setSelection(undefined);
        setLabelEditor(undefined);
      } else {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, dispatch, labelEditor, removeSelected, selected]);

  // Lines are free by default; the 8-direction snap of the game is an option, Shift toggles it.
  const lineEnd = useCallback((start: Point, point: Point, shift: boolean) => (
    snapAngles !== shift ? snapLine(start, point) : point
  ), [snapAngles]);

  const tap = useCallback((world: Point) => {
    const point = toUnits(world);
    if (tool === "label") {
      const index = hitIndex(plan.elements, point, undefined, "label");
      const existing = index >= 0 ? plan.elements[index] : undefined;
      setLabelEditor(existing?.kind === "label"
        ? { at: existing.at, index, text: existing.text }
        : { at: point, text: "" });
    } else if (tool === "stamp") {
      // Tapping a stamp of the same kind removes it, like placing the same zone twice.
      const index = hitIndex(plan.elements, point, undefined, "stamp");
      const existing = index >= 0 ? plan.elements[index] : undefined;
      dispatch(existing?.kind === "stamp" && existing.stamp === stamp
        ? { type: "remove", index }
        : { type: "add", element: { kind: "stamp", color, stamp, at: point } });
    } else if (tool === "zone" && zoneTemplateId) {
      onZonesChange((current) => toggleZone(current, zoneTemplateId, tileOf(world)));
    }
  }, [color, dispatch, onZonesChange, plan.elements, stamp, tool, zoneTemplateId]);

  const drawing = useMemo<DrawingHandlers | undefined>(() => {
    if (!active || tool === "pan") return undefined;
    return {
      onStart: (world, { shift }) => {
        const point = toUnits(world);
        setLabelEditor(undefined);
        if (tool === "brush") updateGesture({ tool, points: [point] });
        else if (tool === "line" || tool === "arrow" || tool === "area") updateGesture({ tool, start: point, end: tool === "area" ? point : lineEnd(point, point, shift) });
        else if (tool === "select") {
          const index = hitIndex(plan.elements, point);
          select(index >= 0 ? index : undefined);
          updateGesture(index >= 0 ? { tool, index, start: point, delta: { x: 0, y: 0 } } : undefined);
        } else if (tool === "eraser") {
          const hidden = new Set<number>();
          const index = hitIndex(plan.elements, point, hidden);
          if (index >= 0) hidden.add(index);
          const tile = tileOf(world);
          updateGesture({ tool, hidden, zoneTiles: index < 0 && hasZoneAt(zones, tile) ? [tile] : [] });
        } else updateGesture({ tool: "tap" });
      },
      onMove: (world, { shift }) => {
        const current = gestureRef.current;
        if (!current) return;
        const point = toUnits(world);
        if (current.tool === "brush") {
          const points = appendStrokePoint(current.points, point);
          if (points !== current.points) updateGesture({ ...current, points });
        } else if (current.tool === "line" || current.tool === "arrow") {
          updateGesture({ ...current, end: lineEnd(current.start, point, shift) });
        } else if (current.tool === "area") {
          updateGesture({ ...current, end: point });
        } else if (current.tool === "select") {
          updateGesture({ ...current, delta: { x: point.x - current.start.x, y: point.y - current.start.y } });
        } else if (current.tool === "eraser") {
          const index = hitIndex(plan.elements, point, current.hidden);
          const tile = tileOf(world);
          if (index >= 0) updateGesture({ ...current, hidden: new Set([...current.hidden, index]) });
          else if (hasZoneAt(zones, tile) && !current.zoneTiles.some((zoneTile) => zoneTile.x === tile.x && zoneTile.y === tile.y)) {
            updateGesture({ ...current, zoneTiles: [...current.zoneTiles, tile] });
          }
        }
      },
      onEnd: (world) => {
        const current = gestureRef.current;
        updateGesture(undefined);
        if (!current) return;
        if (current.tool === "brush") {
          dispatch({ type: "add", element: { kind: "stroke", color, width, points: current.points } });
        } else if (current.tool === "line" || current.tool === "arrow") {
          // A click without dragging is not a line.
          if (Math.hypot(current.end.x - current.start.x, current.end.y - current.start.y) < UNITS_PER_TILE / 2) return;
          dispatch({ type: "add", element: current.tool === "arrow"
            ? { kind: "arrow", color, width, points: [current.start, current.end] }
            : { kind: "stroke", color, width, points: [current.start, current.end] } });
        } else if (current.tool === "area") {
          if (Math.abs(current.end.x - current.start.x) < UNITS_PER_TILE / 2 || Math.abs(current.end.y - current.start.y) < UNITS_PER_TILE / 2) return;
          dispatch({ type: "add", element: { kind: "area", color, filled, from: current.start, to: current.end } });
        } else if (current.tool === "select") {
          dispatch({ type: "move", index: current.index, dx: current.delta.x, dy: current.delta.y });
        } else if (current.tool === "eraser") {
          if (current.hidden.size) dispatch({ type: "set", elements: plan.elements.filter((_, index) => !current.hidden.has(index)) });
          if (current.zoneTiles.length) {
            onZonesChange((list) => list.filter((zone) => !current.zoneTiles.some((zoneTile) => zoneTile.x === zone.tile.x && zoneTile.y === zone.tile.y)));
          }
          setSelection(undefined);
        } else {
          tap(world);
        }
      },
      onCancel: () => updateGesture(undefined),
    };
  }, [active, color, dispatch, filled, lineEnd, onZonesChange, plan.elements, select, tap, tool, width, zones]);

  const layer = useMemo<PlanLayer>(() => {
    const result: PlanLayer = { elements: plan.elements, selected };
    if (!gesture) return result;
    if (gesture.tool === "brush") result.preview = { kind: "stroke", color, width, points: gesture.points };
    else if (gesture.tool === "line") result.preview = { kind: "stroke", color, width, points: [gesture.start, gesture.end] };
    else if (gesture.tool === "arrow") result.preview = { kind: "arrow", color, width, points: [gesture.start, gesture.end] };
    else if (gesture.tool === "area") result.preview = { kind: "area", color, filled, from: gesture.start, to: gesture.end };
    else if (gesture.tool === "select" && (gesture.delta.x || gesture.delta.y)) {
      result.hidden = new Set([gesture.index]);
      result.preview = translateElement(plan.elements[gesture.index], gesture.delta.x, gesture.delta.y);
    } else if (gesture.tool === "eraser") result.hidden = gesture.hidden;
    return result;
  }, [color, filled, gesture, plan.elements, selected, width]);

  const commitLabel = useCallback(() => {
    if (!labelEditor) return;
    const text = cleanLabel(labelEditor.text);
    if (labelEditor.index !== undefined) {
      const element = plan.elements[labelEditor.index];
      if (element?.kind === "label") {
        dispatch(text ? { type: "replace", index: labelEditor.index, element: { ...element, text } } : { type: "remove", index: labelEditor.index });
      }
    } else if (text) {
      dispatch({ type: "add", element: { kind: "label", color, at: labelEditor.at, text } });
    }
    setLabelEditor(undefined);
  }, [color, dispatch, labelEditor, plan.elements]);

  const removeLabel = useCallback(() => {
    if (labelEditor?.index !== undefined) dispatch({ type: "remove", index: labelEditor.index });
    setLabelEditor(undefined);
  }, [dispatch, labelEditor]);

  const loadPlan = useCallback((decoded: DecodedPlan, mode: "replace" | "merge") => {
    dispatch({ type: "set", elements: mode === "replace" ? decoded.elements : [...plan.elements, ...decoded.elements] });
    onZonesChange((current) => {
      let next = mode === "replace" ? [] : current;
      for (const zone of decoded.zones) {
        const exists = next.some((item) => item.templateId === zone.templateId && item.tile.x === zone.tile.x && item.tile.y === zone.tile.y);
        if (!exists) next = toggleZone(next, zone.templateId, zone.tile);
      }
      return next;
    });
    setSelection(undefined);
    setLabelEditor(undefined);
  }, [dispatch, onZonesChange, plan.elements]);

  return {
    elements: plan.elements,
    canUndo: plan.past.length > 0,
    canRedo: plan.future.length > 0,
    dispatch,
    tool, setTool,
    color, setColor,
    width, setWidth,
    filled, setFilled,
    snapAngles, setSnapAngles,
    stamp, setStamp,
    zoneTemplateId, setZoneTemplateId,
    selected, removeSelected,
    labelEditor, setLabelEditor, commitLabel, removeLabel,
    drawing,
    layer,
    loadPlan,
  };
}

export type Planner = ReturnType<typeof usePlanner>;
