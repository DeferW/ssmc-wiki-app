export type MobThresholdPair = {
  critical: number | null;
  dead: number;
};

export type XenoArmorStats = {
  xenoArmor: number;
  frontalArmor: number;
  sideArmor: number;
  explosionArmor: number;
  immuneToArmorPiercing: boolean;
};

// RMCSizeComponent.Size; an ordered scale (declaration order below is the
// real enum order) that gates several mechanics, notably which bonus-damage
// tier RMCFocusedShootingSystem grants a landed aimed shot.
export type RmcSize = "Small" | "Humanoid" | "VerySmallXeno" | "SmallXeno" | "Xeno" | "Big" | "Immobile";

export type XenoCaste = {
  id: string;
  name: string;
  strainName: string | null;
  size: RmcSize;
  origin: string;
  sourceFile: string;
  parents: string[];
  thresholds: MobThresholdPair;
  maturedThresholds: MobThresholdPair | null;
  armor: XenoArmorStats;
  sprite: string | null;
};

// Multiple strains share one caste family name ("Воин" for both the Bastion
// and Boxer strains) — the id disambiguates but isn't meant for players, so
// pair the family name with the localized strain name wherever a caste is shown.
export function xenoCasteLabel(caste: XenoCaste): string {
  return caste.strainName ? `${caste.name} (${caste.strainName})` : caste.name;
}

export type MobCatalog = {
  schemaVersion: number;
  source: string;
  gameCommit: string;
  locale: string;
  marine: {
    sourcePrototypeId: string;
    thresholds: MobThresholdPair;
  };
  xenoCastes: Record<string, XenoCaste>;
  counts: { xenoCastes: number };
};
