import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isMap } from "../../equipment/format";
import type { CatalogItem, JsonMap } from "../../equipment/types";

type EffectTone = "better" | "worse" | "neutral";

export type AttachmentEffectLine = {
  label: string;
  value: string;
  condition?: string;
  tone: EffectTone;
};

const TAG_LABELS: Record<string, string> = {
  RMCGunBipodFullAuto: "оружии с автоматическим режимом сошек",
  CMM96SSniperRifle: "M96S",
  RMCWeaponLMGM60: "M60",
  RMCWeaponPistolL14: "L14",
  RMCWeaponShotgun: "дробовиках",
  RMCGunShotgun: "дробовиках",
};

function tagLabel(tag: string) {
  if (TAG_LABELS[tag]) return TAG_LABELS[tag];
  if (/shotgun/u.test(tag.toLowerCase())) return "дробовиках";
  if (/sniper/u.test(tag.toLowerCase())) return "снайперских винтовках";
  if (/pistol/u.test(tag.toLowerCase())) return "пистолетах";
  if (/smg/u.test(tag.toLowerCase())) return "пистолетах-пулемётах";
  return tag;
}

function signed(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${Math.round(value * 100) / 100}${suffix}`;
}

function percent(value: number) {
  return signed(value * 100, "%");
}

function conditionLabel(value: unknown): string | undefined {
  if (!isMap(value)) return undefined;
  const parts: string[] = [];
  if (value.activeOnly === true) parts.push("когда включён");
  if (value.inactiveOnly === true) parts.push("когда выключен");
  if (value.wieldedOnly === true) parts.push("при стрельбе с двух рук");
  if (value.unwieldedOnly === true) parts.push("при стрельбе с одной руки");
  if (isMap(value.whitelist) && Array.isArray(value.whitelist.tags) && value.whitelist.tags.length) {
    const tags = value.whitelist.tags.filter((tag): tag is string => typeof tag === "string");
    parts.push(`только для ${tags.map(tagLabel).join(", ")}`);
  }
  if (isMap(value.blacklist) && Array.isArray(value.blacklist.tags) && value.blacklist.tags.length) {
    const tags = value.blacklist.tags.filter((tag): tag is string => typeof tag === "string");
    parts.push(`кроме ${tags.map(tagLabel).join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function pushNumeric(
  lines: AttachmentEffectLine[],
  entry: JsonMap,
  key: string,
  label: string,
  formatter: (value: number) => string,
  lowerIsBetter = false,
) {
  const value = entry[key];
  if (typeof value !== "number" || value === 0) return;
  const better = lowerIsBetter ? value < 0 : value > 0;
  lines.push({ label, value: formatter(value), condition: conditionLabel(entry.conditions), tone: better ? "better" : "worse" });
}

export function attachmentEffectLines(item: CatalogItem): AttachmentEffectLine[] {
  const lines: AttachmentEffectLine[] = [];
  const modifiers = item.attachmentStats?.modifiers;
  const ranged = isMap(modifiers) && isMap(modifiers.AttachableWeaponRangedMods)
    ? modifiers.AttachableWeaponRangedMods
    : isMap(item.properties?.AttachableWeaponRangedMods) ? item.properties?.AttachableWeaponRangedMods : undefined;
  const entries = isMap(ranged) && Array.isArray(ranged.modifiers) ? ranged.modifiers.filter(isMap) : [];

  for (const entry of entries) {
    pushNumeric(lines, entry, "accuracyAddMult", "Точность", percent);
    pushNumeric(lines, entry, "damageAddMult", "Урон", percent);
    pushNumeric(lines, entry, "scatterFlat", "Разброс", (value) => signed(value), true);
    pushNumeric(lines, entry, "recoilFlat", "Отдача", (value) => signed(value), true);
    pushNumeric(lines, entry, "fireDelayFlat", "Задержка выстрела", (value) => signed(value, " с"), true);
    pushNumeric(lines, entry, "burstScatterAddMult", "Разброс очереди", (value) => signed(value), true);
    pushNumeric(lines, entry, "damageFalloffAddMult", "Падение урона", percent, true);
    pushNumeric(lines, entry, "rangeFlat", "Дальность", (value) => signed(value, " т."));
    pushNumeric(lines, entry, "shotsPerBurstFlat", "Выстрелов в очереди", (value) => signed(value));
    pushNumeric(lines, entry, "projectileSpeedFlat", "Скорость снаряда", (value) => signed(value));
  }

  const fireModes = isMap(ranged) && Array.isArray(ranged.fireModeMods) ? ranged.fireModeMods.filter(isMap) : [];
  for (const entry of fireModes) {
    const mode = entry.extraFireModes ?? entry.setFireMode;
    if (typeof mode === "string") lines.push({
      label: "Режим стрельбы",
      value: mode === "FullAuto" ? "Автоматический" : mode === "Burst" ? "Очередь" : mode,
      condition: conditionLabel(entry.conditions),
      tone: "neutral",
    });
  }

  const wield = isMap(modifiers) && isMap(modifiers.AttachableWieldDelayMods)
    ? modifiers.AttachableWieldDelayMods
    : item.properties?.AttachableWieldDelayMods;
  const wieldEntries = isMap(wield) && Array.isArray(wield.modifiers) ? wield.modifiers.filter(isMap) : [];
  for (const entry of wieldEntries) pushNumeric(lines, entry, "delay", "Время вскидывания", (value) => signed(value, " с"), true);

  const speed = isMap(modifiers) && isMap(modifiers.AttachableSpeedMods)
    ? modifiers.AttachableSpeedMods
    : item.properties?.AttachableSpeedMods;
  const speedEntries = isMap(speed) && Array.isArray(speed.modifiers) ? speed.modifiers.filter(isMap) : [];
  for (const entry of speedEntries) {
    pushNumeric(lines, entry, "walk", "Скорость ходьбы", percent);
    pushNumeric(lines, entry, "sprint", "Скорость бега", percent);
  }

  return lines;
}

function AttachmentEffectContent({ item, compact = false }: { item: CatalogItem; compact?: boolean }) {
  const lines = attachmentEffectLines(item);
  return (
    <div className={`attachment-effect-tooltip${compact ? " is-compact" : ""}`} role="tooltip">
      <strong>Что изменяет</strong>
      {lines.length ? (
        <ul>
          {lines.map((line, index) => (
            <li className={`is-${line.tone}`} key={`${line.label}:${line.value}:${index}`}>
              <span>{line.label}</span><b>{line.value}</b>
              {line.condition && <small>{line.condition}</small>}
            </li>
          ))}
        </ul>
      ) : <p>Не изменяет основные параметры стрельбы.</p>}
    </div>
  );
}

export function AttachmentTooltipTrigger({ item, compact = false, className, children }: {
  item: CatalogItem;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateCursor = (event: MouseEvent<HTMLElement>) => setCursor({ x: event.clientX, y: event.clientY });

  useLayoutEffect(() => {
    if (!cursor || !tooltipRef.current) return;
    const margin = 12;
    const gap = 16;
    const rect = tooltipRef.current.getBoundingClientRect();
    const left = Math.max(margin, Math.min(cursor.x + gap, window.innerWidth - rect.width - margin));
    const below = cursor.y + gap;
    const top = below + rect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, cursor.y - rect.height - gap);
    setPosition({ left, top });
  }, [cursor]);

  return (
    <div
      className={className}
      onMouseEnter={updateCursor}
      onMouseMove={updateCursor}
      onMouseLeave={() => { setCursor(null); setPosition(null); }}
    >
      {children}
      {cursor && createPortal(
        <div
          className="attachment-tooltip-portal"
          ref={tooltipRef}
          style={{ left: position?.left ?? cursor.x + 16, top: position?.top ?? cursor.y + 16 }}
        >
          <AttachmentEffectContent item={item} compact={compact} />
        </div>,
        document.body,
      )}
    </div>
  );
}
