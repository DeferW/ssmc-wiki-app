import { describe, expect, it } from "vitest";
import {
  collectRangedModifierEntries,
  foldAttachmentModifiers,
  isGunAttachment,
  isToggleableAttachment,
} from "./attachmentModifiers";
import type { EquippedAttachment, WeaponModifiableStats } from "./attachmentModifiers";
import type { CatalogItem } from "../equipment/types";

// Real data pulled from the catalog: CMM96SSniperRifle base stats (tags:
// ["CMM96SSniperRifle"]) and the full RMCAttachmentBipod ("Сошка") entry
// set, cross-checked against AttachableModifiersSystem.Ranged.cs /
// AttachableModifiersSystem.cs's CanApplyModifiers (additive accumulators;
// fire delay, not fire rate, is the linear quantity; whitelist/blacklist
// gate on the holder weapon's tags).
const M96S_BASE: WeaponModifiableStats = {
  damageMultiplier: 1,
  accuracyWieldedMultiplier: 3,
  scatterWielded: 0,
  recoilWielded: 1,
  shotsPerSecond: 0.667,
};
const M96S_TAGS = ["CMM96SSniperRifle"];

function bipod(): CatalogItem {
  return {
    id: "RMCAttachmentBipod",
    name: "Сошка",
    componentTypes: ["AttachableToggleable"],
    attachmentStats: {
      modifiers: {
        AttachableWeaponRangedMods: {
          modifiers: [
            { conditions: { inactiveOnly: true }, fireDelayFlat: 0.25 },
            {
              conditions: { wieldedOnly: true, inactiveOnly: true },
              accuracyAddMult: -0.25,
              scatterFlat: 4,
              recoilFlat: 1,
            },
            {
              conditions: { wieldedOnly: true, activeOnly: true },
              accuracyAddMult: 0.25,
              scatterFlat: -2,
              recoilFlat: -2,
            },
            { conditions: { activeOnly: true }, burstScatterAddMult: -3 },
            {
              conditions: { activeOnly: true, whitelist: { tags: ["CMM96SSniperRifle"] } },
              fireDelayFlat: -0.5,
            },
            {
              conditions: { activeOnly: true, blacklist: { tags: ["CMM96SSniperRifle"] } },
              fireDelayFlat: -0.1,
            },
            {
              conditions: { activeOnly: true, whitelist: { tags: ["RMCWeaponLMGM60"] } },
              fireDelayFlat: -0.1,
            },
          ],
        },
      },
    },
  } as unknown as CatalogItem;
}

function underbarrelShotgun(): CatalogItem {
  return {
    id: "RMCAttachmentU7UnderbarrelShotgun",
    name: "Подствольный дробовик U7",
    componentTypes: ["AttachableToggleable", "Gun"],
    attachmentStats: { modifiers: {} },
  } as unknown as CatalogItem;
}

describe("isGunAttachment / isToggleableAttachment", () => {
  it("flags the underbarrel shotgun as a Gun attachment", () => {
    expect(isGunAttachment(underbarrelShotgun())).toBe(true);
  });

  it("flags the bipod as toggleable but not a Gun", () => {
    const item = bipod();
    expect(isToggleableAttachment(item)).toBe(true);
    expect(isGunAttachment(item)).toBe(false);
  });
});

describe("collectRangedModifierEntries", () => {
  it("ignores Gun-type attachments entirely, even with modifiers", () => {
    const attachments: EquippedAttachment[] = [{ item: underbarrelShotgun(), active: true }];
    expect(collectRangedModifierEntries(attachments, M96S_TAGS)).toEqual([]);
  });

  it("selects only the inactive-condition entries when the bipod is folded", () => {
    const attachments: EquippedAttachment[] = [{ item: bipod(), active: false }];
    const entries = collectRangedModifierEntries(attachments, M96S_TAGS);
    expect(entries).toEqual([
      { conditions: { inactiveOnly: true }, fireDelayFlat: 0.25 },
      { conditions: { wieldedOnly: true, inactiveOnly: true }, accuracyAddMult: -0.25, scatterFlat: 4, recoilFlat: 1 },
    ]);
  });

  it("picks the M96S-specific fire delay bonus, not the blacklist or LMG one, when tags match", () => {
    const attachments: EquippedAttachment[] = [{ item: bipod(), active: true }];
    const entries = collectRangedModifierEntries(attachments, M96S_TAGS);
    const fireDelayEntries = entries.filter((entry) => entry.fireDelayFlat != null);
    expect(fireDelayEntries).toEqual([{ conditions: { activeOnly: true, whitelist: { tags: ["CMM96SSniperRifle"] } }, fireDelayFlat: -0.5 }]);
  });

  it("picks the blacklist fire delay bonus for a weapon without the M96S tag", () => {
    const attachments: EquippedAttachment[] = [{ item: bipod(), active: true }];
    const entries = collectRangedModifierEntries(attachments, ["WeaponRifleM4SPR"]);
    const fireDelayEntries = entries.filter((entry) => entry.fireDelayFlat != null);
    expect(fireDelayEntries).toEqual([{ conditions: { activeOnly: true, blacklist: { tags: ["CMM96SSniperRifle"] } }, fireDelayFlat: -0.1 }]);
  });
});

describe("foldAttachmentModifiers", () => {
  it("improves accuracy/scatter/recoil/fire-rate with the bipod deployed on the M96S", () => {
    const entries = collectRangedModifierEntries([{ item: bipod(), active: true }], M96S_TAGS);
    const result = foldAttachmentModifiers(M96S_BASE, entries);
    expect(result.accuracyWieldedMultiplier).toBeCloseTo(3.25, 10);
    expect(result.scatterWielded).toBe(0); // clamped at 0, matches Math.Max in the engine
    expect(result.recoilWielded).toBe(0); // 1 - 2 clamped at 0
    // fireDelay = 1/0.667 - 0.5 -> shotsPerSecond = 1/fireDelay
    const expectedDelay = 1 / 0.667 - 0.5;
    expect(result.shotsPerSecond).toBeCloseTo(1 / expectedDelay, 10);
  });

  it("worsens accuracy/scatter/recoil and slows fire rate with the bipod folded", () => {
    const entries = collectRangedModifierEntries([{ item: bipod(), active: false }], M96S_TAGS);
    const result = foldAttachmentModifiers(M96S_BASE, entries);
    expect(result.accuracyWieldedMultiplier).toBeCloseTo(2.75, 10);
    expect(result.scatterWielded).toBe(4);
    expect(result.recoilWielded).toBe(2);
    // fireDelay = 1/0.667 + 0.25 -> shotsPerSecond = 1/fireDelay
    const expectedDelay = 1 / 0.667 + 0.25;
    expect(result.shotsPerSecond).toBeCloseTo(1 / expectedDelay, 10);
  });

  it("leaves stats untouched with no attachments", () => {
    expect(foldAttachmentModifiers(M96S_BASE, [])).toEqual(M96S_BASE);
  });
});
