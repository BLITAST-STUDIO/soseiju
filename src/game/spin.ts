export type Vec = { x: number; y: number };

export type Spin = {
  s0: Vec;
  e0: Vec;
  s1: Vec;
  e1: Vec;
  dir: 1 | -1;
  u: number;
  baseC: number;
  baseR: number;
};

export const SPIN_SEC = 0.16;

export function centerOf(cell: { c: number; r: number }): Vec {
  return { x: cell.c + 0.5, y: cell.r + 0.5 };
}

export function spinEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return 1 - (1 - u) * (1 - u);
}

function pivot(s: Vec, e: Vec, dir: 1 | -1): Vec {
  if (dir === 1) {
    const y = (e.x - s.x + e.y + s.y) / 2;
    const x = s.x - e.y + y;
    return { x, y };
  }
  const x = (e.x + s.x + e.y - s.y) / 2;
  const y = s.y - e.x + x;
  return { x, y };
}

/** Quarter-turn arc. t is 0 at the start cell and 1 on the cell it lands on. */
export function swing(s: Vec, e: Vec, dir: 1 | -1, t: number): Vec {
  if (Math.hypot(e.x - s.x, e.y - s.y) < 1e-6) return { x: s.x, y: s.y };
  const p = pivot(s, e, dir);
  const ang = dir * (Math.PI / 2) * spinEase(t);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const ox = s.x - p.x;
  const oy = s.y - p.y;
  return {
    x: p.x + ox * cos - oy * sin,
    y: p.y + ox * sin + oy * cos,
  };
}

export function spunAt(spin: Spin, c: number, r: number, which: 0 | 1): Vec {
  const s = which === 0 ? spin.s0 : spin.s1;
  const e = which === 0 ? spin.e0 : spin.e1;
  const p = swing(s, e, spin.dir, spin.u);
  return { x: p.x + (c - spin.baseC), y: p.y + (r - spin.baseR) };
}
