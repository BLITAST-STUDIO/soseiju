export const COLS = 8;
export const ROWS = 16;
export const MATCH = 4;

export type Color = 0 | 1 | 2;
export type Rot = 0 | 1 | 2 | 3;

export type Star = { kind: "star"; id: number; color: Color; link: number };
export type Beast = { kind: "beast"; id: number; color: Color };
export type Cell = Star | Beast | null;
export type Grid = Cell[][];

export type Piece = {
  c: number;
  r: number;
  rot: Rot;
  colors: [Color, Color];
  link: number;
};

export type Half = { c: number; r: number; color: Color };

/** Orbiter is gone: the anchor is the lower-left cell of a 2×2 box, and it stays filled.
 *  Screen +y is down. Horizontal pills sit on the anchor row; vertical pills
 *  rise into the cell above the anchor (the neck, r = -1, is open air).
 *  Clockwise twice swaps colors. Vertical → horizontal may kick one cell left.
 */
const TO_HORIZONTAL: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
];
const TO_VERTICAL: readonly (readonly [number, number])[] = [[0, 0]];

export function emptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function cellsOf(piece: Piece): [Half, Half] {
  const vertical = piece.rot === 1 || piece.rot === 3;
  if (!vertical) {
    const swapped = piece.rot === 2;
    return [
      { c: piece.c, r: piece.r, color: swapped ? piece.colors[1] : piece.colors[0] },
      { c: piece.c + 1, r: piece.r, color: swapped ? piece.colors[0] : piece.colors[1] },
    ];
  }
  const clockwise = piece.rot === 1;
  return [
    { c: piece.c, r: piece.r, color: clockwise ? piece.colors[1] : piece.colors[0] },
    { c: piece.c, r: piece.r - 1, color: clockwise ? piece.colors[0] : piece.colors[1] },
  ];
}

export function halfCell(piece: Piece, which: 0 | 1): { c: number; r: number } {
  const vertical = piece.rot === 1 || piece.rot === 3;
  if (!vertical) {
    const leftIs0 = piece.rot === 0;
    const onLeft = which === 0 ? leftIs0 : !leftIs0;
    return { c: piece.c + (onLeft ? 0 : 1), r: piece.r };
  }
  const topIs0 = piece.rot === 1;
  const onTop = which === 0 ? topIs0 : !topIs0;
  return { c: piece.c, r: piece.r - (onTop ? 1 : 0) };
}

export function shift(piece: Piece, dc: number, dr: number): Piece {
  return { ...piece, c: piece.c + dc, r: piece.r + dr };
}

export function fits(grid: Grid, piece: Piece): boolean {
  for (const cell of cellsOf(piece)) {
    if (cell.c < 0 || cell.c >= COLS || cell.r < -1 || cell.r >= ROWS) return false;
    if (cell.r < 0) continue;
    if (grid[cell.r]![cell.c]) return false;
  }
  return true;
}

export function rotate(grid: Grid, piece: Piece, dir: 1 | -1): Piece | null {
  const rot = ((piece.rot + dir + 4) % 4) as Rot;
  const kicks = rot === 0 || rot === 2 ? TO_HORIZONTAL : TO_VERTICAL;
  for (const [dc, dr] of kicks) {
    const next: Piece = { ...piece, rot, c: piece.c + dc, r: piece.r + dr };
    if (fits(grid, next)) return next;
  }
  return null;
}

export function dropPiece(grid: Grid, piece: Piece): { piece: Piece; rows: number } {
  let current = piece;
  let rows = 0;
  for (;;) {
    const next = shift(current, 0, 1);
    if (!fits(grid, next)) return { piece: current, rows };
    current = next;
    rows += 1;
  }
}

type Pos = { r: number; c: number };

function partnerAt(grid: Grid, r: number, c: number, link: number): Pos | null {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (const [dc, dr] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
    const other = grid[nr]![nc];
    if (other?.kind === "star" && other.link === link) return { r: nr, c: nc };
  }
  return null;
}

type Body = Pos[];

function bodies(grid: Grid): Body[] {
  const used: boolean[][] = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const found: Body[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = grid[r]![c];
      if (!cell || cell.kind !== "star" || used[r]![c]) continue;
      const partner = partnerAt(grid, r, c, cell.link);
      if (partner && !used[partner.r]![partner.c]) {
        used[r]![c] = true;
        used[partner.r]![partner.c] = true;
        found.push([
          { r, c },
          { r: partner.r, c: partner.c },
        ]);
      } else {
        used[r]![c] = true;
        found.push([{ r, c }]);
      }
    }
  }
  return found;
}

/**
 * A linked pair is one rigid body. It falls only when EVERY half has room
 * directly underneath. One supported half holds the overhanging half up.
 * Beasts never fall. A half whose partner is gone falls alone, straight down.
 */
function canFall(grid: Grid, body: Body): boolean {
  const own = new Set(body.map((p) => `${p.r},${p.c}`));
  for (const { r, c } of body) {
    const nr = r + 1;
    if (nr >= ROWS) return false;
    if (own.has(`${nr},${c}`)) continue;
    if (grid[nr]![c]) return false;
  }
  return true;
}

export function gravityStep(grid: Grid): { grid: Grid; moved: boolean } {
  const falling = bodies(grid).filter((body) => canFall(grid, body));
  if (falling.length === 0) return { grid, moved: false };
  const next = cloneGrid(grid);
  for (const body of falling) {
    for (const p of body) next[p.r]![p.c] = null;
  }
  for (const body of falling) {
    for (const p of body) next[p.r + 1]![p.c] = grid[p.r]![p.c] ?? null;
  }
  return { grid: next, moved: true };
}

export function settle(grid: Grid): { grid: Grid; steps: number } {
  let current = grid;
  let steps = 0;
  while (steps <= ROWS + 2) {
    const step = gravityStep(current);
    if (!step.moved) return { grid: current, steps };
    current = step.grid;
    steps += 1;
  }
  return { grid: current, steps };
}

export function findMatches(grid: Grid): Pos[] {
  const mark = new Set<string>();
  const paint = (cells: Pos[]) => {
    if (cells.length >= MATCH) {
      for (const p of cells) mark.add(`${p.r},${p.c}`);
    }
  };

  for (let r = 0; r < ROWS; r += 1) {
    let c = 0;
    while (c < COLS) {
      const cell = grid[r]![c];
      if (!cell) {
        c += 1;
        continue;
      }
      const run: Pos[] = [{ r, c }];
      let n = c + 1;
      while (n < COLS && grid[r]![n]?.color === cell.color) {
        run.push({ r, c: n });
        n += 1;
      }
      paint(run);
      c = n;
    }
  }

  for (let c = 0; c < COLS; c += 1) {
    let r = 0;
    while (r < ROWS) {
      const cell = grid[r]![c];
      if (!cell) {
        r += 1;
        continue;
      }
      const run: Pos[] = [{ r, c }];
      let n = r + 1;
      while (n < ROWS && grid[n]![c]?.color === cell.color) {
        run.push({ r: n, c });
        n += 1;
      }
      paint(run);
      r = n;
    }
  }

  return [...mark].map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { r: r ?? 0, c: c ?? 0 };
  });
}

export function clearCells(grid: Grid, marks: Pos[]): Grid {
  const next = cloneGrid(grid);
  for (const m of marks) next[m.r]![m.c] = null;
  return next;
}

export function countBeasts(grid: Grid): number {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) if (cell?.kind === "beast") n += 1;
  }
  return n;
}

export function snapshotStars(grid: Grid): Map<number, Pos> {
  const map = new Map<number, Pos>();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = grid[r]![c];
      if (cell?.kind === "star") map.set(cell.id, { r, c });
    }
  }
  return map;
}

export function maxDrop(from: Map<number, Pos>, grid: Grid): number {
  let max = 0;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = grid[r]![c];
      if (cell?.kind !== "star") continue;
      const prev = from.get(cell.id);
      if (prev) max = Math.max(max, r - prev.r);
    }
  }
  return max;
}

export function levelSpec(level: number): { beasts: number; zone: number; fall: number } {
  const safe = Math.max(1, Math.floor(level));
  return {
    beasts: Math.min(12 + (safe - 1) * 4, 64),
    zone: Math.min(6 + Math.floor((safe - 1) / 2), 13),
    fall: Math.max(0.14, 0.9 - (safe - 1) * 0.065),
  };
}

function virusColor(index: number, rng: () => number): Color {
  const slot = index % 4;
  if (slot === 0) return 2;
  if (slot === 1) return 0;
  if (slot === 2) return 1;
  return Math.floor(rng() * 3) as Color;
}

/** Same color two cells away would let a third virus complete a line during generation. */
function colorForbidden(grid: Grid, r: number, c: number, color: Color): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (const [dc, dr] of dirs) {
    const rr = r + dr * 2;
    const cc = c + dc * 2;
    if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
    if (grid[rr]![cc]?.color === color) return true;
  }
  return false;
}

function longestColorRun(grid: Grid): number {
  let best = 0;
  for (let r = 0; r < ROWS; r += 1) {
    let c = 0;
    while (c < COLS) {
      const cell = grid[r]![c];
      if (!cell) {
        c += 1;
        continue;
      }
      let n = c + 1;
      while (n < COLS && grid[r]![n]?.color === cell.color) n += 1;
      best = Math.max(best, n - c);
      c = n;
    }
  }
  for (let c = 0; c < COLS; c += 1) {
    let r = 0;
    while (r < ROWS) {
      const cell = grid[r]![c];
      if (!cell) {
        r += 1;
        continue;
      }
      let n = r + 1;
      while (n < ROWS && grid[n]![c]?.color === cell.color) n += 1;
      best = Math.max(best, n - r);
      r = n;
    }
  }
  return best;
}

export function createLevelGrid(
  level: number,
  rng: () => number,
  idStart: number,
): { grid: Grid; nextId: number } {
  const spec = levelSpec(level);
  const minR = ROWS - spec.zone;
  const spots: Pos[] = [];
  for (let r = minR; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) spots.push({ r, c });
  }

  let best = emptyGrid();
  let bestCount = -1;
  let bestId = idStart;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const grid = emptyGrid();
    let id = idStart;
    let placed = 0;
    for (let i = 0; i < spec.beasts; i += 1) {
      const color = virusColor(i, rng);
      const start = Math.floor(rng() * spots.length);
      let chosen: Pos | null = null;
      for (let k = 0; k < spots.length; k += 1) {
        const spot = spots[(start + k) % spots.length]!;
        if (grid[spot.r]![spot.c]) continue;
        if (colorForbidden(grid, spot.r, spot.c, color)) continue;
        chosen = spot;
        break;
      }
      if (!chosen) break;
      grid[chosen.r]![chosen.c] = { kind: "beast", id, color };
      id += 1;
      placed += 1;
    }
    if (placed > bestCount && longestColorRun(grid) < MATCH) {
      best = grid;
      bestCount = placed;
      bestId = id;
    }
    if (placed === spec.beasts) return { grid, nextId: id };
  }

  return { grid: best, nextId: bestId };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function putStar(grid: Grid, r: number, c: number, color: Color, id: number, link: number): void {
  grid[r]![c] = { kind: "star", id, color, link };
}

function putBeast(grid: Grid, r: number, c: number, color: Color, id: number): void {
  grid[r]![c] = { kind: "beast", id, color };
}

/** Title-screen bottle: an overhanging twin-star resting on one beast. */
export function demoGrid(): Grid {
  const grid = emptyGrid();
  const bedA: Color[] = [0, 1, 2, 0, 1, 2, 0, 1];
  const bedB: Color[] = [1, 2, 0, 1, 2, 0, 1, 2];
  bedA.forEach((color, c) => putBeast(grid, 15, c, color, 100 + c));
  bedB.forEach((color, c) => putBeast(grid, 14, c, color, 110 + c));
  const row13: (Color | null)[] = [2, 0, 1, 2, null, 0, 2, 1];
  row13.forEach((color, c) => {
    if (color !== null) putBeast(grid, 13, c, color, 120 + c);
  });
  putStar(grid, 12, 3, 0, 201, 50);
  putStar(grid, 12, 4, 1, 202, 50);
  putStar(grid, 11, 6, 2, 203, 51);
  putStar(grid, 12, 6, 0, 204, 51);
  putBeast(grid, 11, 1, 1, 130);
  putBeast(grid, 10, 2, 0, 131);
  putBeast(grid, 10, 5, 1, 132);
  putBeast(grid, 9, 4, 2, 133);
  putBeast(grid, 8, 1, 0, 134);
  return grid;
}

export function starAt(grid: Grid, r: number, c: number): Star | null {
  const cell = grid[r]?.[c];
  return cell?.kind === "star" ? cell : null;
}

export { putStar, putBeast };
