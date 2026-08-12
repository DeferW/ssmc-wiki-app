export type JsonMap = Record<string, unknown>;

export type AttachmentSlot = {
  id?: string;
  slotId?: string;
  name?: string;
  slotName?: string;
  compatibleItemIds?: string[];
  installedItemIds?: string[];
  weaponIds?: string[];
};

export type CatalogItem = {
  id: string;
  name: string;
  baseName?: string;
  description?: unknown;
  category?: string;
  image?: string;
  types?: string[];
  tags?: string[];
  componentTypes?: string[];
  equipmentSlots?: string[];
  properties?: Record<string, unknown>;
  classification?: {
    category?: string;
    categoryId?: string;
    confidence?: string;
    reason?: string;
  };
  attachmentSlots?: AttachmentSlot[];
  attachableTo?: AttachmentSlot[];
  magazineSlots?: AttachmentSlot[];
  compatibleWeaponIds?: string[];
  containsItemIds?: string[];
  weaponStats?: JsonMap;
  armorStats?: JsonMap;
  attachmentStats?: JsonMap;
  storageStats?: JsonMap;
};

export type PublicCatalog = {
  itemIds: string[];
  categories: Record<string, string[]>;
  aliases?: Record<string, string>;
};

export type Catalog = {
  schemaVersion: number;
  gameCommit: string;
  items: Record<string, CatalogItem>;
  publicCatalog: PublicCatalog;
  counts?: { publicItems?: number };
};

export type AdminOverride = {
  category?: string;
  hidden?: boolean;
};

export type AdminDraft = Record<string, AdminOverride>;

export type AdminApiDocument = {
  schemaVersion: 1;
  items: AdminDraft;
};

export type AdminSyncState = "loading" | "ready" | "saving" | "saved" | "error";
