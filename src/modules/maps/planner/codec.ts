import type { PlacedZone } from "../fireZones";
import type { Point } from "../types";
import {
  MAX_ELEMENTS, MAX_LABEL_LENGTH, MAX_STROKE_POINTS, MAX_WIDTH, MIN_WIDTH, PLAN_COLORS, STAMPS, UNITS_PER_TILE,
  type PlanElement,
} from "./model";

/**
 * Plan code: "SSMC1." + base64url(deflate-raw(payload)).
 *
 * Payload, little endian, unsigned/zigzag LEB128 varints:
 *   version · mapId · zones (templateId, x, y) · elements · CRC32 of everything before it.
 * Points of a line are stored as differences from the previous point, so long
 * strokes stay short. Bump CODE_VERSION and keep reading the old one when the
 * layout changes; shared codes must keep working.
 *
 * Version 1 stored whole tiles; version 2 stores eighths of a tile (free drawing).
 * Zones stay in whole tiles in both versions.
 */
export const CODE_PREFIX = "SSMC1.";
const CODE_VERSION = 2;
export const MAX_CODE_LENGTH = 12000;
const MAX_ZONES_IN_CODE = 64;
const MAX_COORDINATE = 100_000;

const KINDS = ["stroke", "arrow", "area", "label", "stamp"] as const;

export type DecodedPlan = { mapId: string; elements: PlanElement[]; zones: PlacedZone[] };

export class PlanCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanCodeError";
  }
}

class Writer {
  private bytes: number[] = [];
  byte(value: number) { this.bytes.push(value & 0xff); }
  uint(value: number) {
    let rest = value >>> 0;
    while (rest >= 0x80) { this.bytes.push((rest & 0x7f) | 0x80); rest >>>= 7; }
    this.bytes.push(rest);
  }
  int(value: number) { this.uint(value >= 0 ? value * 2 : -value * 2 - 1); }
  text(value: string) {
    const encoded = new TextEncoder().encode(value);
    this.uint(encoded.length);
    for (const byte of encoded) this.bytes.push(byte);
  }
  point(value: Point, previous?: Point) {
    this.int(value.x - (previous?.x ?? 0));
    this.int(value.y - (previous?.y ?? 0));
  }
  finish(): Uint8Array {
    const body = Uint8Array.from(this.bytes);
    const crc = crc32(body);
    const result = new Uint8Array(body.length + 4);
    result.set(body);
    new DataView(result.buffer).setUint32(body.length, crc, true);
    return result;
  }
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get done() { return this.offset >= this.bytes.length; }
  byte(): number {
    if (this.offset >= this.bytes.length) throw new PlanCodeError("Код плана обрывается — скопируйте его целиком.");
    return this.bytes[this.offset++];
  }
  uint(): number {
    let result = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = this.byte();
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return result;
    }
    throw new PlanCodeError("Код плана повреждён.");
  }
  int(): number {
    const value = this.uint();
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }
  text(limit: number): string {
    const length = this.uint();
    if (length > limit * 4) throw new PlanCodeError("Слишком длинный текст в коде плана.");
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    if (slice.length !== length) throw new PlanCodeError("Код плана обрывается — скопируйте его целиком.");
    this.offset += length;
    return new TextDecoder("utf-8", { fatal: true }).decode(slice);
  }
  point(previous?: Point): Point {
    const x = this.int() + (previous?.x ?? 0);
    const y = this.int() + (previous?.y ?? 0);
    if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) throw new PlanCodeError("Код плана содержит координаты вне карты.");
    return { x, y };
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeElement(writer: Writer, element: PlanElement) {
  writer.byte(KINDS.indexOf(element.kind));
  writer.byte(element.color);
  switch (element.kind) {
    case "stroke":
    case "arrow":
      writer.byte(element.width);
      writer.uint(element.points.length);
      element.points.forEach((point, index) => writer.point(point, element.points[index - 1]));
      break;
    case "area":
      writer.byte(element.filled ? 1 : 0);
      writer.point(element.from);
      writer.point(element.to, element.from);
      break;
    case "label":
      writer.point(element.at);
      writer.text(element.text);
      break;
    case "stamp":
      writer.byte(element.stamp);
      writer.point(element.at);
      break;
  }
}

/** Version 1 tiles → plan units: points go to the tile centre, areas cover whole tiles. */
function fromTileVersion(element: PlanElement): PlanElement {
  const centre = (point: Point): Point => ({ x: point.x * UNITS_PER_TILE + UNITS_PER_TILE / 2, y: point.y * UNITS_PER_TILE + UNITS_PER_TILE / 2 });
  switch (element.kind) {
    case "stroke": return { ...element, points: element.points.map(centre) };
    case "arrow": return { ...element, points: [centre(element.points[0]), centre(element.points[1])] };
    case "area": {
      const min = { x: Math.min(element.from.x, element.to.x), y: Math.min(element.from.y, element.to.y) };
      const max = { x: Math.max(element.from.x, element.to.x) + 1, y: Math.max(element.from.y, element.to.y) + 1 };
      return { ...element, from: { x: min.x * UNITS_PER_TILE, y: min.y * UNITS_PER_TILE }, to: { x: max.x * UNITS_PER_TILE, y: max.y * UNITS_PER_TILE } };
    }
    case "label":
    case "stamp": return { ...element, at: centre(element.at) };
  }
}

function readElement(reader: Reader): PlanElement {
  const kind = KINDS[reader.byte()];
  if (!kind) throw new PlanCodeError("Код плана содержит неизвестный элемент — возможно, он из более новой версии сайта.");
  const color = reader.byte();
  if (color >= PLAN_COLORS.length) throw new PlanCodeError("Код плана содержит неизвестный цвет.");
  switch (kind) {
    case "stroke":
    case "arrow": {
      const width = reader.byte();
      if (width < MIN_WIDTH || width > MAX_WIDTH) throw new PlanCodeError("Код плана содержит неверную толщину линии.");
      const count = reader.uint();
      if (count < 1 || count > MAX_STROKE_POINTS || (kind === "arrow" && count !== 2)) throw new PlanCodeError("Код плана содержит неверную линию.");
      const points: Point[] = [];
      for (let index = 0; index < count; index += 1) points.push(reader.point(points[index - 1]));
      return kind === "arrow"
        ? { kind, color, width, points: [points[0], points[1]] }
        : { kind, color, width, points };
    }
    case "area": {
      const filled = reader.byte() === 1;
      const from = reader.point();
      return { kind, color, filled, from, to: reader.point(from) };
    }
    case "label": {
      const at = reader.point();
      const text = reader.text(MAX_LABEL_LENGTH);
      if (!text || text.length > MAX_LABEL_LENGTH) throw new PlanCodeError("Код плана содержит неверную метку.");
      return { kind, color, at, text };
    }
    case "stamp": {
      const stamp = reader.byte();
      if (stamp >= STAMPS.length) throw new PlanCodeError("Код плана содержит неизвестный значок.");
      return { kind, color, stamp, at: reader.point() };
    }
  }
}

export function encodePayload(plan: DecodedPlan): Uint8Array {
  const writer = new Writer();
  writer.uint(CODE_VERSION);
  writer.text(plan.mapId);
  writer.uint(plan.zones.length);
  for (const zone of plan.zones) {
    writer.text(zone.templateId);
    writer.point(zone.tile);
  }
  writer.uint(plan.elements.length);
  for (const element of plan.elements) writeElement(writer, element);
  return writer.finish();
}

export function decodePayload(bytes: Uint8Array): DecodedPlan {
  if (bytes.length < 5) throw new PlanCodeError("Код плана слишком короткий.");
  const body = bytes.subarray(0, bytes.length - 4);
  const expected = new DataView(bytes.buffer, bytes.byteOffset + body.length, 4).getUint32(0, true);
  if (crc32(body) !== expected) throw new PlanCodeError("Код плана повреждён: контрольная сумма не совпадает. Скопируйте его заново.");
  const reader = new Reader(body);
  const version = reader.uint();
  if (version !== 1 && version !== CODE_VERSION) throw new PlanCodeError("Код плана создан другой версией сайта и пока не поддерживается.");
  const mapId = reader.text(64);
  const zoneCount = reader.uint();
  if (zoneCount > MAX_ZONES_IN_CODE) throw new PlanCodeError("В коде плана слишком много зон.");
  const zones: PlacedZone[] = [];
  for (let index = 0; index < zoneCount; index += 1) zones.push({ templateId: reader.text(64), tile: reader.point() });
  const count = reader.uint();
  if (count > MAX_ELEMENTS) throw new PlanCodeError(`В коде плана больше ${MAX_ELEMENTS} элементов.`);
  const elements: PlanElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const element = readElement(reader);
    elements.push(version === 1 ? fromTileVersion(element) : element);
  }
  if (!reader.done) throw new PlanCodeError("Код плана повреждён.");
  return { mapId, elements, zones };
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Response(bytes as BufferSource).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encodePlan(plan: DecodedPlan): Promise<string> {
  const compressed = await pipe(encodePayload(plan), new CompressionStream("deflate-raw"));
  return CODE_PREFIX + toBase64Url(compressed);
}

/** Accepts the code with surrounding spaces or line breaks, as chat apps often add them. */
export async function decodePlan(input: string): Promise<DecodedPlan> {
  const code = input.replace(/\s+/g, "");
  if (!code) throw new PlanCodeError("Вставьте код плана.");
  if (!code.startsWith(CODE_PREFIX)) throw new PlanCodeError("Это не код плана SSMC — он должен начинаться с «SSMC1.».");
  if (code.length > MAX_CODE_LENGTH) throw new PlanCodeError("Код плана слишком длинный.");
  const body = code.slice(CODE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new PlanCodeError("Код плана содержит лишние символы — скопируйте его заново.");
  let bytes: Uint8Array;
  try {
    bytes = await pipe(fromBase64Url(body), new DecompressionStream("deflate-raw"));
  } catch {
    throw new PlanCodeError("Код плана повреждён — скопируйте его заново.");
  }
  return decodePayload(bytes);
}
