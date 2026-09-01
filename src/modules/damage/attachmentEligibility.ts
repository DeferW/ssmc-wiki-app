import { isMap } from "../equipment/format";
import type { Catalog, CompatibilitySlot } from "../equipment/types";

export function lockedIntegratedAttachmentIds(catalog: Catalog) {
  const result = new Set<string>();
  for (const owner of Object.values(catalog.items)) {
    const holder = owner.properties?.AttachableHolder;
    const slots = isMap(holder?.slots) ? holder.slots : {};
    for (const value of Object.values(slots)) {
      if (!isMap(value) || value.locked !== true || typeof value.startingAttachable !== "string") continue;
      const attachment = catalog.items[value.startingAttachable];
      if (attachment && !attachment.directlyVended && !attachment.availability?.length) {
        result.add(attachment.id);
      }
    }
  }
  return result;
}

export function isCompatibleAttachment(
  catalog: Catalog,
  slot: CompatibilitySlot,
  itemId: string | undefined,
  lockedIntegratedIds: ReadonlySet<string>,
) {
  return Boolean(
    itemId
    && catalog.items[itemId]
    && slot.compatibleItemIds?.includes(itemId)
    && !lockedIntegratedIds.has(itemId),
  );
}
