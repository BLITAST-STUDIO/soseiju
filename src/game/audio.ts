export type SfxEvent = "move" | "rotate" | "bonk" | "lock" | "clear" | "beast" | "drop" | "win" | "lose" | "chain";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private started = false;
  muted = false;
  paused = false;
  bgmLevel = 0.6;
  sfxLevel = 0.85;

  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applySfx();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.music) {
      const music = new Audio(new URL("bgm/clear-the-grid.mp3", document.baseURI).href);
      music.loop = true;
      music.preload = "auto";
      this.music = music;
    }
    this.started = true;
    this.syncMusic();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applySfx();
    this.syncMusic();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.syncMusic();
  }

  setLevels(bgm: number, sfx: number): void {
    this.bgmLevel = Math.min(1, Math.max(0, bgm));
    this.sfxLevel = Math.min(1, Math.max(0, sfx));
    this.applySfx();
    this.syncMusic();
  }

  pump(): void {
    if (!this.started || !this.music || this.music.paused === false) return;
    if (this.muted || this.bgmLevel <= 0.001) return;
    void this.music.play().catch(() => {});
  }

  play(event: SfxEvent): void {
    if (this.muted || this.sfxLevel <= 0.001 || !this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) => {
      this.toneAt(this.sfxBus!, freq, t + delay, dur, type, gain);
    };

    switch (event) {
      case "move":
        tone(220, 0.035, "square", 0.025);
        break;
      case "rotate":
        tone(520, 0.055, "sine", 0.05);
        break;
      case "bonk":
        tone(78, 0.045, "square", 0.03);
        break;
      case "lock":
        tone(110, 0.08, "triangle", 0.06);
        break;
      case "drop":
        tone(160, 0.05, "square", 0.04);
        tone(80, 0.09, "sine", 0.05, 0.02);
        break;
      case "clear":
        tone(640, 0.12, "sine", 0.055);
        tone(860, 0.14, "sine", 0.04, 0.045);
        break;
      case "beast":
        tone(500, 0.13, "triangle", 0.065);
        tone(760, 0.16, "sine", 0.05, 0.05);
        tone(1020, 0.18, "sine", 0.035, 0.1);
        break;
      case "chain":
        tone(980, 0.12, "sine", 0.05, 0.07);
        break;
      case "win":
        [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.22, "sine", 0.055, i * 0.08));
        break;
      case "lose":
        [392, 330, 262, 196].forEach((freq, i) => tone(freq, 0.24, "triangle", 0.05, i * 0.09));
        break;
      default:
        break;
    }
  }

  private applySfx(): void {
    if (!this.ctx || !this.master || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.sfxLevel, now, 0.02);
  }

  private syncMusic(): void {
    const music = this.music;
    if (!music || !this.started) return;
    const audible = !this.muted && this.bgmLevel > 0.001;
    music.volume = audible ? Math.min(1, this.bgmLevel * (this.paused ? 0.35 : 1)) : 0;
    if (!audible) {
      music.pause();
      return;
    }
    if (music.paused) void music.play().catch(() => {});
  }

  private toneAt(
    bus: GainNode,
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}
