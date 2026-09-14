import { expect, it } from "vitest";
import { availableGrips, resolveGrip } from "./grip";
import type { CatalogItem } from "../equipment/types";
const weapon = (...componentTypes: string[]) => ({ componentTypes } as CatalogItem);
it("disables one hand when wielding is required", () => {
 const gun = weapon("Wieldable", "GunRequiresWield");
 expect(availableGrips(gun)).toEqual({ one: false, two: true });
 expect(resolveGrip(gun, false)).toBe(true);
});
it("disables two hands when the weapon cannot be wielded", () => {
 expect(availableGrips(weapon("Gun"))).toEqual({ one: true, two: false });
 expect(resolveGrip(weapon("Gun"), true)).toBe(false);
});
it("preserves either allowed grip", () => {
 expect(resolveGrip(weapon("Wieldable"), true)).toBe(true);
 expect(resolveGrip(weapon("Wieldable"), false)).toBe(false);
});
