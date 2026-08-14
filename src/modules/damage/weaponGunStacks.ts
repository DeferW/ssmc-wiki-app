import type { GunStacksConfig } from "./damageMath";

// Only WeaponRifleXM88 carries a GunStacksComponent (verified against
// GunStacksComponent.cs / GunStacksSystem.cs — see the doc comment on
// simulateEngagement in damageMath.ts for the full mechanic). The values
// below are the component's own defaults; xm88_rifle.yml's `type: GunStacks`
// entry is bare, so nothing overrides them.
export const WEAPON_GUN_STACKS: Record<string, GunStacksConfig> = {
  WeaponRifleXM88: {
    increaseArmorPiercing: 10,
    maxArmorPiercingBonus: 50,
    damageMultiplierBonus: 0.2,
    activeFireRate: 1.4285,
  },
};
