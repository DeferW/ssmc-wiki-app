import { describe, expect, it } from "vitest";
import type { Catalog } from "../equipment/types";
import { isCompatibleAttachment, lockedIntegratedAttachmentIds } from "./attachmentEligibility";

const catalog = {
  items: {
    Owner: {
      id: "Owner",
      name: "Оружие",
      properties: { AttachableHolder: { slots: { rail: {
        locked: true,
        startingAttachable: "Integrated",
      } } } },
    },
    Integrated: { id: "Integrated", name: "Встроенный" },
    Removable: { id: "Removable", name: "Съёмный", directlyVended: true },
  },
} as unknown as Catalog;

describe("attachment eligibility", () => {
  it("finds unavailable attachments installed in locked slots", () => {
    expect(lockedIntegratedAttachmentIds(catalog)).toEqual(new Set(["Integrated"]));
  });

  it("accepts only listed removable attachments", () => {
    const integrated = lockedIntegratedAttachmentIds(catalog);
    const slot = { compatibleItemIds: ["Integrated", "Removable"] };
    expect(isCompatibleAttachment(catalog, slot, "Removable", integrated)).toBe(true);
    expect(isCompatibleAttachment(catalog, slot, "Integrated", integrated)).toBe(false);
    expect(isCompatibleAttachment(catalog, slot, "Unknown", integrated)).toBe(false);
  });
});
