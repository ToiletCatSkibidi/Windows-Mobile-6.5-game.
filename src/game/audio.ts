type Bus = { master: GainNode; music: GainNode; sfx: GainNode };

export class GameAudio {
  ctx: AudioContext | null = null;
  bus: Bus | null = null;
  engine: { osc: OscillatorNode; gain: GainNode; noise: AudioBufferSourceNode } | null = null;
  musicTimer = 0;
  musicNodes: OscillatorNode[] = [];
  unlocked = false;
  musicGain = 0.55;
  sfxGain = 0.8;
  muted = false;

  unlock() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    const master = this.ctx.createGain();
    const music = this.ctx.createGain();
    const sfx = this.ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    master.connect(this.ctx.destination);
    master.gain.value = this.muted ? 0 : 1;
    music.gain.value = this.musicGain * this.musicGain;
    sfx.gain.value = this.sfxGain * this.sfxGain;
    this.bus = { master, music, sfx };
    this.unlocked = true;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.startEngine();
    this.startMusic();
  }

  setVolumes(music: number, sfx: number) {
    this.musicGain = music;
    this.sfxGain = sfx;
    if (!this.bus || !this.ctx) return;
    this.bus.music.gain.setTargetAtTime(music * music, this.ctx.currentTime, 0.04);
    this.bus.sfx.gain.setTargetAtTime(sfx * sfx, this.ctx.currentTime, 0.04);
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private noiseBuffer(seconds: number) {
    if (!this.ctx) return null;
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startEngine() {
    if (!this.ctx || !this.bus || this.engine) return;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.04;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus.sfx);
    osc.start();
    const noiseBuf = this.noiseBuffer(1);
    const noise = this.ctx.createBufferSource();
    if (noiseBuf) {
      noise.buffer = noiseBuf;
      noise.loop = true;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.015;
      const nf = this.ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 900;
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(this.bus.sfx);
      noise.start();
    }
    this.engine = { osc, gain, noise };
  }

  setEngine(speed: number, max: number, airborne: boolean) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const k = airborne ? 0.35 + (speed / max) * 0.9 : 0.12;
    this.engine.osc.frequency.setTargetAtTime(48 + speed * 1.6, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.02 + k * 0.05, t, 0.08);
  }

  gun() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const buf = this.noiseBuffer(0.08);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800 + Math.random() * 600;
    src.connect(f);
    f.connect(g);
    g.connect(this.bus.sfx);
    src.start(t);
    src.stop(t + 0.08);
    const click = this.ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 220 + Math.random() * 40;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.05, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    click.connect(cg);
    cg.connect(this.bus.sfx);
    click.start(t);
    click.stop(t + 0.04);
  }

  hit() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g);
    g.connect(this.bus.sfx);
    o.start(t);
    o.stop(t + 0.13);
  }

  explosion() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const buf = this.noiseBuffer(0.5);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus.sfx);
    src.start(t);
    src.stop(t + 0.5);
    const boom = this.ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(70, t);
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.22, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    boom.connect(bg);
    bg.connect(this.bus.sfx);
    boom.start(t);
    boom.stop(t + 0.42);
  }

  ui() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 660;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g);
    g.connect(this.bus.sfx);
    o.start(t);
    o.stop(t + 0.09);
  }

  private startMusic() {
    if (!this.ctx || !this.bus) return;
    const notes = [110, 130.8, 146.8, 164.8, 196, 220];
    const play = () => {
      if (!this.ctx || !this.bus) return;
      const t = this.ctx.currentTime;
      const n = notes[Math.floor(Math.random() * notes.length)]!;
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = n;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 640;
      o.connect(f);
      f.connect(g);
      g.connect(this.bus.music);
      o.start(t);
      o.stop(t + 1.5);
    };
    play();
    window.setInterval(play, 1600);
  }
}
