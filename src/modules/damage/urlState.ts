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

export type DamageBuildUrlState = Pick<DamageUrlState,
  | "weaponId"
  | "ammoIndex"
  | "ammoModeIndex"
  | "attachmentBySlot"
  | "attachmentActiveBySlot"
>;

export type DamageComparisonUrlState = Pick<DamageUrlState,
  | "target"
  | "targetMatured"
  | "hitDirection"
  | "activeAbilities"
  | "distance"
> & {
  builds: DamageBuildUrlState[];
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

function encodeBuild(build: DamageBuildUrlState): string {
  const serialized = JSON.stringify({
    w: build.weaponId,
    a: build.ammoIndex,
    m: build.ammoModeIndex,
    t: build.attachmentBySlot,
    v: build.attachmentActiveBySlot,
  });
  const bytes = new TextEncoder().encode(serialized);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBuild(value: string): DamageBuildUrlState | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const attachments = parsed.t && typeof parsed.t === "object" ? parsed.t as Record<string, unknown> : {};
    const active = parsed.v && typeof parsed.v === "object" ? parsed.v as Record<string, unknown> : {};
    return {
      weaponId: typeof parsed.w === "string" ? parsed.w : null,
      ammoIndex: typeof parsed.a === "number" && Number.isInteger(parsed.a) && parsed.a >= 0 ? parsed.a : 0,
      ammoModeIndex: typeof parsed.m === "number" && Number.isInteger(parsed.m) && parsed.m >= 0 ? parsed.m : 0,
      attachmentBySlot: Object.fromEntries(Object.entries(attachments).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      attachmentActiveBySlot: Object.fromEntries(Object.entries(active).filter((entry): entry is [string, boolean] => entry[1] === true)),
    };
  } catch {
    return null;
  }
}

export function readDamageComparisonUrlState(params: URLSearchParams): DamageComparisonUrlState | null {
  if (params.get("view") !== "compare") return null;
  const common = readDamageUrlState(params);
  const builds = params.getAll("build").map(decodeBuild).filter((build): build is DamageBuildUrlState => build != null).slice(0, 4);
  if (builds.length < 2) return null;
  return {
    builds,
    target: common.target,
    targetMatured: common.targetMatured,
    hitDirection: common.hitDirection,
    activeAbilities: common.activeAbilities,
    distance: common.distance,
  };
}

export function writeDamageComparisonUrlState(state: DamageComparisonUrlState): URLSearchParams {
  const params = writeDamageUrlState({
    weaponId: null,
    ammoIndex: 0,
    ammoModeIndex: 0,
    attachmentBySlot: {},
    attachmentActiveBySlot: {},
    target: state.target,
    targetMatured: state.targetMatured,
    hitDirection: state.hitDirection,
    activeAbilities: state.activeAbilities,
    distance: state.distance,
  });
  params.set("view", "compare");
  for (const build of state.builds.slice(0, 4)) params.append("build", encodeBuild(build));
  return params;
}
