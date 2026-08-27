import { describe, expect, it } from "vitest";
import { readDamageUrlState, writeDamageUrlState } from "./urlState";

describe("damage URL state", () => {
  it("keeps the calculator defaults for an empty URL", () => {
    expect(readDamageUrlState(new URLSearchParams())).toMatchObject({
      ammoIndex: 0,
      ammoModeIndex: 0,
      hitDirection: "front",
      distance: 5,
    });
  });

  it("round-trips a complete calculator setup", () => {
    const state = readDamageUrlState(new URLSearchParams(
      "weapon=Rifle&ammo=2&mode=1&attachment=muzzle~Brake~1&attachment=rail~Light~0&target=xeno%3ADrone&direction=side&ability=Fortify&distance=17",
    ));
    expect(readDamageUrlState(writeDamageUrlState(state))).toEqual(state);
  });

  it("uses safe defaults for malformed values", () => {
    const state = readDamageUrlState(new URLSearchParams("ammo=-2&mode=x&target=unknown&direction=up&distance=999"));
    expect(state).toMatchObject({
      ammoIndex: 0,
      ammoModeIndex: 0,
      target: null,
      hitDirection: "front",
      distance: 40,
    });
  });
});
