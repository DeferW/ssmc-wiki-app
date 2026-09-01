import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../equipment/types";
import { canDamageAnyTarget } from "./weaponEligibility";

function weapon(weaponStats: CatalogItem["weaponStats"]): CatalogItem {
  return { id: "Weapon", name: "Оружие", category: "Оружие", weaponStats };
}

describe("canDamageAnyTarget", () => {
  it("accepts living-target damage at zero distance", () => {
    expect(canDamageAnyTarget(weapon({
      ammunition: [{ projectiles: [{ damage: { Piercing: 10 } }] }],
    }))).toBe(true);
  });

  it("rejects structural-only and zero damage", () => {
    expect(canDamageAnyTarget(weapon({
      ammunition: [{ projectiles: [{ damage: { Structural: 500, Piercing: 0 } }] }],
    }))).toBe(false);
  });

  it("checks every ammunition and ammo mode", () => {
    expect(canDamageAnyTarget(weapon({
      ammunition: [{ projectiles: [{ damage: {} }] }],
      ammoModes: [{ damage: { Piercing: 0 } }, { damage: { Heat: 15 } }],
    }))).toBe(true);
  });

  it("rejects items without calculable ammunition", () => {
    expect(canDamageAnyTarget(weapon(undefined))).toBe(false);
  });
});
