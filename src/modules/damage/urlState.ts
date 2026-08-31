import type { HitDirection } from "./damageMath";
import type { TargetSelection } from "./target";

export type DamageUrlState = {
  weaponId: string | null;
  ammoIndex: number;
  ammoModeIndex: number;
  attachmentBySlot: Record<string, string>;
  attachmentActiveBySlot: Record<string, boolean>;
  target: TargetSelection | null;
  targetMatured: boolean;
  hitDirection: HitDirection;
  activeAbilities: Set<string>;
  distance: number;
};

const DEFAULT_DISTANCE = 5;
const MIN_DISTANCE = 0;
const MAX_DISTANCE = 40;
const DIRECTIONS = new Set<HitDirection>(["front", "side", "back"]);

function nonNegativeInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function distanceFrom(value: string | null): number {
  if (value === null || value === "") return DEFAULT_DISTANCE;
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, parsed))
    : DEFAULT_DISTANCE;
}

function targetFrom(value: string | null): TargetSelection | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 1 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (kind === "marine") return { kind, presetId: id };
  if (kind === "xeno") return { kind, casteId: id };
  return null;
}

export function readDamageUrlState(params: URLSearchParams): DamageUrlState {
  const attachmentBySlot: Record<string, string> = {};
  const attachmentActiveBySlot: Record<string, boolean> = {};
  for (const value of params.getAll("attachment")) {
    const [slotId, itemId, active] = value.split("~");
    if (!slotId || !itemId) continue;
    attachmentBySlot[slotId] = itemId;
    if (active === "1") attachmentActiveBySlot[slotId] = true;
  }
  const direction = params.get("direction") as HitDirection | null;
  const target = targetFrom(params.get("target"));
  return {
    weaponId: params.get("weapon"),
    ammoIndex: nonNegativeInteger(params.get("ammo")),
    ammoModeIndex: nonNegativeInteger(params.get("mode")),
    attachmentBySlot,
    attachmentActiveBySlot,
    target,
    targetMatured: target?.kind === "xeno" && params.get("maturity") === "mature",
    hitDirection: direction && DIRECTIONS.has(direction) ? direction : "front",
    activeAbilities: new Set(params.getAll("ability").filter(Boolean)),
    distance: distanceFrom(params.get("distance")),
  };
}

export function writeDamageUrlState(state: DamageUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.weaponId) {
    params.set("weapon", state.weaponId);
    if (state.ammoIndex > 0) params.set("ammo", String(state.ammoIndex));
    if (state.ammoModeIndex > 0) params.set("mode", String(state.ammoModeIndex));
    for (const slotId of Object.keys(state.attachmentBySlot).sort()) {
      const itemId = state.attachmentBySlot[slotId];
      if (itemId) params.append("attachment", `${slotId}~${itemId}~${state.attachmentActiveBySlot[slotId] ? "1" : "0"}`);
    }
  }
  if (state.target) {
    params.set("target", state.target.kind === "marine"
      ? `marine:${state.target.presetId}`
      : `xeno:${state.target.casteId}`);
    if (state.target.kind === "xeno" && state.targetMatured) params.set("maturity", "mature");
  }
  if (state.hitDirection !== "front") params.set("direction", state.hitDirection);
  for (const ability of [...state.activeAbilities].sort()) params.append("ability", ability);
  if (state.distance !== DEFAULT_DISTANCE) params.set("distance", String(state.distance));
  return params;
}
