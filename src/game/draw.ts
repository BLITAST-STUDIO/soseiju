import { cellsOf, COLS, dropPiece, ROWS, type Color, type Grid, type Piece } from "./logic.ts";
import type { Sim } from "./sim.ts";
import { spinEase, spunAt } from "./spin.ts";

const INK: Record<Color, { main: string; deep: string; lite: string; glow: string }> = {
  0: { main: "#ff3d8a", deep: "#b01258", lite: "#ff9ec8", glow: "rgba(255,61,138,0.55)" },
  1: { main: "#2ec8ff", deep: "#0878b0", lite: "#9aefff", glow: "rgba(46,200,255,0.5)" },
  2: { main: "#ffd23a", deep: "#c48600", lite: "#ffe99a", glow: "rgba(255,210,58,0.5)" },
};

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, radius: number, color: Color): void {
  const points = color === 0 ? 5 : color === 1 ? 4 : 6;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const ang = -Math.PI / 2 + (i * Math.PI) / points;
    const rad = i % 2 === 0 ? radius : radius * 0.42;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawStarTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  color: Color,
  alpha: number,
  ghost: boolean,
  turn = 0,
): void {
  const ink = INK[color];
  const s = cell * (ghost ? 0.72 : 0.86);
  const radius = Math.min(s * 0.2, 10);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (turn) ctx.rotate(turn);
  roundRect(ctx, -s / 2, -s / 2, s, s, radius);
  if (ghost) {
    ctx.setLineDash([Math.max(3, cell * 0.12), Math.max(3, cell * 0.09)]);
    ctx.lineWidth = Math.max(1.25, cell * 0.045);
    ctx.strokeStyle = "rgba(226, 242, 255, 0.75)";
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.shadowColor = ink.glow;
  ctx.shadowBlur = cell * 0.22;
  const fill = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
  fill.addColorStop(0, ink.lite);
  fill.addColorStop(0.45, ink.main);
  fill.addColorStop(1, ink.deep);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  starPath(ctx, s * 0.28, color);
  ctx.fill();
  ctx.restore();
}

function drawLink(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c1: Color,
  c2: Color,
  width: number,
  alpha: number,
): void {
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, INK[c1].main);
  grad.addColorStop(1, INK[c2].main);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = grad;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function antenna(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: Color, ink: string): void {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.4, h * 0.12);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x * 1.35, y - h * 0.62, x * 1.1, y - h);
  ctx.stroke();
  if (color === 1) return;
  ctx.beginPath();
  ctx.arc(x * 1.1, y - h, Math.max(1.6, h * 0.16), 0, Math.PI * 2);
  ctx.fill();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#f7fbff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.15, y, r * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = "#140c18";
  ctx.fill();
}

function drawBeast(
  ctx: CanvasRenderingContext2D,
  color: Color,
  x: number,
  y: number,
  radius: number,
  time: number,
  id: number,
): void {
  const ink = INK[color];
  const bob = Math.sin(time * 2.1 + id) * radius * 0.05;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.78, radius * 0.62, radius * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  antenna(ctx, -radius * 0.28, -radius * 0.42, radius * (color === 1 ? 0.48 : 0.7), color, ink.deep);
  antenna(ctx, radius * 0.28, -radius * 0.42, radius * 0.6, color, ink.deep);
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.08, radius * 0.78, radius * 0.66, 0, 0, Math.PI * 2);
  const body = ctx.createLinearGradient(0, -radius, 0, radius);
  body.addColorStop(0, ink.lite);
  body.addColorStop(0.55, ink.main);
  body.addColorStop(1, ink.deep);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();
  const eyeR = radius * (color === 0 ? 0.2 : 0.16);
  eye(ctx, -radius * 0.24, -radius * 0.02, eyeR);
  eye(ctx, radius * 0.24, -radius * 0.02, eyeR);
  ctx.beginPath();
  ctx.arc(0, radius * 0.2, radius * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = ink.deep;
  ctx.lineWidth = Math.max(1, radius * 0.07);
  ctx.stroke();
  ctx.restore();
}

type Sprite = { id: number; color: Color; link: number; x: number; y: number; mark: boolean };

function collect(
  grid: Grid,
  sim: Sim,
  ox: number,
  oy: number,
  cell: number,
  fallU: number,
): Sprite[] {
  const sprites: Sprite[] = [];
  const marked = new Set(sim.clearMarks.map((m) => `${m.r},${m.c}`));
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const item = grid[r]![c];
      if (item?.kind !== "star") continue;
      let dr = r;
      let dc = c;
      if (sim.phase === "fall") {
        const from = sim.fallFrom.get(item.id);
        if (from) {
          dr = from.r + (r - from.r) * fallU;
          dc = from.c;
        }
      }
      sprites.push({
        id: item.id,
        color: item.color,
        link: item.link,
        x: ox + (dc + 0.5) * cell,
        y: oy + (dr + 0.5) * cell,
        mark: marked.has(`${r},${c}`),
      });
    }
  }
  return sprites;
}

function drawHalves(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  ox: number,
  oy: number,
  cell: number,
  alpha: number,
  ghost: boolean,
): void {
  const halves = cellsOf(piece);
  const points = halves.map((half) => ({
    ...half,
    x: ox + (half.c + 0.5) * cell,
    y: oy + (half.r + 0.5) * cell,
  }));
  drawLink(
    ctx,
    points[0]!.x,
    points[0]!.y,
    points[1]!.x,
    points[1]!.y,
    points[0]!.color,
    points[1]!.color,
    cell * (ghost ? 0.08 : 0.16),
    ghost ? alpha * 0.45 : alpha,
  );
  for (const point of points) {
    drawStarTile(ctx, point.x, point.y, cell, point.color, alpha, ghost);
  }
}

function drawSprites(ctx: CanvasRenderingContext2D, sprites: Sprite[], cell: number, alpha: number): void {
  const used = new Set<number>();
  for (const sprite of sprites) {
    if (used.has(sprite.link)) continue;
    const partner = sprites.find(
      (other) =>
        other !== sprite &&
        other.link === sprite.link &&
        Math.hypot(other.x - sprite.x, other.y - sprite.y) < cell * 1.45,
    );
    if (!partner) continue;
    used.add(sprite.link);
    drawLink(ctx, sprite.x, sprite.y, partner.x, partner.y, sprite.color, partner.color, cell * 0.16, alpha);
  }
  for (const sprite of sprites) {
    const pop = sprite.mark ? 1.08 : 1;
    drawStarTile(ctx, sprite.x, sprite.y, cell * pop, sprite.color, alpha, false);
  }
}

export function draw(canvas: HTMLCanvasElement, sim: Sim, time: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const screen = ctx.createLinearGradient(0, 0, 0, cssH);
  screen.addColorStop(0, "#10192e");
  screen.addColorStop(1, "#070c18");
  ctx.fillStyle = screen;
  ctx.fillRect(0, 0, cssW, cssH);

  const margin = 6;
  const crown = 1;
  const cell = Math.max(12, Math.min(72, (cssW - margin * 2) / COLS, (cssH - margin * 2) / (ROWS + crown)));
  const ox = (cssW - cell * COLS) / 2;
  const oy = margin + cell * crown + Math.max(0, (cssH - margin * 2 - cell * (ROWS + crown)) / 2);
  sim.view = { ox, oy, cell };

  const shakeX = sim.shake ? (hash(time * 40) - 0.5) * sim.shake : 0;
  const shakeY = sim.shake ? (hash(time * 40 + 3) - 0.5) * sim.shake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, cell * COLS, cell * ROWS);
  ctx.clip();
  ctx.fillStyle = "#08101f";
  ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
  ctx.strokeStyle = "rgba(110, 186, 240, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c += 1) {
    ctx.moveTo(ox + c * cell + 0.5, oy);
    ctx.lineTo(ox + c * cell + 0.5, oy + cell * ROWS);
  }
  for (let r = 1; r < ROWS; r += 1) {
    ctx.moveTo(ox, oy + r * cell + 0.5);
    ctx.lineTo(ox + cell * COLS, oy + r * cell + 0.5);
  }
  ctx.stroke();

  const fallU = ease(sim.phase === "fall" ? sim.phaseT / Math.max(0.001, sim.phaseDur) : 1);
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const item = sim.grid[r]![c];
      if (item?.kind !== "beast") continue;
      const marked = sim.clearMarks.some((m) => m.r === r && m.c === c);
      const scale = marked ? 1.08 : 1;
      drawBeast(
        ctx,
        item.color,
        ox + (c + 0.5) * cell,
        oy + (r + 0.5) * cell,
        cell * 0.46 * scale,
        time,
        item.id,
      );
    }
  }

  if (sim.phase === "play" || sim.phase === "intro") {
    if (sim.ghost && sim.piece) {
      const ghost = dropPiece(sim.grid, sim.piece);
      if (ghost.rows > 0) drawHalves(ctx, ghost.piece, ox, oy, cell, 0.9, true);
    }
  }

  const sprites = collect(sim.grid, sim, ox, oy, cell, fallU);
  drawSprites(ctx, sprites, cell, 1);

  if (sim.flash > 0) {
    ctx.fillStyle = `rgba(255,246,223,${sim.flash * 0.35})`;
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
  }

  if (sim.phase === "intro") {
    ctx.fillStyle = "rgba(7,11,20,0.45)";
    ctx.fillRect(ox, oy + cell * 6, cell * COLS, cell * 2.4);
    ctx.fillStyle = "#f2c14e";
    ctx.font = `700 ${Math.round(cell * 0.85)}px "Zen Kaku Gothic New", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`第 ${sim.level} 面`, ox + (cell * COLS) / 2, oy + cell * 7.2);
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(150, 220, 255, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + 0.5, oy + 0.5, cell * COLS - 1, cell * ROWS - 1);

  if ((sim.phase === "play" || sim.phase === "intro") && sim.piece) {
    if (sim.spin && sim.spin.u < 1) drawSpin(ctx, sim, ox, oy, cell);
    else drawHalves(ctx, sim.piece, ox, oy, cell, 1, false);
  }

  for (const popup of sim.popups) {
    const alpha = Math.max(0, popup.life / popup.max);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#f2c14e";
    ctx.font = `700 ${Math.round(cell * 0.42)}px "Zen Kaku Gothic New", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const rise = (1 - alpha) * cell * 0.8;
    ctx.fillText(popup.text, ox + (popup.x + 0.5) * cell, oy + (popup.y + 0.5) * cell - rise);
  }
  ctx.globalAlpha = 1;

  for (const particle of sim.particles) {
    const alpha = Math.max(0, particle.life / particle.max);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK[particle.color].main;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSpin(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  ox: number,
  oy: number,
  cell: number,
): void {
  const piece = sim.piece;
  const spin = sim.spin;
  if (!piece || !spin) return;
  const a = spunAt(spin, piece.c, piece.r, 0);
  const b = spunAt(spin, piece.c, piece.r, 1);
  const ax = ox + a.x * cell;
  const ay = oy + a.y * cell;
  const bx = ox + b.x * cell;
  const by = oy + b.y * cell;
  drawLink(ctx, ax, ay, bx, by, piece.colors[0], piece.colors[1], cell * 0.16, 1);
  const ang = spin.dir * (Math.PI / 2) * spinEase(spin.u);
  drawStarTile(ctx, ax, ay, cell, piece.colors[0], 1, false, ang);
  drawStarTile(ctx, bx, by, cell, piece.colors[1], 1, false, ang);
}

function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return 1 - (1 - t) * (1 - t);
}
