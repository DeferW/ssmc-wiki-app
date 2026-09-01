export type JsonMap = Record<string, unknown>;

export type CatalogSource = {
  id: string;
  name?: string;
  description?: string;
  type?: string;
};

export type PurchaseOffer = {
  vendorId: string;
  sourceType?: "vendor" | "cargo" | string;
  sectionName?: string;
  tradeKey?: string;
  points?: unknown;
  amount?: unknown;
  spawn?: unknown;
  cost?: unknown;
  stockForItemId?: string;
};

export type ItemRelationship = {
  type?: string;
  itemId?: string;
  quantity?: number;
  slot?: string;
  container?: string;
  variant?: string;
};

export type CompatibilitySlot = {
  id?: string;
  slotId?: string;
  name?: string;
  slotName?: string;
  compatibleItemIds?: string[];
  installedItemIds?: string[];
  loadedItemIds?: string[];
  weaponIds?: string[];
  locked?: boolean;
  startingItemId?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  baseName?: string;
  description?: unknown;
  category?: string;
  image?: string;
  edited?: boolean;
  directlyVended?: boolean;
  types?: string[];
  tags?: string[];
  componentTypes?: string[];
  properties?: Record<string, JsonMap>;
  equipmentSlots?: string[];
  classification?: {
    category?: string;
    categoryId?: string;
    automaticCategory?: string;
    automaticCategoryId?: string;
    confidence?: string;
    reason?: string;
  };
  availability?: PurchaseOffer[];
  relationships?: ItemRelationship[];
  containsItemIds?: string[];
  attachmentSlots?: CompatibilitySlot[];
  attachableTo?: CompatibilitySlot[];
  magazineSlots?: CompatibilitySlot[];
  compatibleWeaponIds?: string[];
  ammunitionPaths?: JsonMap[];
  weaponStats?: JsonMap;
  armorStats?: JsonMap;
  attachmentStats?: JsonMap;
  storageStats?: JsonMap;
  solutionStats?: JsonMap;
  communicationStats?: JsonMap;
  skillStats?: JsonMap;
};

export type Catalog = {
  schemaVersion: number;
  gameCommit: string;
  source: string;
  locale?: string;
  sources: Record<string, CatalogSource>;
  items: Record<string, CatalogItem>;
  publicCatalog: {
    itemIds: string[];
    categories: Record<string, string[]>;
    aliases?: Record<string, string>;
  };
  counts?: {
    catalogItems?: number;
    publicItems?: number;
    editedItems?: number;
    hiddenItems?: number;
  };
  overrides?: {
    schemaVersion?: number;
    appliedItemIds?: string[];
    editedItemIds?: string[];
  };
};

export type PanelPosition = "right" | "center";
