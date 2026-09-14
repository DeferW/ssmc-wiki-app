import { describe, expect, it } from "vitest";
import { nextScatter, scatterModel, shotAngles, coneOffset, type Ballistics } from "./scatterModel";
import { collectAttachmentFireModes } from "./attachmentModifiers";
import type { CatalogItem } from "../equipment/types";

const rifle: Ballistics = {
  schemaVersion: 1, rulesCommit: "024d853a", availableModes: ["SemiAuto", "Burst", "FullAuto"], defaultMode: "FullAuto",
  scatter: 6, increase: 0, decay: 0, recoil: 1, burstScatterMultiplier: 1, fireRate: 4, burstRateMultiplier: 2, burstSize: 3,
  modes: { SemiAuto: {extraScatter:0,scaleExtraScatter:false,shotsToMax:null,fireDelay:0},
    Burst: {extraScatter:10,scaleExtraScatter:true,shotsToMax:6,fireDelay:.1665},
    FullAuto: {extraScatter:13,scaleExtraScatter:true,shotsToMax:4,fireDelay:0} }, unsupported: [],
};
describe("official selective-fire geometry", () => {
  it("uses a full cone angle and increments before the first shot", () => {
    const model = scatterModel(rifle, "FullAuto", []);
    expect(model.minimum).toBe(6); expect(model.maximum).toBe(19);
    let angle = model.minimum;
    const series = Array.from({ length: 5 }, () => angle = nextScatter(model, angle));
    expect(series).toEqual([9.25,12.5,15.75,19,19]);
    expect(shotAngles(model, 19, 0)).toEqual([-9.5]);
    expect(shotAngles(model, 19, 1)).toEqual([9.5]);
    expect(shotAngles(model, 19, .5)).toEqual([0]);
  });
  it("single fire stays at minimum and a new trigger starts from minimum", () => {
    const model = scatterModel(rifle, "SemiAuto", []);
    expect(nextScatter(model, 6)).toBe(6);
    const automatic = scatterModel(rifle, "FullAuto", []);
    expect(nextScatter(automatic, automatic.minimum)).toBe(9.25);
  });
  it("active bipod lowers burst multiplier and clamps negative extra scatter", () => {
    const model = scatterModel(rifle, "FullAuto", [{ scatterFlat:-2, recoilFlat:-2, burstScatterAddMult:-3 }]);
    expect(model.minimum).toBe(4); expect(model.maximum).toBe(4); expect(model.increase).toBe(0); expect(model.recoil).toBe(0);
  });
  it("shotgun pellets use the original aim angle rather than the randomized gun direction", () => {
    const model = scatterModel(rifle, "SemiAuto", [{scatterFlat:-2}], {projectilesPerShot:5, spreadDegrees:15});
    expect(model.pelletSpread).toBe(14);
    expect(shotAngles(model, 4, .5)).toEqual([-7,-3.5,0,3.5,7]);
    expect(shotAngles(model, 4, 1)).toEqual([-7,-3.5,0,3.5,7]);
  });
  it("applies recoil modifiers independently from bullet scatter", () => {
    const original = scatterModel(rifle,"SemiAuto",[]);
    const modified = scatterModel(rifle,"SemiAuto",[{recoilFlat:4, accuracyAddMult:10}]);
    expect(modified.minimum).toBe(original.minimum); expect(modified.recoil).toBe(5);
  });
  it("uses half of the full cone for geometric bounds", () => {
    expect(coneOffset(10,90)).toBeCloseTo(10);
    expect(coneOffset(10,0)).toBe(0);
  });
  it("adds attachment fire modes only for matching active conditions", () => {
    const item = { attachmentStats: { modifiers: { AttachableWeaponRangedMods: {
      fireModeMods: [{ conditions: { activeOnly:true, whitelist:{tags:["Bipod"]} }, extraFireModes:"FullAuto" }],
    } } } } as unknown as CatalogItem;
    expect(collectAttachmentFireModes([{item,active:false}],["Bipod"])).toEqual([]);
    expect(collectAttachmentFireModes([{item,active:true}],[])).toEqual([]);
    expect(collectAttachmentFireModes([{item,active:true}],["Bipod"])).toEqual(["FullAuto"]);
  });
});

it("uses one-handed base recoil and multiplies extra burst scatter", () => {
  const config = { ...rifle, scatterUnwielded: 20, recoilUnwielded: 4,
    modes: { ...rifle.modes, FullAuto: { ...rifle.modes.FullAuto, unwieldedMultiplier: 2 } } };
  const model = scatterModel(config, "FullAuto", [], undefined, false);
  expect(model.minimum).toBe(20); expect(model.maximum).toBe(46);
  expect(model.increase).toBe(6.5); expect(model.recoil).toBe(4);
});
