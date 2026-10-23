export type AudioBus = {
  unlock: () => void;
  setVolumes: (master: number, music: number, sfx: number) => void;
  play: (name: Sfx, volume?: number) => void;
  dispose: () => void;
};

export type Sfx =
  | "shot"
  | "smg"
  | "shotgun"
  | "sniper"
  | "hit"
  | "head"
  | "build"
  | "edit"
  | "break"
  | "jump"
  | "hurt"
  | "elim"
  | "reload"
  | "empty"
  | "pickup"
  | "storm"
  | "win"
  | "swing"
  | "ui";

export function createAudio(): AudioBus {
  let ctx: AudioContext | null = null;
  let master = 0.8;
  let music = 0.28;
  let sfx = 0.8;
  let musicTimer = 0;
  let step = 0;
  let disposed = false;
  const masterGainHolder: { g: GainNode | null; m: GainNode | null; s: GainNode | null } = { g: null, m: null, s: null };

  function ensure() {
    if (disposed) return null;
    if (!ctx) {
      const AC = window.AudioContext;
      ctx = new AC({ latencyHint: "interactive" });
      const g = ctx.createGain();
      const m = ctx.createGain();
      const s = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 8;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      g.gain.value = master;
      m.gain.value = music;
      s.gain.value = sfx;
      m.connect(g);
      s.connect(comp);
      comp.connect(g);
      g.connect(ctx.destination);
      masterGainHolder.g = g;
      masterGainHolder.m = m;
      masterGainHolder.s = s;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, bus: "s" | "m", slide = 0) {
    const c = ensure();
    if (!c || !masterGainHolder[bus]) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    o.connect(g);
    g.connect(masterGainHolder[bus]!);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur: number, gain: number, hp = 800) {
    const c = ensure();
    if (!c || !masterGainHolder.s) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGainHolder.s);
    src.start();
  }

  const notes = [220, 277, 330, 247, 196, 330, 370, 247];

  function musicTick() {
    if (disposed) return;
    const c = ctx;
    if (c && music > 0.01 && master > 0.01) {
      const f = notes[step % notes.length]!;
      tone(f, 0.28, "triangle", 0.05, "m");
      if (step % 4 === 0) tone(f / 2, 0.42, "sine", 0.04, "m");
      step++;
    }
    musicTimer = window.setTimeout(musicTick, 420);
  }

  function envGain(t0: number, peak: number, dur: number) {
    const c = ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    return g;
  }

  function noiseBurst(dur: number, peak: number, filter: BiquadFilterType, freq: number, q: number, when = 0) {
    const c = ensure();
    if (!c || !masterGainHolder.s) return;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const biq = c.createBiquadFilter();
    biq.type = filter;
    biq.frequency.value = freq;
    biq.Q.value = q;
    const g = envGain(t0, peak, dur);
    src.connect(biq);
    biq.connect(g);
    g.connect(masterGainHolder.s);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      biq.disconnect();
      g.disconnect();
    };
  }

  function bodyThump(freq: number, dur: number, peak: number, slide: number, when = 0) {
    const c = ensure();
    if (!c || !masterGainHolder.s) return;
    const t0 = c.currentTime + when;
    const o = c.createOscillator();
    o.type = "sine";
    const rate = 0.96 + Math.random() * 0.08;
    o.frequency.setValueAtTime(freq * rate, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(28, (freq + slide) * rate), t0 + dur);
    const g = envGain(t0, peak, dur);
    o.connect(g);
    g.connect(masterGainHolder.s);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  function gunshot(kind: "ar" | "smg" | "shotgun" | "sniper", mul: number) {
    const v = Math.max(0.08, mul) * (0.9 + Math.random() * 0.18);
    if (kind === "shotgun") {
      noiseBurst(0.09, 0.95 * v, "bandpass", 780, 0.55);
      noiseBurst(0.16, 0.4 * v, "lowpass", 320, 0.7);
      bodyThump(92, 0.18, 0.42 * v, -55);
      bodyThump(48, 0.22, 0.34 * v, -18);
      return;
    }
    if (kind === "sniper") {
      noiseBurst(0.035, 0.8 * v, "highpass", 1800, 0.7);
      noiseBurst(0.14, 0.28 * v, "bandpass", 1400, 1.4, 0.01);
      bodyThump(180, 0.08, 0.16 * v, -90);
      bodyThump(58, 0.24, 0.48 * v, -24);
      return;
    }
    if (kind === "smg") {
      noiseBurst(0.028, 0.62 * v, "bandpass", 2200, 0.85);
      bodyThump(170, 0.05, 0.16 * v, -80);
      bodyThump(80, 0.06, 0.14 * v, -30);
      return;
    }
    noiseBurst(0.05, 0.78 * v, "bandpass", 1600, 0.7);
    noiseBurst(0.07, 0.22 * v, "highpass", 3200, 0.5);
    bodyThump(140, 0.08, 0.22 * v, -70);
    bodyThump(64, 0.11, 0.26 * v, -22);
  }

  return {
    unlock() {
      ensure();
      if (!musicTimer) musicTick();
    },
    setVolumes(m, mu, s) {
      master = m / 100;
      music = mu / 100;
      sfx = s / 100;
      if (masterGainHolder.g) masterGainHolder.g.gain.value = master;
      if (masterGainHolder.m) masterGainHolder.m.gain.value = music;
      if (masterGainHolder.s) masterGainHolder.s.gain.value = sfx;
    },
    play(name, volume = 1) {
      if (sfx <= 0.01 || master <= 0.01) {
        ensure();
        return;
      }
      const vol = Math.max(0, Math.min(1.4, volume));
      switch (name) {
        case "shot":
          gunshot("ar", vol);
          break;
        case "smg":
          gunshot("smg", vol);
          break;
        case "shotgun":
          gunshot("shotgun", vol);
          break;
        case "sniper":
          gunshot("sniper", vol);
          break;
        case "swing":
          tone(240, 0.08, "triangle", 0.08, "s", 180);
          break;
        case "hit":
          tone(880, 0.05, "square", 0.07, "s");
          break;
        case "head":
          tone(1320, 0.07, "square", 0.08, "s");
          tone(1760, 0.09, "square", 0.04, "s");
          break;
        case "build":
          tone(520, 0.06, "triangle", 0.09, "s", 140);
          break;
        case "edit":
          tone(700, 0.05, "sine", 0.06, "s");
          break;
        case "break":
          noise(0.12, 0.22, 300);
          tone(140, 0.1, "triangle", 0.08, "s", -60);
          break;
        case "jump":
          tone(320, 0.08, "sine", 0.05, "s", 80);
          break;
        case "hurt":
          tone(110, 0.16, "sawtooth", 0.1, "s", -40);
          break;
        case "elim":
          tone(440, 0.1, "square", 0.07, "s");
          tone(660, 0.14, "square", 0.05, "s");
          break;
        case "reload":
          tone(300, 0.05, "square", 0.04, "s");
          tone(460, 0.06, "square", 0.04, "s");
          break;
        case "empty":
          tone(140, 0.04, "square", 0.05, "s");
          break;
        case "pickup":
          tone(620, 0.06, "sine", 0.06, "s", 200);
          break;
        case "storm":
          tone(80, 0.2, "sine", 0.05, "s");
          break;
        case "win":
          tone(523, 0.12, "triangle", 0.08, "s");
          tone(659, 0.14, "triangle", 0.08, "s");
          tone(784, 0.2, "triangle", 0.08, "s");
          break;
        case "ui":
          tone(480, 0.04, "sine", 0.04, "s");
          break;
      }
    },
    dispose() {
      disposed = true;
      window.clearTimeout(musicTimer);
      void ctx?.close();
      ctx = null;
    },
  };
}
