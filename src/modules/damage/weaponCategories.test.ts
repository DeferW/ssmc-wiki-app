import { expect, it } from "vitest";
import { weaponCategory } from "./weaponCategories";
import type { CatalogItem } from "../equipment/types";
const item = (group?: string, tags: string[] = []) => ({ id: "FutureWeapon", name: "New weapon", tags, properties: { GunDualWielding: { weaponGroup: group } } } as CatalogItem);
it("classifies newly discovered weapons by game family", () => {
 expect(weaponCategory(item("Rifle"))).toBe("rifles");
 expect(weaponCategory(item("Handgun"))).toBe("handguns");
 expect(weaponCategory(item("Submachinegun"))).toBe("smgs");
 expect(weaponCategory(item("Shotgun"))).toBe("shotguns");
});
it("uses generic tags without matching individual weapon IDs", () => {
 expect(weaponCategory(item(undefined,["RMCWeaponShotgun"]))).toBe("shotguns");
 expect(weaponCategory(item(undefined,["RMCWeaponSMG"]))).toBe("smgs");
 expect(weaponCategory(item(undefined,["Sidearm"]))).toBe("handguns");
 expect(weaponCategory(item("Rifle",["Sidearm"]))).toBe("rifles");
});
it("keeps unknown families in Other, regardless of their name", () => {
 expect(weaponCategory(item("Heavy"))).toBe("other");
 expect(weaponCategory({...item(), id:"WeaponShotgunExample",name:"Пистолет"})).toBe("other");
});
