import type { XenoTargetArmor } from "./damageMath";

export type XenoDefensiveAbility = {
  name: string;
  xenoArmorBonus: number;
  frontalArmorBonus: number;
  sideArmorBonus: number;
  // Names of abilities on the same caste that this one forcibly deactivates
  // when turned on (and vice versa) — a real in-engine attempt-event block,
  // not just a UI nicety.
  exclusiveWith?: string[];
};

// Verified against the live components, not guessed:
// - STXenoWarriorBulwark ("Бастион"): EncasedPlatesComponent defaults
//   (FrontalArmorBonus=10, SideArmorBonus=-10), applied in
//   EncasedPlatesSystem.OnEncasedPlatesGetArmor while Active.
// - CMXenoDefender / CMXenoDefenderSteelcrest ("Защитник"): TWO toggles
//   inherited from CMXenoDefenderBase, but mutually exclusive (see below),
//   never both active at once:
//   - XenoFortifyComponent ("Укрепление") — base defaults (Armor=30,
//     FrontalArmor=5) vs. the Steelcrest strain's explicit override
//     (armor: 10, frontalArmor: 15) in defender.yml, applied in
//     XenoFortifySystem.OnXenoFortifyGetArmor while Fortified.
//   - XenoCrestComponent ("Опустить гребень", ActionXenoToggleCrest) —
//     component defaults (Armor=5), identical for both variants since
//     neither overrides it, applied in
//     XenoCrestSystem.OnXenoCrestGetArmor while Lowered.
//   These two are mutually exclusive, not stackable: XenoFortifySystem's
//   OnXenoFortifyToggleCrestAttempt blocks lowering the crest while
//   Fortified, and XenoCrestSystem's OnXenoCrestFortifyAttempt blocks
//   fortifying while Lowered — a real attempt-event block in both
//   directions, not just a one-way restriction.
// Crusher's and Praetorian Vanguard's defensive abilities are an HP-pool
// shield (XenoShieldSystem), not an armor number, and are intentionally not
// modeled here — see CrusherShieldComponent/VanguardShieldComponent.
export const XENO_DEFENSIVE_ABILITIES: Record<string, XenoDefensiveAbility[]> = {
  STXenoWarriorBulwark: [
    { name: "Закованные пластины", xenoArmorBonus: 0, frontalArmorBonus: 10, sideArmorBonus: -10 },
  ],
  CMXenoDefender: [
    { name: "Укрепление", xenoArmorBonus: 30, frontalArmorBonus: 5, sideArmorBonus: 0, exclusiveWith: ["Опустить гребень"] },
    { name: "Опустить гребень", xenoArmorBonus: 5, frontalArmorBonus: 0, sideArmorBonus: 0, exclusiveWith: ["Укрепление"] },
  ],
  CMXenoDefenderSteelcrest: [
    { name: "Укрепление", xenoArmorBonus: 10, frontalArmorBonus: 15, sideArmorBonus: 0, exclusiveWith: ["Опустить гребень"] },
    { name: "Опустить гребень", xenoArmorBonus: 5, frontalArmorBonus: 0, sideArmorBonus: 0, exclusiveWith: ["Укрепление"] },
  ],
};

// Turning an ability on deactivates anything listed in its exclusiveWith,
// mirroring the attempt-event block in the engine (activating one cancels
// the other, it doesn't refuse the action). Turning an ability off never
// affects the others.
export function toggleXenoAbility(
  casteId: string,
  current: ReadonlySet<string>,
  name: string,
): Set<string> {
  const abilities = XENO_DEFENSIVE_ABILITIES[casteId] ?? [];
  const next = new Set(current);
  if (next.has(name)) {
    next.delete(name);
    return next;
  }
  const ability = abilities.find((entry) => entry.name === name);
  for (const excluded of ability?.exclusiveWith ?? []) next.delete(excluded);
  next.add(name);
  return next;
}

// Matches CMGetArmorEvent accumulation: every active ability's bonus is added
// straight to the running totals, unclamped — only the final combined armor
// (after piercing and the hit-direction bonus) is floored at 0, in
// applyArmorMitigation. Multiple abilities on the same caste (e.g. the
// Defender's Fortify + Crest) stack, matching the engine's event handlers,
// which all subscribe to the same CMGetArmorEvent independently.
export function applyXenoAbilityBonuses(
  armor: XenoTargetArmor,
  casteId: string,
  activeAbilityNames: ReadonlySet<string>,
): XenoTargetArmor {
  const abilities = XENO_DEFENSIVE_ABILITIES[casteId];
  if (!abilities) return armor;

  let xenoArmor = armor.xenoArmor;
  let frontalArmor = armor.frontalArmor;
  let sideArmor = armor.sideArmor;
  for (const ability of abilities) {
    if (!activeAbilityNames.has(ability.name)) continue;
    xenoArmor += ability.xenoArmorBonus;
    frontalArmor += ability.frontalArmorBonus;
    sideArmor += ability.sideArmorBonus;
  }

  return { kind: "xeno", xenoArmor, frontalArmor, sideArmor, immuneToArmorPiercing: armor.immuneToArmorPiercing };
}
