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
  origin: string;
  sourceFile: string;
  parents: string[];
  thresholds: MobThresholdPair;
  maturedThresholds: MobThresholdPair | null;
  armor: XenoArmorStats;
  sprite: string | null;
};

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
