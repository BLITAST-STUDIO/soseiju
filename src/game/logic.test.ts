import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearCells,
  COLS,
  createLevelGrid,
  demoGrid,
  emptyGrid,
  findMatches,
  fits,
  mulberry32,
  putBeast,
  putStar,
  rotate,
  ROWS,
  settle,
  cellsOf,
  halfCell,
  type Piece,
} from "./logic.ts";
import { centerOf, swing } from "./spin.ts";
import { createSim, rotatePiece, setLeft, setSoft, tick } from "./sim.ts";

function piece(partial: Partial<Piece> & Pick<Piece, "c" | "r">): Piece {
  return {
    rot: 0,
    colors: [0, 1],
    link: 1,
    ...partial,
  };
}

describe("twin-star cohesion", () => {
  it("does not drop an overhang while the other half is supported", () => {
    const grid = emptyGrid();
    putBeast(grid, 10, 4, 2, 1);
    putStar(grid, 9, 4, 0, 2, 7);
    putStar(grid, 9, 5, 1, 3, 7);
    const settled = settle(grid);
    assert.equal(settled.steps, 0);
    assert.equal(settled.grid[9]![4]?.kind, "star");
    assert.equal(settled.grid[9]![5]?.kind, "star");
    assert.equal(settled.grid[10]![5], null);
  });

  it("drops the leftover half straight down after its support is cleared", () => {
    const grid = emptyGrid();
    putStar(grid, 6, 4, 0, 10, 2);
    putStar(grid, 7, 4, 0, 11, 3);
    putStar(grid, 8, 4, 0, 12, 4);
    putStar(grid, 9, 4, 0, 13, 7);
    putStar(grid, 9, 5, 1, 14, 7);
    putBeast(grid, 10, 4, 0, 15);
    const marks = findMatches(grid);
    const cols = marks
      .filter((p) => p.c === 4)
      .map((p) => p.r)
      .sort((a, b) => a - b);
    assert.deepEqual(cols, [6, 7, 8, 9, 10]);
    assert.equal(marks.some((p) => p.c === 5), false);
    const settled = settle(clearCells(grid, marks));
    assert.equal(settled.grid[9]![5], null);
    assert.equal(settled.grid[ROWS - 1]![5]?.kind, "star");
    assert.equal(settled.grid[ROWS - 1]![5]?.color, 1);
    for (let r = 0; r < ROWS - 1; r += 1) assert.equal(settled.grid[r]![5], null);
  });

  it("keeps a floating pair together until one side lands", () => {
    const grid = emptyGrid();
    putBeast(grid, 15, 2, 0, 1);
    putStar(grid, 0, 2, 0, 2, 9);
    putStar(grid, 0, 3, 1, 3, 9);
    const settled = settle(grid);
    assert.equal(settled.grid[14]![2]?.kind, "star");
    assert.equal(settled.grid[14]![3]?.kind, "star");
    assert.equal(settled.grid[14]![2]?.link, 9);
    assert.equal(settled.grid[15]![3], null);
  });

  it("does not let beasts fall into empty space", () => {
    const grid = emptyGrid();
    putBeast(grid, 4, 1, 1, 3);
    const settled = settle(grid);
    assert.equal(settled.steps, 0);
    assert.equal(settled.grid[4]![1]?.kind, "beast");
  });

  it("compacts separate stars in one column without leaping", () => {
    const grid = emptyGrid();
    putStar(grid, 5, 0, 0, 1, 1);
    putStar(grid, 8, 0, 1, 2, 2);
    const settled = settle(grid);
    assert.equal(settled.grid[14]![0]?.id, 1);
    assert.equal(settled.grid[15]![0]?.id, 2);
  });
});

describe("matches", () => {
  it("clears 4 and ignores 3", () => {
    const grid = emptyGrid();
    for (let c = 0; c < 3; c += 1) putStar(grid, 15, c, 0, c + 1, c + 1);
    assert.equal(findMatches(grid).length, 0);
    putBeast(grid, 15, 3, 0, 9);
    assert.equal(findMatches(grid).length, 4);
  });

  it("chains when fallen stars line up after a clear", () => {
    const grid = emptyGrid();
    for (let r = 12; r <= 15; r += 1) putBeast(grid, r, 0, 0, r);
    putStar(grid, 4, 0, 1, 21, 21);
    putStar(grid, 6, 0, 1, 22, 22);
    putStar(grid, 8, 0, 1, 23, 23);
    putStar(grid, 10, 0, 1, 24, 24);
    const first = findMatches(grid);
    assert.equal(first.length, 4);
    const mid = settle(clearCells(grid, first));
    const second = findMatches(mid.grid);
    assert.equal(second.length, 4);
    assert.ok(second.every((p) => p.c === 0 && mid.grid[p.r]![p.c]?.color === 1));
  });
});

describe("rotation", () => {
  it("stands the pill up on the left cell, left color on top", () => {
    const grid = emptyGrid();
    const spun = rotate(grid, piece({ c: 3, r: 5, rot: 0, colors: [0, 1] }), 1);
    assert.ok(spun);
    assert.equal(spun!.rot, 1);
    assert.equal(spun!.c, 3);
    const [bottom, top] = cellsOf(spun!);
    assert.deepEqual([bottom.c, bottom.r, bottom.color], [3, 5, 1]);
    assert.deepEqual([top.c, top.r, top.color], [3, 4, 0]);
  });

  it("puts the left color on the bottom when turning the other way", () => {
    const grid = emptyGrid();
    const spun = rotate(grid, piece({ c: 3, r: 5, rot: 0, colors: [0, 1] }), -1);
    assert.ok(spun);
    const [bottom, top] = cellsOf(spun!);
    assert.deepEqual([bottom.c, bottom.r, bottom.color], [3, 5, 0]);
    assert.deepEqual([top.c, top.r, top.color], [3, 4, 1]);
  });

  it("swaps colors after two turns and restores them after four", () => {
    const grid = emptyGrid();
    let current = piece({ c: 3, r: 8, rot: 0, colors: [0, 1] });
    const once = rotate(grid, current, 1);
    assert.ok(once);
    current = once!;
    const twice = rotate(grid, current, 1);
    assert.ok(twice);
    const [left, right] = cellsOf(twice!);
    assert.deepEqual([left.color, right.color, left.r, right.r], [1, 0, 8, 8]);
    current = twice!;
    for (let i = 0; i < 2; i += 1) {
      const next = rotate(grid, current, 1);
      assert.ok(next);
      current = next!;
    }
    const [a, b] = cellsOf(current);
    assert.deepEqual([a.c, a.r, a.color], [3, 8, 0]);
    assert.deepEqual([b.c, b.r, b.color], [4, 8, 1]);
  });

  it("kicks left when a vertical pill on the right wall turns flat", () => {
    const grid = emptyGrid();
    const spun = rotate(grid, piece({ c: 7, r: 5, rot: 1, colors: [0, 1] }), 1);
    assert.ok(spun);
    assert.equal(spun!.c, 6);
    const [left, right] = cellsOf(spun!);
    assert.equal(left.c, 6);
    assert.equal(right.c, 7);
    assert.equal(left.r, 5);
    assert.equal(right.r, 5);
  });

  it("kicks left off a virus, not only off the wall", () => {
    const grid = emptyGrid();
    putBeast(grid, 5, 4, 2, 1);
    const spun = rotate(grid, piece({ c: 3, r: 5, rot: 1, colors: [0, 1] }), 1);
    assert.ok(spun);
    assert.equal(spun!.c, 2);
  });

  it("does not rotate a flat pill upward into a blocked cell, and does not kick sideways", () => {
    const grid = emptyGrid();
    putBeast(grid, 4, 3, 0, 1);
    const current = piece({ c: 3, r: 5, rot: 0, colors: [0, 1] });
    assert.equal(rotate(grid, current, 1), null);
    assert.equal(rotate(grid, current, -1), null);
  });

  it("rejects a spin buried in beasts", () => {
    const grid = emptyGrid();
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) putBeast(grid, r, c, 0, r * COLS + c + 1);
    }
    grid[5]![3] = null;
    grid[5]![4] = null;
    const current = piece({ c: 3, r: 5, rot: 0 });
    assert.equal(fits(grid, current), true);
    assert.equal(rotate(grid, current, 1), null);
  });

  it("turns each half along an arc onto the cell it will occupy", () => {
    const grid = emptyGrid();
    const from = piece({ c: 3, r: 5, rot: 0, colors: [0, 1] });
    for (const dir of [1, -1] as const) {
      const to = rotate(grid, from, dir);
      assert.ok(to);
      let leftTheLine = false;
      for (const which of [0, 1] as const) {
        const s = centerOf(halfCell(from, which));
        const e = centerOf(halfCell(to!, which));
        const landed = swing(s, e, dir, 1);
        assert.ok(Math.hypot(landed.x - e.x, landed.y - e.y) < 1e-6);
        const mid = swing(s, e, dir, 0.5);
        const straight = Math.hypot(mid.x - (s.x + e.x) / 2, mid.y - (s.y + e.y) / 2);
        if (straight > 0.05) leftTheLine = true;
      }
      assert.equal(leftTheLine, true);
    }
    const stood = rotate(grid, piece({ c: 7, r: 5, rot: 1, colors: [0, 1] }), 1)!;
    const flat = piece({ c: 7, r: 5, rot: 1, colors: [0, 1] });
    for (const which of [0, 1] as const) {
      const s = centerOf(halfCell(flat, which));
      const e = centerOf(halfCell(stood, which));
      const landed = swing(s, e, 1, 1);
      assert.ok(Math.hypot(landed.x - e.x, landed.y - e.y) < 1e-6);
    }
  });
});

describe("levels", () => {
  function longest(grid: ReturnType<typeof emptyGrid>): number {
    let best = 0;
    for (let r = 0; r < ROWS; r += 1) {
      let run = 1;
      for (let c = 1; c < COLS; c += 1) {
        const prev = grid[r]![c - 1];
        const cell = grid[r]![c];
        if (prev && cell && prev.color === cell.color) {
          run += 1;
          best = Math.max(best, run);
        } else run = 1;
      }
    }
    for (let c = 0; c < COLS; c += 1) {
      let run = 1;
      for (let r = 1; r < ROWS; r += 1) {
        const prev = grid[r - 1]![c];
        const cell = grid[r]![c];
        if (prev && cell && prev.color === cell.color) {
          run += 1;
          best = Math.max(best, run);
        } else run = 1;
      }
    }
    return best;
  }

  it("scatters beasts with no ready-made line of 3", () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      for (const level of [1, 5, 10]) {
        const { grid } = createLevelGrid(level, mulberry32(seed * 100 + level), 1);
        assert.equal(findMatches(grid).length, 0);
        assert.ok(longest(grid) < 3);
        assert.ok(grid.some((row, r) => r < 3 && row.every((cell) => cell === null)));
      }
    }
  });

  it("rebuilds the same bottle from the same seed", () => {
    const a = createLevelGrid(7, mulberry32(99), 1);
    const b = createLevelGrid(7, mulberry32(99), 1);
    assert.deepEqual(a.grid, b.grid);
  });

  it("title bottle shows the overhang and is not already clearing", () => {
    const grid = demoGrid();
    assert.equal(findMatches(grid).length, 0);
    assert.equal(settle(grid).steps, 0);
    assert.equal(grid[12]![4]?.kind, "star");
    assert.equal(grid[13]![4], null);
  });
});

describe("feel", () => {
  it("slides into a gap on the next frame after falling past a blocker", () => {
    const sim = createSim();
    sim.phase = "play";
    sim.level = 1;
    sim.grid = emptyGrid();
    putBeast(sim.grid, 4, 2, 0, 1);
    for (let r = 5; r < ROWS; r += 1) putBeast(sim.grid, r, 1, 2, 20 + r);
    for (let c = 0; c < COLS; c += 1) {
      if (!sim.grid[15]![c]) putBeast(sim.grid, 15, c, 1, 10 + c);
    }
    sim.piece = { c: 3, r: 4, rot: 0, colors: [0, 1], link: 3 };
    setLeft(sim, true);
    assert.equal(sim.piece.c, 3);
    for (let i = 0; i < 70; i += 1) tick(sim, 1 / 60);
    assert.ok(sim.piece);
    assert.equal(sim.piece!.c, 2);
  });

  it("remembers a spin pressed while the bottle is clearing", () => {
    const sim = createSim();
    sim.phase = "clear";
    sim.phaseT = 0;
    sim.phaseDur = 0.05;
    sim.grid = emptyGrid();
    putBeast(sim.grid, 15, 0, 0, 1);
    sim.clearMarks = [];
    sim.nextColors = [0, 1];
    sim.rng = mulberry32(3);
    rotatePiece(sim, 1);
    tick(sim, 0.08);
    assert.equal(sim.phase, "play");
    assert.equal(sim.piece?.rot, 1);
  });

  it("does not carry a held soft drop onto the next piece", () => {
    const sim = createSim();
    sim.phase = "play";
    sim.level = 1;
    sim.grid = emptyGrid();
    putBeast(sim.grid, 15, 3, 2, 1);
    putBeast(sim.grid, 15, 4, 2, 2);
    sim.piece = { c: 3, r: 14, rot: 0, colors: [0, 1], link: 1 };
    sim.soft = true;
    sim.rng = mulberry32(1);
    tick(sim, 1 / 60);
    tick(sim, 1 / 60);
    assert.equal(sim.phase, "play");
    assert.equal(sim.piece?.r, 0);
    for (let i = 0; i < 18; i += 1) tick(sim, 1 / 60);
    assert.equal(sim.piece?.r, 0);
    setSoft(sim, false);
    setSoft(sim, true);
    assert.equal(sim.piece?.r, 1);
  });
});
