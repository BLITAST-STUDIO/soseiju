import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Sfx } from "@/game/audio";
import { draw } from "@/game/draw";
import type { Color } from "@/game/logic";
import {
  continueGame,
  createSim,
  hardDrop,
  hudOf,
  nudge,
  rotatePiece,
  setLeft,
  setRight,
  setSoft,
  startGame,
  tick,
  togglePause,
  type Phase,
  type Sim,
} from "@/game/sim";

const BEST_KEY = "soseiju-best-v1";
const MUTE_KEY = "soseiju-mute-v1";
const GHOST_KEY = "soseiju-ghost-v1";
const BGM_KEY = "soseiju-bgm-v1";
const SFX_KEY = "soseiju-sfx-v1";
const NAMES = ["トゲボシ", "ルナゲ", "コガネ"] as const;

if (typeof document !== "undefined") {
  const deck = new URL("world/deck.jpg", document.baseURI).href;
  document.documentElement.style.setProperty("--deck", `url("${deck}")`);
}

type Hud = ReturnType<typeof hudOf>;

function readNumber(key: string): number {
  try {
    const value = Number(localStorage.getItem(key) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<Sfx | null>(null);
  const heldRef = useRef({
    left: new Set<string>(),
    right: new Set<string>(),
    soft: new Set<string>(),
  });
  const dragRef = useRef<{
    x0: number;
    y0: number;
    x: number;
    accX: number;
    t: number;
    moved: boolean;
  } | null>(null);
  if (!simRef.current) simRef.current = createSim();
  if (!audioRef.current) audioRef.current = new Sfx();

  const [hud, setHud] = useState<Hud>(() => hudOf(simRef.current!));
  const [bgmVol, setBgmVol] = useState(60);
  const [sfxVol, setSfxVol] = useState(85);
  const [padDir, setPadDir] = useState<PadDir>(null);

  useEffect(() => {
    const sim = simRef.current!;
    const audio = audioRef.current!;
    sim.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saved = readNumber(BEST_KEY);
    if (saved > sim.best) sim.best = saved;
    const muted = localStorage.getItem(MUTE_KEY) === "1";
    sim.muted = muted;
    audio.setMuted(muted);
    sim.ghost = localStorage.getItem(GHOST_KEY) !== "0";
    const savedBgm = localStorage.getItem(BGM_KEY);
    const savedSfx = localStorage.getItem(SFX_KEY);
    const bgm = savedBgm === null ? 60 : Math.min(100, Math.max(0, Number(savedBgm) || 0));
    const sfx = savedSfx === null ? 85 : Math.min(100, Math.max(0, Number(savedSfx) || 0));
    setBgmVol(bgm);
    setSfxVol(sfx);
    audio.setLevels(bgm / 100, sfx / 100);
    setHud(hudOf(sim));

    let writtenBest = sim.best;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(sim, dt);
      audio.setPaused(sim.phase === "pause");
      audio.pump();
      const canvas = canvasRef.current;
      if (canvas) draw(canvas, sim, now / 1000);
      for (const event of sim.pendingSfx) {
        audio.play(event);
        if (!sim.reduced && navigator.vibrate) {
          if (event === "lock" || event === "drop") navigator.vibrate(12);
          else if (event === "clear" || event === "beast") navigator.vibrate([8, 28, 12]);
        }
      }
      sim.pendingSfx.length = 0;
      if (sim.best !== writtenBest) {
        writtenBest = sim.best;
        try {
          localStorage.setItem(BEST_KEY, String(sim.best));
        } catch {
          /* ignore quota */
        }
      }
      const next = hudOf(sim);
      setHud((prev) => (sameHud(prev, next) ? prev : next));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const code = event.code;
      if (
        code === "ArrowLeft" ||
        code === "ArrowRight" ||
        code === "ArrowDown" ||
        code === "ArrowUp" ||
        code === "Space" ||
        code === "KeyA" ||
        code === "KeyD" ||
        code === "KeyS" ||
        code === "KeyW" ||
        code === "KeyZ" ||
        code === "KeyX" ||
        code === "KeyG" ||
        code === "KeyP" ||
        code === "KeyM" ||
        code === "Enter" ||
        code === "Escape"
      ) {
        event.preventDefault();
      }
      audio.unlock();
      if (code === "ArrowLeft" || code === "KeyA") press("left", code, true);
      else if (code === "ArrowRight" || code === "KeyD") press("right", code, true);
      else if (code === "ArrowDown" || code === "KeyS") press("soft", code, true);
      else if (code === "ArrowUp" || code === "KeyX" || code === "KeyW") rotatePiece(sim, 1);
      else if (code === "KeyZ") rotatePiece(sim, -1);
      else if (code === "KeyG") toggleGhost();
      else if (code === "Space" || code === "Enter") onConfirm();
      else if (code === "Escape" || code === "KeyP") togglePause(sim);
      else if (code === "KeyM") toggleMute();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const code = event.code;
      if (code === "ArrowLeft" || code === "KeyA") press("left", code, false);
      else if (code === "ArrowRight" || code === "KeyD") press("right", code, false);
      else if (code === "ArrowDown" || code === "KeyS") press("soft", code, false);
    };
    const onHide = () => {
      if (!document.hidden) {
        audio.unlock();
        return;
      }
      if (sim.phase === "play" || sim.phase === "intro" || sim.phase === "clear" || sim.phase === "fall") {
        togglePause(sim);
      }
    };
    const stopBrowserGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, button, .pad, .icon-btn")) return;
      event.preventDefault();
    };
    document.addEventListener("touchmove", stopBrowserGesture, { passive: false });
    document.addEventListener("gesturestart", stopBrowserGesture);
    document.addEventListener("gesturechange", stopBrowserGesture);
    document.addEventListener("selectstart", stopBrowserGesture);
    document.addEventListener("contextmenu", stopBrowserGesture);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("touchmove", stopBrowserGesture);
      document.removeEventListener("gesturestart", stopBrowserGesture);
      document.removeEventListener("gesturechange", stopBrowserGesture);
      document.removeEventListener("selectstart", stopBrowserGesture);
      document.removeEventListener("contextmenu", stopBrowserGesture);
    };
    // press/toggleMute close over refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function press(dir: "left" | "right" | "soft", code: string, down: boolean) {
    const sim = simRef.current!;
    const bag = heldRef.current[dir];
    const before = bag.size;
    if (down) bag.add(code);
    else bag.delete(code);
    if (down && before === 0) {
      if (dir === "left") setLeft(sim, true);
      if (dir === "right") setRight(sim, true);
      if (dir === "soft") setSoft(sim, true);
    } else if (!down && bag.size === 0) {
      if (dir === "left") setLeft(sim, false);
      if (dir === "right") setRight(sim, false);
      if (dir === "soft") setSoft(sim, false);
    }
  }

  function unlock() {
    audioRef.current!.unlock();
  }

  function toggleMute() {
    const sim = simRef.current!;
    const audio = audioRef.current!;
    sim.muted = !sim.muted;
    audio.setMuted(sim.muted);
    try {
      localStorage.setItem(MUTE_KEY, sim.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    setHud(hudOf(sim));
  }

  function setBgm(value: number) {
    unlock();
    setBgmVol(value);
    audioRef.current!.setLevels(value / 100, sfxVol / 100);
    try {
      localStorage.setItem(BGM_KEY, String(value));
    } catch {
      /* ignore quota */
    }
  }

  function setSfx(value: number) {
    unlock();
    setSfxVol(value);
    audioRef.current!.setLevels(bgmVol / 100, value / 100);
    try {
      localStorage.setItem(SFX_KEY, String(value));
    } catch {
      /* ignore quota */
    }
  }

  function toggleGhost() {
    const sim = simRef.current!;
    sim.ghost = !sim.ghost;
    try {
      localStorage.setItem(GHOST_KEY, sim.ghost ? "1" : "0");
    } catch {
      /* ignore */
    }
    setHud(hudOf(sim));
  }

  function onConfirm() {
    const sim = simRef.current!;
    unlock();
    if (sim.phase === "title" || sim.phase === "lose") startGame(sim);
    else if (sim.phase === "win") continueGame(sim);
    else if (sim.phase === "pause") togglePause(sim);
    else hardDrop(sim);
  }

  function tapButton(event: ReactPointerEvent<HTMLButtonElement>, action: () => void) {
    if (event.button !== 0) return;
    event.preventDefault();
    unlock();
    action();
  }

  function onDpadDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    unlock();
    const el = event.currentTarget;
    const id = event.pointerId;
    const dropArmed = { fired: false };
    const apply = (x: number, y: number) => {
      const dir = dpadDirection(el, x, y);
      press("left", "pad", dir === "left");
      press("right", "pad", dir === "right");
      press("soft", "pad", dir === "soft");
      if (dir === "drop") {
        if (!dropArmed.fired) {
          dropArmed.fired = true;
          hardDrop(simRef.current!);
        }
      } else {
        dropArmed.fired = false;
      }
      setPadDir(dir);
    };
    apply(event.clientX, event.clientY);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      apply(ev.clientX, ev.clientY);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      press("left", "pad", false);
      press("right", "pad", false);
      press("soft", "pad", false);
      setPadDir(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  const playing =
    hud.phase === "play" || hud.phase === "intro" || hud.phase === "clear" || hud.phase === "fall";
  const banner = bannerFor(hud.phase, hud.level, hud.score);

  return (
    <main className="world relative flex h-dvh w-full flex-col overflow-hidden text-fg select-none">
      <header className="topbar flex shrink-0 items-center gap-3 pb-2">
        <div className="min-w-0">
          <p className="kicker">観測甲板</p>
          <h1 className="font-display text-2xl leading-none tracking-[0.14em] sm:text-3xl">双星獣</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="icon-btn" aria-label={hud.ghost ? "着地予測を消す" : "着地予測を出す"} aria-pressed={hud.ghost} onClick={() => { unlock(); toggleGhost(); }}>
            <span className="text-xs font-bold">{hud.ghost ? "予" : "—"}</span>
          </button>
          <button type="button" className="icon-btn" aria-label={hud.muted ? "音を出す" : "音を消す"} onClick={() => { unlock(); toggleMute(); }}>
            {hud.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {hud.phase !== "title" && hud.phase !== "win" && hud.phase !== "lose" ? (
            <button type="button" className="icon-btn" aria-label={hud.phase === "pause" ? "つづける" : "一時停止"} onClick={() => { unlock(); togglePause(simRef.current!); }}>
              <Pause size={18} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="cockpit">
        <aside className="side side-left">
          <p className="side-title">ちいさな星獣<br />ひかるつながり</p>
          <p className="side-copy">同色が縦か横に四つそろうと、星獣ごと消える。</p>
          <div className="plaque">
            <p>はみ出した星は、支えがあるあいだ落ちない。</p>
          </div>
          <div className="plaque">
            <p>支えが消えると、残った星は真下へ落ちる。</p>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {NAMES.map((name, index) => (
              <span key={name} className="legend">
                <StarFace color={index as Color} />
                {name}
              </span>
            ))}
          </div>
        </aside>

        <div className="well-slot">
          <div className="well-frame">
            <canvas
              ref={canvasRef}
              className="h-full w-full touch-none"
              aria-label="観測槽。二連の星で星獣を消す"
              onPointerDown={(event) => {
                if (!playing && hud.phase !== "pause") return;
                if (event.button !== 0) return;
                event.preventDefault();
                unlock();
                const pointerId = event.pointerId;
                const drag = {
                  x0: event.clientX,
                  y0: event.clientY,
                  x: event.clientX,
                  accX: 0,
                  t: performance.now(),
                  moved: false,
                };
                dragRef.current = drag;
                const move = (ev: PointerEvent) => {
                  if (ev.pointerId !== pointerId) return;
                  const sim = simRef.current;
                  if (!sim) return;
                  const dx = ev.clientX - drag.x;
                  drag.x = ev.clientX;
                  drag.accX += dx;
                  const step = Math.max(22, sim.view.cell || 28);
                  while (drag.accX >= step) {
                    drag.accX -= step;
                    drag.moved = true;
                    nudge(sim, 1);
                  }
                  while (drag.accX <= -step) {
                    drag.accX += step;
                    drag.moved = true;
                    nudge(sim, -1);
                  }
                  const totalDx = ev.clientX - drag.x0;
                  const totalDy = ev.clientY - drag.y0;
                  if (totalDy > 36 && totalDy > Math.abs(totalDx) * 1.15) press("soft", "drag", true);
                };
                const up = (ev: PointerEvent) => {
                  if (ev.pointerId !== pointerId) return;
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  window.removeEventListener("pointercancel", up);
                  dragRef.current = null;
                  press("soft", "drag", false);
                  const sim = simRef.current;
                  if (!sim) return;
                  const dx = ev.clientX - drag.x0;
                  const dy = ev.clientY - drag.y0;
                  const dt = Math.max(1, performance.now() - drag.t);
                  if (!drag.moved && Math.hypot(dx, dy) < 16) {
                    const canvas = canvasRef.current;
                    const mid = canvas
                      ? canvas.getBoundingClientRect().left + sim.view.ox + (8 * sim.view.cell) / 2
                      : ev.clientX;
                    rotatePiece(sim, ev.clientX < mid ? -1 : 1);
                  } else if (dy < -64 && -dy > Math.abs(dx) * 1.35 && -dy / dt > 0.85) {
                    hardDrop(sim);
                  }
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
              }}
            />
            {banner ? (
              <div className="pointer-events-none absolute inset-x-0 top-4 px-3 text-center">
                <p className="font-display text-2xl text-gold">{banner.title}</p>
                <p className="mt-1 text-sm text-fg">{banner.sub}</p>
              </div>
            ) : null}
          </div>
          <div className="stats">
            <div className="rail rail-left">
              <Panel label="NEXT">
                <div className="next-stars">
                  <StarFace color={hud.next0!} large />
                  <StarFace color={hud.next1!} large />
                </div>
              </Panel>
              <Panel label="SCORE">
                <p className="hud-value">{hud.score.toLocaleString("ja-JP")}</p>
              </Panel>
              <p className="meta-line meta-split">面 {hud.phase === "title" ? "—" : hud.level}</p>
            </div>
            <div className="rail rail-right">
              <Panel label="CHAIN">
                <p className="hud-value hud-value-gold">
                  {hud.chain}
                  {hud.chain >= 2 ? <span className="hud-mult">x{hud.chain}</span> : null}
                </p>
              </Panel>
              <Panel label="BEST">
                <p className="hud-value">{hud.best.toLocaleString("ja-JP")}</p>
              </Panel>
              <p className="meta-line meta-split">星獣 {hud.beasts}</p>
            </div>
            <p className="meta-line meta-full">面 {hud.phase === "title" ? "—" : hud.level} · 星獣 {hud.beasts}</p>
          </div>
        </div>
      </div>

      <footer className="footer shrink-0">
        <div className="vol-row">
          <label>
            曲
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={bgmVol}
              aria-label="曲の音量"
              onChange={(event) => setBgm(Number(event.target.value))}
            />
          </label>
          <label>
            効果
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sfxVol}
              aria-label="効果音の音量"
              onChange={(event) => setSfx(Number(event.target.value))}
            />
          </label>
        </div>
        {playing ? (
          <div className="pad">
            <div
              className={`dpad${padDir ? ` is-${padDir}` : ""}`}
              role="group"
              aria-label="移動。上で一気に落とす、左右で移動、下で速く落とす"
              onPointerDown={onDpadDown}
            >
              <svg className="dpad-shape" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <linearGradient id="dpadFace" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
                    <stop offset="0%" stopColor="#5d82a8" />
                    <stop offset="48%" stopColor="#2c4662" />
                    <stop offset="100%" stopColor="#15283c" />
                  </linearGradient>
                </defs>
                <rect x="31" y="2" width="38" height="96" rx="19" fill="url(#dpadFace)" />
                <rect x="2" y="31" width="96" height="38" rx="19" fill="url(#dpadFace)" />
              </svg>
              <span className="dpad-glow dpad-glow-up" />
              <span className="dpad-glow dpad-glow-down" />
              <span className="dpad-glow dpad-glow-left" />
              <span className="dpad-glow dpad-glow-right" />
              <div className="dpad-mark dpad-up">
                <ChevronsDown size={18} />
                落
              </div>
              <div className="dpad-mark dpad-left">
                <ArrowLeft size={22} />
              </div>
              <div className="dpad-mark dpad-right">
                <ArrowRight size={22} />
              </div>
              <div className="dpad-mark dpad-down">
                <ArrowDown size={22} />
              </div>
            </div>
            <div className="face" aria-label="回転">
              <button
                type="button"
                className="pad-btn face-btn face-b"
                aria-label="左回転"
                onPointerDown={(event) => tapButton(event, () => rotatePiece(simRef.current!, -1))}
              >
                <RotateCcw size={16} />
                B
              </button>
              <button
                type="button"
                className="pad-btn face-btn face-a"
                aria-label="右回転"
                onPointerDown={(event) => tapButton(event, () => rotatePiece(simRef.current!, 1))}
              >
                <RotateCw size={16} />
                A
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <button type="button" className="h-12 w-full rounded-full bg-gold text-base font-bold text-gold-ink" onClick={onConfirm}>
              {hud.phase === "win" ? "つぎの面" : hud.phase === "lose" ? "もう一度" : hud.phase === "pause" ? "つづける" : "はじめる"}
            </button>
            {hud.phase === "title" ? (
              <p className="text-center text-xs text-muted">左手は十字（上で一気に）· 右手はBとA · ←→ · Z/X · ↓</p>
            ) : null}
          </div>
        )}
      </footer>
    </main>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="hud-card">
      <p className="hud-label">{label}</p>
      {children}
    </section>
  );
}

function StarFace({ color, large = false }: { color: Color; large?: boolean }) {
  return <span className={`star-face star-face-${color} ${large ? "star-face-lg" : ""}`}>★</span>;
}

type PadDir = "left" | "right" | "soft" | "drop" | null;

function dpadDirection(el: HTMLElement, clientX: number, clientY: number): PadDir {
  const rect = el.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "drop" : "soft";
}

function sameHud(a: Hud, b: Hud): boolean {
  return (
    a.phase === b.phase &&
    a.score === b.score &&
    a.best === b.best &&
    a.level === b.level &&
    a.beasts === b.beasts &&
    a.muted === b.muted &&
    a.chain === b.chain &&
    a.ghost === b.ghost &&
    a.next0 === b.next0 &&
    a.next1 === b.next1
  );
}

function bannerFor(phase: Phase, level: number, score: number): { title: string; sub: string } | null {
  if (phase === "win") return { title: `第 ${level} 面クリア`, sub: "星獣を一掃した" };
  if (phase === "lose") return { title: "槽がふさがった", sub: `得点 ${score.toLocaleString("ja-JP")}` };
  if (phase === "pause") return { title: "一時停止", sub: "つづけると再開" };
  return null;
}
