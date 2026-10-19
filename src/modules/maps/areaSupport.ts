import type { InsertPlacement, MapAreaGrid, MapOverlay } from "./types";

/** [x, y, length] in area-grid tiles; one run covers `length` tiles to the right of x. */
export type SupportRun = [x: number, y: number, length: number];

export type RoofTier = 1 | 2 | 3 | 4;

export type RoofTierDefinition = {
  tier: RoofTier;
  label: string;
  detail: string;
  color: string;
  hatched: boolean;
};

export type RoofTierBand = RoofTierDefinition & { runs: SupportRun[]; tiles: number };

// Tiers follow the CM ceiling levels used by players: each one is named after
// the strongest support it blocks, so an area that blocks OB lands in tier 4
// regardless of the weaker flags. Bits mirror AREA_SUPPORT_FIELDS in
// ssmc-wiki-data/scripts/maps/core.py.
export const ROOF_TIERS: RoofTierDefinition[] = [
  { tier: 1, label: "Уровень 1", detail: "блокирует лазер, установку миномёта, медэвак", color: "rgba(0, 230, 240, .34)", hatched: false },
  { tier: 2, label: "Уровень 2", detail: "блокирует огонь миномёта, «Фултон», сброс снабжения", color: "rgba(245, 225, 30, .38)", hatched: false },
  { tier: 3, label: "Уровень 3", detail: "блокирует авиаудар (CAS)", color: "rgba(245, 60, 50, .42)", hatched: true },
  { tier: 4, label: "Уровень 4", detail: "блокирует орбитальный удар (OB)", color: "rgba(150, 60, 235, .48)", hatched: true },
];

const TIER_BLOCKS: Record<RoofTier, number[]> = {
  1: [2, 3, 5],
  2: [4, 1, 8],
  3: [0],
  4: [7],
};

export function isRoofTier(value: unknown): value is RoofTier {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** Highest blocked tier (1–4), or 0 for open sky. */
export function roofTier(mask: number): RoofTier | 0 {
  for (const tier of [4, 3, 2, 1] as const) {
    if (TIER_BLOCKS[tier].some((bit) => !(mask & (1 << bit)))) return tier;
  }
  return 0;
}

const CELL_OFFSET = 1 << 15;
const cellKey = (x: number, y: number) => (y + CELL_OFFSET) * (1 << 16) + (x + CELL_OFFSET);

function paintGrid(cells: Map<number, number>, grid: MapAreaGrid | null | undefined, originX: number, originY: number) {
  if (!grid) return;
  for (const row of grid.rows) {
    const y = row[0] + originY;
    for (let index = 1; index + 2 < row.length; index += 3) {
      const area = grid.types[row[index + 2]];
      if (!area) continue;
      const start = row[index] + originX;
      for (let x = start; x < start + row[index + 1]; x += 1) cells.set(cellKey(x, y), area[2]);
    }
  }
}

/** Effective support mask per tile; mirrors areaAt(): later replacing inserts win. */
export function effectiveSupportCells(overlay: MapOverlay, inserts: InsertPlacement[] = []): Map<number, number> {
  const cells = new Map<number, number>();
  paintGrid(cells, overlay.areas, 0, 0);
  for (const insert of inserts) {
    if (!insert.replaceAreas) continue;
    paintGrid(cells, overlay.insertMaps[insert.path]?.areas, insert.origin.x, insert.origin.y);
  }
  return cells;
}

/** Every roof tier with its tile runs; open sky is left out. */
export function roofTierBands(overlay: MapOverlay | undefined, inserts: InsertPlacement[]): RoofTierBand[] {
  const bands: RoofTierBand[] = ROOF_TIERS.map((definition) => ({ ...definition, runs: [], tiles: 0 }));
  if (!overlay) return bands;

  const rows = new Map<number, [x: number, tier: RoofTier][]>();
  for (const [key, mask] of effectiveSupportCells(overlay, inserts)) {
    const tier = roofTier(mask);
    if (!tier) continue;
    const y = Math.floor(key / (1 << 16)) - CELL_OFFSET;
    const x = (key % (1 << 16)) - CELL_OFFSET;
    let row = rows.get(y);
    if (!row) rows.set(y, row = []);
    row.push([x, tier]);
  }

  for (const [y, row] of rows) {
    row.sort((first, second) => first[0] - second[0]);
    let [start, tier] = row[0];
    let previous = start;
    const flush = () => {
      const band = bands[tier - 1];
      band.runs.push([start, y, previous - start + 1]);
      band.tiles += previous - start + 1;
    };
    for (let index = 1; index < row.length; index += 1) {
      const [x, next] = row[index];
      if (x === previous + 1 && next === tier) {
        previous = x;
        continue;
      }
      flush();
      start = previous = x;
      tier = next;
    }
    flush();
  }
  return bands;
}
