import { describe, expect, it } from "vitest";
import { CODE_PREFIX, PlanCodeError, crc32, decodePayload, decodePlan, encodePayload, encodePlan, type DecodedPlan } from "./codec";
import { appendStrokePoint, cleanLabel, hitsElement, MAX_ELEMENTS, snapLine, toUnits, toWorld, topElementAt, translateElement, type PlanElement } from "./model";
import { inputKinds } from "./PlannerPanel";
import { EMPTY_PLAN, planReducer } from "./state";
import { deleteSavedPlan, loadDraft, loadSavedPlans, saveDraft, storeSavedPlan } from "./storage";

const elements: PlanElement[] = [
  { kind: "stroke", color: 1, width: 3, points: [{ x: -5, y: 10 }, { x: -4, y: 11 }, { x: 20, y: -30 }] },
  { kind: "arrow", color: 2, width: 8, points: [{ x: 0, y: 0 }, { x: 15, y: 0 }] },
  { kind: "area", color: 5, filled: true, from: { x: 3, y: 4 }, to: { x: -2, y: 9 } },
  { kind: "label", color: 7, at: { x: 12, y: -40 }, text: "Оборона LZ1 — держим «мост»" },
  { kind: "stamp", color: 4, stamp: 5, at: { x: 100, y: 200 } },
];
const plan: DecodedPlan = {
  mapId: "lv624",
  elements,
  zones: [{ templateId: "RMCOrbitalCannonWarheadExplosive", tile: { x: 33, y: -43 } }],
};

describe("plan model", () => {
  it("snaps lines to eight directions exactly like the game", () => {
    expect(snapLine({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 });
    expect(snapLine({ x: 0, y: 0 }, { x: 2, y: -9 })).toEqual({ x: 0, y: -9 });
    // Diagonals use the shorter side, as TacticalMapControl.SnapToStraightLine does.
    expect(snapLine({ x: 0, y: 0 }, { x: 7, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(snapLine({ x: 0, y: 0 }, { x: -4, y: 6 })).toEqual({ x: -4, y: 4 });
  });

  it("stores free positions in eighths of a tile", () => {
    expect(toUnits({ x: 12.37, y: -0.06 })).toEqual({ x: 99, y: -0 });
    expect(toWorld({ x: 20, y: -4 })).toEqual({ x: 2.5, y: -0.5 });
  });

  it("keeps a brush point only after a quarter-tile move", () => {
    const once = appendStrokePoint([{ x: 1, y: 1 }], { x: 2, y: 1 });
    expect(once).toHaveLength(1);
    expect(appendStrokePoint(once, { x: 3, y: 1 })).toHaveLength(2);
  });

  it("finds the topmost element under a tap and moves elements freely", () => {
    expect(hitsElement(elements[1], { x: 7, y: 4 })).toBe(true);
    expect(hitsElement(elements[1], { x: 7, y: 10 })).toBe(false);
    const outline: PlanElement = { kind: "area", color: 0, filled: false, from: { x: 0, y: 0 }, to: { x: 80, y: 80 } };
    expect(hitsElement(outline, { x: 40, y: 40 })).toBe(false);
    expect(hitsElement(outline, { x: 3, y: 40 })).toBe(true);
    expect(topElementAt([elements[0], elements[0]], { x: -5, y: 10 })).toBe(1);
    expect(translateElement(elements[3], 3, -5)).toMatchObject({ at: { x: 15, y: -45 } });
  });

  it("trims label text to one line within the limit", () => {
    expect(cleanLabel("  Штурм \n  улья  ")).toBe("Штурм улья");
    expect(cleanLabel("x".repeat(100))).toHaveLength(48);
  });
});

describe("plan code", () => {
  it("round-trips every element kind, negative tiles, Cyrillic text and zones", async () => {
    const code = await encodePlan(plan);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^SSMC1\.[A-Za-z0-9_-]+$/);
    expect(await decodePlan(`  ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual(plan);
  });

  it("stays short for a busy plan", async () => {
    const busy: DecodedPlan = {
      mapId: "lv624",
      zones: [],
      elements: Array.from({ length: 20 }, (_, index) => ({
        kind: "stroke" as const, color: index % 8, width: 2,
        points: Array.from({ length: 60 }, (_, step) => ({ x: index * 3 + step, y: Math.round(Math.sin(step / 5) * 10) })),
      })),
    };
    const code = await encodePlan(busy);
    expect(await decodePlan(code)).toEqual(busy);
    expect(code.length).toBeLessThan(3500);
  });

  it("explains what is wrong with a broken code", async () => {
    const code = await encodePlan(plan);
    await expect(decodePlan("")).rejects.toThrow("Вставьте код");
    await expect(decodePlan("hello")).rejects.toThrow("SSMC1.");
    await expect(decodePlan(code.slice(0, code.length - 6))).rejects.toBeInstanceOf(PlanCodeError);
    await expect(decodePlan(`${code}!`)).rejects.toThrow("лишние символы");
  });

  it("still opens version 1 codes made with tile snapping", () => {
    const tiles: DecodedPlan = {
      mapId: "lv624",
      zones: [{ templateId: "HE", tile: { x: 3, y: 4 } }],
      elements: [
        { kind: "stroke", color: 1, width: 2, points: [{ x: 0, y: 0 }, { x: 2, y: -1 }] },
        { kind: "area", color: 2, filled: false, from: { x: 3, y: 1 }, to: { x: 1, y: 2 } },
        { kind: "label", color: 3, at: { x: -1, y: 5 }, text: "Мост" },
      ],
    };
    // Same layout as version 2, only the version number differs.
    const bytes = encodePayload(tiles);
    bytes[0] = 1;
    const body = bytes.subarray(0, bytes.length - 4);
    new DataView(bytes.buffer).setUint32(body.length, crc32(body), true);
    const decoded = decodePayload(bytes);
    expect(decoded.zones).toEqual(tiles.zones);
    expect(decoded.elements).toEqual([
      { kind: "stroke", color: 1, width: 2, points: [{ x: 4, y: 4 }, { x: 20, y: -4 }] },
      { kind: "area", color: 2, filled: false, from: { x: 8, y: 8 }, to: { x: 32, y: 24 } },
      { kind: "label", color: 3, at: { x: -4, y: 44 }, text: "Мост" },
    ]);
  });

  it("rejects a payload changed after it was made", () => {
    const bytes = encodePayload(plan);
    bytes[8] ^= 0xff;
    expect(() => decodePayload(bytes)).toThrow("контрольная сумма");
  });
});

describe("plan history", () => {
  const label = (text: string): PlanElement => ({ kind: "label", color: 1, at: { x: 0, y: 0 }, text });

  it("undoes and redoes every change and drops redo after a new edit", () => {
    let state = planReducer(EMPTY_PLAN, { type: "add", element: label("A") });
    state = planReducer(state, { type: "add", element: label("B") });
    state = planReducer(state, { type: "move", index: 0, dx: 3, dy: 0 });
    expect(state.elements[0]).toMatchObject({ at: { x: 3, y: 0 } });
    state = planReducer(state, { type: "undo" });
    expect(state.elements[0]).toMatchObject({ at: { x: 0, y: 0 } });
    state = planReducer(state, { type: "redo" });
    expect(state.elements[0]).toMatchObject({ at: { x: 3, y: 0 } });
    state = planReducer(planReducer(state, { type: "undo" }), { type: "remove", index: 1 });
    expect(state.future).toEqual([]);
    expect(planReducer(state, { type: "redo" })).toBe(state);
  });

  it("ignores no-op changes and refuses elements past the limit", () => {
    expect(planReducer(EMPTY_PLAN, { type: "clear" })).toBe(EMPTY_PLAN);
    expect(planReducer(EMPTY_PLAN, { type: "remove", index: 4 })).toBe(EMPTY_PLAN);
    const full = { ...EMPTY_PLAN, elements: Array.from({ length: MAX_ELEMENTS }, (_, index) => label(String(index))) };
    expect(planReducer(full, { type: "add", element: label("extra") })).toBe(full);
  });
});

describe("plan storage", () => {
  it("restores a draft only for its own map and survives broken storage", () => {
    localStorage.clear();
    saveDraft(plan);
    expect(loadDraft("lv624")).toEqual(plan);
    expect(loadDraft("almayer")).toBeUndefined();
    localStorage.setItem("ssmc-map-plan-drafts-v1", JSON.stringify({ lv624: "AAAA" }));
    expect(loadDraft("lv624")).toBeUndefined();
    localStorage.setItem("ssmc-map-plan-drafts-v1", "{not json");
    expect(loadDraft("lv624")).toBeUndefined();
  });

  it("replaces a saved plan with the same name and keeps others", () => {
    localStorage.clear();
    let plans = storeSavedPlan([], { name: "Оборона", mapId: "lv624", code: "SSMC1.a" }, 1)!;
    plans = storeSavedPlan(plans, { name: "Штурм", mapId: "lv624", code: "SSMC1.b" }, 2)!;
    plans = storeSavedPlan(plans, { name: "Оборона", mapId: "lv624", code: "SSMC1.c" }, 3)!;
    expect(plans.map((saved) => [saved.name, saved.code])).toEqual([["Оборона", "SSMC1.c"], ["Штурм", "SSMC1.b"]]);
    expect(loadSavedPlans()).toEqual(plans);
    expect(deleteSavedPlan(plans, plans[0].id).map((saved) => saved.name)).toEqual(["Штурм"]);
  });
});

describe("controls help", () => {
  const device = (fine: boolean, coarse: boolean) => inputKinds((query) => (query.includes("fine") ? fine : coarse));

  it("explains only the controls the device has", () => {
    expect(device(true, false)).toEqual({ mouse: true, touch: false });
    expect(device(false, true)).toEqual({ mouse: false, touch: true });
    expect(device(true, true)).toEqual({ mouse: true, touch: true });
    // Unknown devices see everything rather than nothing.
    expect(device(false, false)).toEqual({ mouse: true, touch: true });
  });
});
