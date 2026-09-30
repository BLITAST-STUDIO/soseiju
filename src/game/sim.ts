import {
  cellsOf,
  countBeasts,
  createLevelGrid,
  clearCells,
  demoGrid,
  dropPiece,
  findMatches,
  fits,
  halfCell,
  levelSpec,
  maxDrop,
  rotate,
  settle,
  shift,
  snapshotStars,
  COLS,
  ROWS,
  type Color,
  type Grid,
  type Piece,
} from "./logic.ts";
import { centerOf, spunAt, SPIN_SEC, type Spin } from "./spin.ts";
import type { SfxEvent } from "./audio.ts";

export type Phase = "title" | "intro" | "play" | "clear" | "fall" | "win" | "lose" | "pause";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: Color;
  size: number;
};

export type Popup = {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
};

export type View = { ox: number; oy: number; cell: number };

export type Sim = {
  phase: Phase;
  resume: Phase | null;
  level: number;
  score: number;
  best: number;
  chain: number;
  grid: Grid;
  piece: Piece | null;
  nextColors: [Color, Color];
  linkSeq: number;
  idSeq: number;
  fallAcc: number;
  lockAcc: number;
  lockResets: number;
  left: boolean;
  right: boolean;
  soft: boolean;
  /** Held soft-drop from the previous piece. Ignored until the key is released. */
  softStale: boolean;
  dasDir: -1 | 0 | 1;
  dasCount: number;
  dasArmed: boolean;
  dasFresh: boolean;
  bufferRot: number;
  rotQueue: (1 | -1)[];
  spin: Spin | null;
  logicAcc: number;
  ghost: boolean;
  bag: [Color, Color][];
  phaseT: number;
  phaseDur: number;
  clearMarks: { r: number; c: number }[];
  fallFrom: Map<number, { r: number; c: number }>;
  particles: Particle[];
  popups: Popup[];
  shake: number;
  flash: number;
  muted: boolean;
  reduced: boolean;
  rng: () => number;
  view: View;
  pendingSfx: SfxEvent[];
};

export function createSim(): Sim {
  return {
    phase: "title",
    resume: null,
    level: 1,
    score: 0,
    best: 0,
    chain: 0,
    grid: demoGrid(),
    piece: null,
    nextColors: [0, 1],
    linkSeq: 1,
    idSeq: 400,
    fallAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    left: false,
    right: false,
    soft: false,
    softStale: false,
    dasDir: 0,
    dasCount: 0,
    dasArmed: false,
    dasFresh: false,
    bufferRot: 0,
    rotQueue: [],
    spin: null,
    logicAcc: 0,
    ghost: true,
    bag: [],
    phaseT: 0,
    phaseDur: 0,
    clearMarks: [],
    fallFrom: new Map(),
    particles: [],
    popups: [],
    shake: 0,
    flash: 0,
    muted: false,
    reduced: false,
    rng: Math.random,
    view: { ox: 0, oy: 0, cell: 0 },
    pendingSfx: [],
  };
}

const PAIRS: readonly [Color, Color][] = [
  [0, 0],
  [1, 1],
  [2, 2],
  [0, 1],
  [0, 2],
  [1, 2],
];

function pullColors(sim: Sim): [Color, Color] {
  if (sim.bag.length === 0) {
    const next = PAIRS.map((pair) =>
      sim.rng() < 0.5 ? ([pair[0], pair[1]] as [Color, Color]) : ([pair[1], pair[0]] as [Color, Color]),
    );
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(sim.rng() * (i + 1));
      const swap = next[i]!;
      next[i] = next[j]!;
      next[j] = swap;
    }
    sim.bag = next;
  }
  return sim.bag.pop()!;
}

function takePiece(sim: Sim): Piece {
  const colors = sim.nextColors;
  sim.nextColors = pullColors(sim);
  const link = sim.linkSeq;
  sim.linkSeq += 1;
  return { c: 3, r: 0, rot: 0, colors, link };
}

function resetFall(sim: Sim): void {
  sim.fallAcc = 0;
  sim.lockAcc = 0;
  sim.lockResets = 0;
}

function armHeldDirection(sim: Sim): void {
  if (sim.left && !sim.right) sim.dasDir = -1;
  else if (sim.right && !sim.left) sim.dasDir = 1;
  else sim.dasDir = 0;
  sim.dasCount = 0;
  sim.dasArmed = false;
  sim.dasFresh = sim.dasDir !== 0;
  sim.logicAcc = 0;
}

function beginLevel(sim: Sim): void {
  const made = createLevelGrid(sim.level, sim.rng, sim.idSeq);
  sim.grid = made.grid;
  sim.idSeq = made.nextId;
  sim.bag = [];
  sim.nextColors = pullColors(sim);
  sim.piece = takePiece(sim);
  sim.chain = 0;
  sim.clearMarks = [];
  sim.fallFrom = new Map();
  sim.bufferRot = 0;
  sim.rotQueue = [];
  sim.spin = null;
  resetFall(sim);
  armHeldDirection(sim);
  if (sim.soft) sim.softStale = true;
  if (!sim.piece || !fits(sim.grid, sim.piece)) {
    sim.piece = null;
    sim.phase = "lose";
    sim.pendingSfx.push("lose");
    return;
  }
  sim.phase = "intro";
  sim.phaseT = 0;
  sim.phaseDur = sim.reduced ? 0.05 : 0.7;
}

export function startGame(sim: Sim): void {
  sim.level = 1;
  sim.score = 0;
  sim.chain = 0;
  sim.linkSeq = 1;
  sim.idSeq = 400;
  sim.rng = Math.random;
  sim.popups = [];
  sim.particles = [];
  beginLevel(sim);
}

export function continueGame(sim: Sim): void {
  if (sim.phase === "lose") {
    startGame(sim);
    return;
  }
  if (sim.phase !== "win") return;
  sim.level += 1;
  beginLevel(sim);
}

function bumpBest(sim: Sim): void {
  if (sim.score > sim.best) sim.best = sim.score;
}

function burst(sim: Sim, r: number, c: number, color: Color): void {
  const { ox, oy, cell } = sim.view;
  if (cell <= 0) return;
  const x = ox + (c + 0.5) * cell;
  const y = oy + (r + 0.5) * cell;
  const count = sim.reduced ? 4 : 9;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + sim.rng() * 0.4;
    const speed = 50 + sim.rng() * 150;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 0.35 + sim.rng() * 0.28,
      max: 0.63,
      color,
      size: cell * (0.06 + sim.rng() * 0.06),
    });
  }
}

function beginClear(sim: Sim, marks: { r: number; c: number }[]): void {
  sim.chain += 1;
  sim.phase = "clear";
  sim.phaseT = 0;
  sim.phaseDur = sim.reduced ? 0.04 : Math.min(0.36, 0.2 + sim.chain * 0.025);
  sim.clearMarks = marks;
  let stars = 0;
  let beasts = 0;
  for (const mark of marks) {
    const cell = sim.grid[mark.r]?.[mark.c];
    if (!cell) continue;
    if (cell.kind === "beast") beasts += 1;
    else stars += 1;
  }
  const gained = (stars * 100 + beasts * 500) * sim.chain;
  sim.score += gained;
  bumpBest(sim);
  sim.shake = Math.min(16, 3 + sim.chain * 2.4);
  sim.flash = Math.min(0.55, 0.22 + sim.chain * 0.06);
  sim.pendingSfx.push(beasts > 0 ? "beast" : "clear");
  if (sim.chain >= 2) sim.pendingSfx.push("chain");
  const avgC = marks.reduce((sum, m) => sum + m.c, 0) / marks.length;
  const avgR = marks.reduce((sum, m) => sum + m.r, 0) / marks.length;
  sim.popups.push({
    text: sim.chain >= 2 ? `${sim.chain}連鎖  +${gained}` : `+${gained}`,
    x: avgC,
    y: avgR,
    life: 0.95,
    max: 0.95,
  });
}

function afterStable(sim: Sim): void {
  const marks = findMatches(sim.grid);
  if (marks.length > 0) {
    beginClear(sim, marks);
    return;
  }
  if (countBeasts(sim.grid) === 0) {
    const bonus = 2000 * sim.level;
    sim.score += bonus;
    bumpBest(sim);
    sim.phase = "win";
    sim.phaseT = 0;
    sim.piece = null;
    sim.pendingSfx.push("win");
    sim.popups.push({ text: `面クリア +${bonus}`, x: 3.5, y: 2, life: 1.3, max: 1.3 });
    return;
  }
  const piece = takePiece(sim);
  if (!fits(sim.grid, piece)) {
    sim.piece = null;
    sim.phase = "lose";
    sim.pendingSfx.push("lose");
    return;
  }
  sim.piece = piece;
  sim.phase = "play";
  sim.chain = 0;
  resetFall(sim);
  releaseArrival(sim);
}

function finishClear(sim: Sim): void {
  for (const mark of sim.clearMarks) {
    const cell = sim.grid[mark.r]?.[mark.c];
    if (cell) burst(sim, mark.r, mark.c, cell.color);
  }
  sim.grid = clearCells(sim.grid, sim.clearMarks);
  sim.clearMarks = [];
  const from = snapshotStars(sim.grid);
  const settled = settle(sim.grid);
  if (settled.steps > 0) {
    sim.fallFrom = from;
    sim.grid = settled.grid;
    const drop = maxDrop(from, settled.grid);
    sim.phase = "fall";
    sim.phaseT = 0;
    sim.phaseDur = sim.reduced ? 0.04 : Math.min(0.42, 0.07 + drop * 0.05);
    return;
  }
  sim.fallFrom = new Map();
  afterStable(sim);
}

function lockPiece(sim: Sim): void {
  if (!sim.piece) return;
  const piece = sim.piece;
  if (cellsOf(piece).some((half) => half.r < 0)) {
    const dropped = shift(piece, 0, 1);
    if (fits(sim.grid, dropped)) {
      sim.piece = dropped;
      sim.lockAcc = 0;
      return;
    }
    sim.piece = null;
    sim.spin = null;
    sim.phase = "lose";
    sim.pendingSfx.push("lose");
    return;
  }
  if (!fits(sim.grid, piece)) return;
  if (sim.soft) sim.softStale = true;
  sim.spin = null;
  for (const half of cellsOf(piece)) {
    sim.grid[half.r]![half.c] = {
      kind: "star",
      id: sim.idSeq,
      color: half.color,
      link: piece.link,
    };
    sim.idSeq += 1;
  }
  sim.piece = null;
  sim.pendingSfx.push("lock");
  sim.shake = Math.max(sim.shake, 2.5);
  sim.chain = 0;
  const marks = findMatches(sim.grid);
  if (marks.length > 0) beginClear(sim, marks);
  else afterStable(sim);
}

type Hit = "ok" | "wall" | "block";

function classify(grid: Grid, piece: Piece): Hit {
  let wall = false;
  let block = false;
  for (const cell of cellsOf(piece)) {
    if (cell.c < 0 || cell.c >= COLS || cell.r < -1 || cell.r >= ROWS) wall = true;
    else if (cell.r >= 0 && grid[cell.r]![cell.c]) block = true;
  }
  if (block) return "block";
  if (wall) return "wall";
  return "ok";
}

function trySlide(sim: Sim, dir: -1 | 1, sound: boolean): Hit {
  if (sim.phase !== "play" || !sim.piece) return "block";
  const next = shift(sim.piece, dir, 0);
  const hit = classify(sim.grid, next);
  if (hit !== "ok") return hit;
  const grounded = !fits(sim.grid, shift(sim.piece, 0, 1));
  sim.piece = next;
  if (grounded && sim.lockResets < 12) {
    sim.lockAcc = 0;
    sim.lockResets += 1;
  }
  if (sound) sim.pendingSfx.push("move");
  return "ok";
}

function applyRotate(sim: Sim, dir: 1 | -1, sound: boolean): void {
  if (sim.phase !== "play" || !sim.piece) return;
  const next = rotate(sim.grid, sim.piece, dir);
  if (!next) {
    if (sound) {
      sim.pendingSfx.push("bonk");
      sim.shake = Math.max(sim.shake, 1.4);
    }
    return;
  }
  const from = sim.piece;
  const grounded = !fits(sim.grid, shift(from, 0, 1));
  let s0 = centerOf(halfCell(from, 0));
  let s1 = centerOf(halfCell(from, 1));
  if (sim.spin && sim.spin.u > 0 && sim.spin.u < 1) {
    s0 = spunAt(sim.spin, from.c, from.r, 0);
    s1 = spunAt(sim.spin, from.c, from.r, 1);
  }
  sim.piece = next;
  sim.spin = sim.reduced
    ? null
    : {
        s0,
        s1,
        e0: centerOf(halfCell(next, 0)),
        e1: centerOf(halfCell(next, 1)),
        dir,
        u: 0,
        baseC: next.c,
        baseR: next.r,
      };
  if (grounded && sim.lockResets < 12) {
    sim.lockAcc = 0;
    sim.lockResets += 1;
  }
  if (sound) sim.pendingSfx.push("rotate");
}

function releaseArrival(sim: Sim): void {
  if (sim.phase !== "play" || !sim.piece) return;
  if (sim.dasFresh && sim.dasDir !== 0) {
    const hit = trySlide(sim, sim.dasDir, true);
    sim.dasFresh = false;
    if (hit === "block") sim.dasCount = 15;
  }
  const spins = Math.max(-3, Math.min(3, sim.bufferRot));
  sim.bufferRot = 0;
  if (spins === 0) return;
  const step: 1 | -1 = spins > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(spins); i += 1) applyRotate(sim, step, false);
}

export function setLeft(sim: Sim, down: boolean): void {
  if (sim.left === down) return;
  sim.left = down;
  holdDir(sim, -1, down);
}

export function setRight(sim: Sim, down: boolean): void {
  if (sim.right === down) return;
  sim.right = down;
  holdDir(sim, 1, down);
}

function holdDir(sim: Sim, dir: -1 | 1, down: boolean): void {
  if (down) {
    const wasIntro = sim.phase === "intro";
    if (wasIntro) sim.phase = "play";
    sim.dasDir = dir;
    sim.dasCount = 0;
    sim.dasArmed = false;
    sim.dasFresh = true;
    sim.logicAcc = 0;
    if (sim.phase !== "play") return;
    if (wasIntro) {
      releaseArrival(sim);
      return;
    }
    const hit = trySlide(sim, dir, true);
    sim.dasFresh = false;
    if (hit === "block") sim.dasCount = 15;
    return;
  }
  if (sim.dasDir !== dir) return;
  if (dir === -1 && sim.right) {
    sim.dasDir = 1;
    sim.dasCount = 0;
    sim.dasArmed = false;
    sim.logicAcc = 0;
    const hit = trySlide(sim, 1, true);
    if (hit === "block") sim.dasCount = 15;
  } else if (dir === 1 && sim.left) {
    sim.dasDir = -1;
    sim.dasCount = 0;
    sim.dasArmed = false;
    sim.logicAcc = 0;
    const hit = trySlide(sim, -1, true);
    if (hit === "block") sim.dasCount = 15;
  } else {
    sim.dasDir = 0;
    sim.dasFresh = false;
  }
}

export function setSoft(sim: Sim, down: boolean): void {
  if (!down) {
    sim.soft = false;
    sim.softStale = false;
    return;
  }
  sim.softStale = false;
  if (sim.soft) return;
  sim.soft = true;
  if (sim.phase === "intro") {
    sim.phase = "play";
    releaseArrival(sim);
  }
  if (sim.phase !== "play" || !sim.piece) return;
  const next = shift(sim.piece, 0, 1);
  if (!fits(sim.grid, next)) return;
  sim.piece = next;
  sim.score += 1;
  bumpBest(sim);
  sim.fallAcc = 0;
  sim.lockAcc = 0;
}

export function rotatePiece(sim: Sim, dir: 1 | -1): void {
  if (sim.phase === "clear" || sim.phase === "fall") {
    sim.bufferRot = Math.max(-3, Math.min(3, sim.bufferRot + dir));
    return;
  }
  if (sim.phase === "intro") {
    sim.phase = "play";
    releaseArrival(sim);
  }
  if (sim.phase !== "play" || !sim.piece) return;
  if (sim.rotQueue.length < 3) sim.rotQueue.push(dir);
}

export function hardDrop(sim: Sim): void {
  if (sim.phase === "intro") {
    sim.phase = "play";
    releaseArrival(sim);
  }
  if (sim.phase !== "play" || !sim.piece) return;
  const dropped = dropPiece(sim.grid, sim.piece);
  sim.piece = dropped.piece;
  if (dropped.rows > 0) {
    sim.score += dropped.rows * 2;
    bumpBest(sim);
    sim.pendingSfx.push("drop");
  }
  lockPiece(sim);
}

export function nudge(sim: Sim, dir: -1 | 1): void {
  if (sim.phase === "clear" || sim.phase === "fall") {
    sim.dasDir = dir;
    sim.dasFresh = true;
    sim.dasCount = 0;
    sim.dasArmed = false;
    return;
  }
  if (sim.phase === "intro") {
    sim.phase = "play";
    sim.dasDir = dir;
    sim.dasFresh = true;
    sim.dasCount = 0;
    sim.dasArmed = false;
    releaseArrival(sim);
    return;
  }
  trySlide(sim, dir, true);
}

export function togglePause(sim: Sim): void {
  if (sim.phase === "pause") {
    sim.phase = sim.resume ?? "play";
    sim.resume = null;
    return;
  }
  if (sim.phase === "play" || sim.phase === "intro" || sim.phase === "clear" || sim.phase === "fall") {
    sim.resume = sim.phase;
    sim.phase = "pause";
  }
}

function pumpDas(sim: Sim, dt: number): void {
  if (sim.dasDir === 0 || sim.phase !== "play" || !sim.piece) return;
  sim.logicAcc += dt;
  let guard = 0;
  while (sim.logicAcc >= 1 / 60 && guard < 5) {
    sim.logicAcc -= 1 / 60;
    guard += 1;
    sim.dasCount += 1;
    const threshold = sim.dasArmed ? 6 : 16;
    if (sim.dasCount < threshold) continue;
    const hit = trySlide(sim, sim.dasDir, false);
    if (hit === "block") sim.dasCount = threshold - 1;
    else sim.dasCount = 0;
    sim.dasArmed = true;
  }
}

export function tick(sim: Sim, dt: number): void {
  sim.shake *= Math.exp(-dt * 7);
  if (sim.shake < 0.15) sim.shake = 0;
  sim.flash = Math.max(0, sim.flash - dt * 1.4);
  for (const particle of sim.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 520 * dt;
  }
  if (sim.particles.length > 240) sim.particles.splice(0, sim.particles.length - 240);
  sim.particles = sim.particles.filter((particle) => particle.life > 0);
  for (const popup of sim.popups) popup.life -= dt;
  sim.popups = sim.popups.filter((popup) => popup.life > 0);

  if (sim.phase === "pause" || sim.phase === "title" || sim.phase === "lose" || sim.phase === "win") {
    return;
  }
  if (sim.phase === "intro") {
    sim.phaseT += dt;
    if (sim.phaseT >= sim.phaseDur) {
      sim.phase = "play";
      releaseArrival(sim);
    }
    return;
  }
  if (sim.phase === "clear") {
    sim.phaseT += dt;
    if (sim.phaseT >= sim.phaseDur) finishClear(sim);
    return;
  }
  if (sim.phase === "fall") {
    sim.phaseT += dt;
    if (sim.phaseT >= sim.phaseDur) {
      sim.fallFrom = new Map();
      afterStable(sim);
    }
    return;
  }

  pumpDas(sim, dt);
  if (sim.spin) {
    sim.spin.u += dt / SPIN_SEC;
    if (sim.spin.u >= 1) sim.spin = null;
  }
  while (sim.rotQueue.length > 0 && sim.phase === "play") {
    const dir = sim.rotQueue.shift()!;
    applyRotate(sim, dir, true);
  }
  if (!sim.piece) return;
  const dropping = sim.soft && !sim.softStale;
  const interval = dropping ? 2 / 60 : levelSpec(sim.level).fall;
  sim.fallAcc += dt;
  let steps = 0;
  while (sim.fallAcc >= interval && steps < 4 && sim.phase === "play" && sim.piece) {
    sim.fallAcc -= interval;
    steps += 1;
    const next = shift(sim.piece, 0, 1);
    if (!fits(sim.grid, next)) break;
    sim.piece = next;
    if (dropping) {
      sim.score += 1;
      bumpBest(sim);
    }
  }
  if (sim.phase !== "play" || !sim.piece) return;
  if (sim.spin) {
    sim.lockAcc = 0;
    return;
  }
  if (!fits(sim.grid, shift(sim.piece, 0, 1))) {
    sim.lockAcc += dt;
    const window = dropping ? 2 / 60 : Math.min(0.36, Math.max(0.22, interval));
    const cap = sim.lockResets >= 12 ? 0.06 : window;
    if (sim.lockAcc >= cap) lockPiece(sim);
  } else {
    sim.lockAcc = 0;
  }
}

export function hudOf(sim: Sim): {
  phase: Phase;
  score: number;
  best: number;
  level: number;
  beasts: number;
  muted: boolean;
  chain: number;
  ghost: boolean;
  next0: Color | null;
  next1: Color | null;
} {
  return {
    phase: sim.phase,
    score: sim.score,
    best: sim.best,
    level: sim.level,
    beasts: countBeasts(sim.grid),
    muted: sim.muted,
    chain: sim.chain,
    ghost: sim.ghost,
    next0: sim.nextColors[0],
    next1: sim.nextColors[1],
  };
}
