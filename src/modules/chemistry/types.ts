export type ChemistrySectionId = "ordnance" | "medicine" | "drinks" | "elements" | "other";

export type ChemistryCatalogEntry = {
  id: string;
  name: string;
  origin: string;
  sectionPath: string[];
  includedBy?: string;
};

export type ChemistryEffect = {
  yamlTag?: string;
  value?: Record<string, unknown>;
};

export type ChemistryReagent = {
  id: string;
  name: string;
  description?: string;
  physicalDescription?: string;
  origin: string;
  properties?: {
    group?: string;
    color?: string;
    flavor?: string;
    overdose?: number;
    criticalOverdose?: number;
    plantMetabolism?: ChemistryEffect[];
    metabolisms?: Record<string, {
      metabolismRate?: number;
      effects?: ChemistryEffect[];
    }>;
  };
};

export type ChemistryAmount = {
  id: string;
  name: string;
  amount: number;
};

export type ChemistryReaction = {
  id: string;
  origin: string;
  reactants: ChemistryAmount[];
  products: ChemistryAmount[];
  conditions?: {
    minTemp?: number;
    priority?: number;
  };
  effects?: ChemistryEffect[];
};

export type ChemistryCatalog = {
  schemaVersion: 1;
  source: {
    repository: string;
    branch: string;
    commit: string;
  };
  locale: string;
  counts: {
    customReagents: number;
    upstreamDependencies: number;
    customReactions: number;
    unlistedCustomReagents: number;
  };
  catalogSections: Record<ChemistrySectionId, ChemistryCatalogEntry[]>;
  reagents: Record<string, ChemistryReagent>;
  dependencies: Record<string, ChemistryReagent>;
  reactions: Record<string, ChemistryReaction>;
};

export type BeakerCapacity = 60 | 120 | 300;

export type TransferMode = 5 | 10 | 20 | 30 | 40;

export type PlannedSource = {
  kind: "source";
  reagentId: string;
  name: string;
  amount: number;
};

export type PlannedInput = {
  reagentId: string;
  name: string;
  amount: number;
  prepared: boolean;
};

export type PlannedByproduct = {
  reagentId: string;
  name: string;
  amount: number;
};

export type PlannedBatch = {
  key: string;
  batchNumber: number;
  batchCount: number;
  vessel: "tank";
  capacity: number;
  beakerCapacity: BeakerCapacity;
  targetAmount: number;
  totalInput: number;
  totalOutput: number;
  inputs: PlannedInput[];
  byproducts: PlannedByproduct[];
  minTemperature?: number;
  warnings: string[];
};

export type PlannedPreparation = {
  kind: "preparation";
  reagentId: string;
  name: string;
  requestedAmount: number;
  producedAmount: number;
  surplusAmount: number;
  reactionId: string;
  preparations: PlannedPreparation[];
  batches: PlannedBatch[];
};

export type PreparationPlan = {
  requestedAmount: number;
  producedAmount: number;
  surplusAmount: number;
  energyCost: number;
  beakerCapacity: BeakerCapacity;
  target: PlannedPreparation;
  sourceTotals: PlannedSource[];
  mixtureComponents?: PlannedSource[];
};
