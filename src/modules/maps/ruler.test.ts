import { describe, expect, it } from "vitest";
import { addRulerPoint, formatDistance, measureTiles, tileAt } from "./ruler";

describe("map ruler", () => {
  it("snaps world coordinates to the containing tile, including negatives", () => {
    expect(tileAt({ x: 12.9, y: -0.2 })).toEqual({ x: 12, y: -1 });
  });

  it("cycles start → end → new start", () => {
    const first = addRulerPoint({}, { x: 1, y: 1 });
    const second = addRulerPoint(first, { x: 4, y: 5 });
    expect(first).toEqual({ start: { x: 1, y: 1 } });
    expect(second).toEqual({ start: { x: 1, y: 1 }, end: { x: 4, y: 5 } });
    expect(addRulerPoint(second, { x: 9, y: 9 })).toEqual({ start: { x: 9, y: 9 } });
  });

  it("measures the straight line between tile centres", () => {
    expect(measureTiles({ x: 1, y: 1 }, { x: 4, y: 5 })).toEqual({ dx: 3, dy: 4, distance: 5 });
    expect(measureTiles({ x: 0, y: 0 }, { x: -2, y: 0 }).dx).toBe(-2);
  });

  it("formats distances with Russian plurals", () => {
    expect(formatDistance(1)).toBe("1 тайл");
    expect(formatDistance(3)).toBe("3 тайла");
    expect(formatDistance(12)).toBe("12 тайлов");
    expect(formatDistance(21)).toBe("21 тайл");
    expect(formatDistance(Math.hypot(3, 3))).toBe("4,2 тайла");
    expect(formatDistance(0)).toBe("0 тайлов");
  });
});
