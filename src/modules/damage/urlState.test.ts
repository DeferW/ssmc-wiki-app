import { describe, expect, it } from "vitest";
import { readDamageUrlState, writeDamageUrlState } from "./urlState";

describe("damage URL state", () => {
  it("keeps the calculator defaults for an empty URL", () => {
    expect(readDamageUrlState(new URLSearchParams())).toMatchObject({
      ammoIndex: 0,
      ammoModeIndex: 0,
      targetMatured: false,
      hitDirection: "front",
      distance: 5,
    });
  });

  it("round-trips a complete calculator setup", () => {
    const state = readDamageUrlState(new URLSearchParams(
      "weapon=Rifle&ammo=2&mode=1&attachment=muzzle~Brake~1&attachment=rail~Light~0&target=xeno%3AQueen&maturity=mature&direction=side&ability=Fortify&distance=17",
    ));
    expect(readDamageUrlState(writeDamageUrlState(state))).toEqual(state);
  });

  it("uses safe defaults for malformed values", () => {
    const state = readDamageUrlState(new URLSearchParams("ammo=-2&mode=x&target=unknown&direction=up&distance=999"));
    expect(state).toMatchObject({
      ammoIndex: 0,
      ammoModeIndex: 0,
      target: null,
      targetMatured: false,
      hitDirection: "front",
      distance: 40,
    });
  });
});

describe("attacker and custom values in the URL", () => {
  it("reads old links as a marine with a catalog weapon and target", () => {
    const state = readDamageUrlState(new URLSearchParams("weapon=Rifle&target=xeno%3ADrone"));
    expect(state.attackerSide).toBe("marine");
    expect(state.marineMode).toBe("catalog");
    expect(state.targetMode).toBe("catalog");
  });

  it("round-trips a xeno attacker against a custom marine", () => {
    const state = readDamageUrlState(writeDamageUrlState({
      ...readDamageUrlState(new URLSearchParams()),
      attackerSide: "xeno",
      xenoMode: "catalog",
      xenoCasteId: "CMXenoRavager",
      xenoAttack: "tail",
      targetMode: "custom",
      customTarget: { kind: "marine", bullet: 25, melee: 20, bio: 5, critical: null, dead: 200 },
    }));
    expect(state.attackerSide).toBe("xeno");
    expect(state.xenoCasteId).toBe("CMXenoRavager");
    expect(state.xenoAttack).toBe("tail");
    expect(state.targetMode).toBe("custom");
    expect(state.customTarget).toEqual({ kind: "marine", bullet: 25, melee: 20, bio: 5, critical: null, dead: 200 });
  });

  it("round-trips a custom weapon, a custom xeno attack and a custom xeno target", () => {
    const base = readDamageUrlState(new URLSearchParams());
    const weapon = readDamageUrlState(writeDamageUrlState({
      ...base,
      marineMode: "custom",
      customWeapon: { category: "melee", brute: 45.5, burn: 3, armorPiercing: 15, shotsPerSecond: 1.2, magazine: null },
      targetMode: "custom",
      customTarget: { kind: "xeno", xenoArmor: 30, frontalArmor: -5, sideArmor: 10, immuneToArmorPiercing: true, critical: 400, dead: 500 },
    }));
    expect(weapon.marineMode).toBe("custom");
    expect(weapon.customWeapon).toEqual({ category: "melee", brute: 45.5, burn: 3, armorPiercing: 15, shotsPerSecond: 1.2, magazine: null });
    expect(weapon.customTarget).toEqual({ kind: "xeno", xenoArmor: 30, frontalArmor: -5, sideArmor: 10, immuneToArmorPiercing: true, critical: 400, dead: 500 });

    const xeno = readDamageUrlState(writeDamageUrlState({
      ...base,
      attackerSide: "xeno",
      xenoMode: "custom",
      customXeno: { attack: "tail", brute: 50, burn: 0, armorPiercing: 10, attacksPerSecond: 0.1 },
    }));
    expect(xeno.xenoMode).toBe("custom");
    expect(xeno.customXeno).toEqual({ attack: "tail", brute: 50, burn: 0, armorPiercing: 10, attacksPerSecond: 0.1 });
  });

  it("falls back to the catalog target when the custom one is broken", () => {
    const state = readDamageUrlState(new URLSearchParams("tm=custom&ct=m~1~2"));
    expect(state.targetMode).toBe("catalog");
    expect(state.customTarget).toBeNull();
  });
});
