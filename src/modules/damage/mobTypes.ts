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

export type XenoCaste = {
  id: string;
  name: string;
  strainName: string | null;
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
