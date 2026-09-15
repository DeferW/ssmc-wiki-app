import { expect, it } from "vitest";
import { projectileHitChance, shotOutcome } from "./projectileAccuracy";
it("uses weapon accuracy, range and target evasion separately from direction", () => {
 expect(projectileHitChance({ accuracy: { accuracy: 105, thresholds: [{ range:16,falloff:10 }] } }, .5, 7)).toBe(.525);
 expect(projectileHitChance({accuracy:{}}, 1, 7, 0, 10)).toBe(.6);
 expect(shotOutcome(0, .525, .9)).toBe("dodge");
 expect(shotOutcome(0, .525, .1)).toBe("hit");
 expect(shotOutcome(20, 1, 0)).toBe("wide");
});
it("applies minimum range buildup, shifted thresholds and minimum accuracy", () => {
 expect(projectileHitChance({accuracy:{accuracy:90,thresholds:[{range:10,falloff:10,buildup:true}]}},1,7)).toBe(.6);
 expect(projectileHitChance({accuracy:{}},1,7,2)).toBe(.9);
 expect(projectileHitChance({accuracy:{}},1,100)).toBe(.05);
 expect(projectileHitChance({accuracy:{forceHit:true}},.1,100)).toBe(1);
 expect(projectileHitChance({},1,7)).toBeUndefined();
});
