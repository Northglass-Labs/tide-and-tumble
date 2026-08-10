"use client";

import { useEffect, useRef, useState } from "react";

// Fully-procedural "beach vibes" ambient generator — no audio files, no
// licensing. Everything is locked to A-major pentatonic so nothing ever clashes:
// a slow morphing pad, a synthesized ocean-wave wash (pink noise + slow LFOs),
// sparse bell plinks, and a generated-IR reverb. Muted by default; starts only
// from a user gesture (browser autoplay policy).

const LS = "obx-ambient";

// A-major pentatonic frequencies (Hz).
const PAD_DRONE = [55.0, 110.0]; // A1, A2
const PAD_POOL = [277.18, 329.63, 369.99, 440.0, 493.88, 554.37, 659.25]; // C#4 E4 F#4 A4 B4 C#5 E5
const PLINKS = [659.25, 739.99, 880.0, 987.77, 1108.73, 1318.51]; // E5 F#5 A5 B5 C#6 E6

interface PadVoice {
  g: GainNode;
  drone: boolean;
}
interface Engine {
  ctx: AudioContext;
  master: GainNode;
  dry: GainNode;
  conv: ConvolverNode;
  padVoices: PadVoice[];
  timers: number[];
  running: boolean;
  oceanStarted: boolean;
}

/** Layer a real public-domain ocean-waves recording under the synth (once). */
async function startOcean(e: Engine) {
  if (e.oceanStarted) return;
  e.oceanStarted = true;
  try {
    const res = await fetch("/audio/ocean.ogg");
    if (!res.ok) return;
    const arr = await res.arrayBuffer();
    const buf = await e.ctx.decodeAudioData(arr);
    const src = e.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = e.ctx.createGain();
    g.gain.value = 0.16;
    src.connect(g).connect(e.dry);
    src.start();
  } catch {
    // decode/fetch failed — the synthesized surf carries the ocean sound alone.
  }
}

function pinkNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const n = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function reverbIR(ctx: AudioContext, seconds = 2.8, decay = 3): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

function lfo(ctx: AudioContext, freq: number, depth: number, param: AudioParam) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
}

function padVoice(ctx: AudioContext, freq: number, dest: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  for (const cents of [-5, 5]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    o.detune.value = cents;
    o.connect(g);
    o.start();
  }
  g.connect(dest);
  return g;
}

function plink(ctx: AudioContext, freq: number, dry: AudioNode, wetSend: AudioNode) {
  const now = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.2, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.3;
  o2.connect(g2).connect(g);
  o1.connect(g);
  g.connect(dry);
  g.connect(wetSend);
  o1.start(now);
  o2.start(now);
  o1.stop(now + 2.6);
  o2.stop(now + 2.6);
}

function buildEngine(ctx: AudioContext): Engine {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  dry.connect(master);

  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  conv.connect(wet).connect(master);

  // Pad bus → lowpass → dry + reverb.
  const padBus = ctx.createGain();
  padBus.gain.value = 1;
  const padLPF = ctx.createBiquadFilter();
  padLPF.type = "lowpass";
  padLPF.frequency.value = 1600;
  padLPF.Q.value = 0.7;
  padBus.connect(padLPF);
  padLPF.connect(dry);
  padLPF.connect(conv);
  lfo(ctx, 0.08, 0.03, padBus.gain); // gentle swell
  lfo(ctx, 0.03, 300, padLPF.frequency); // filter breathe

  const padVoices: PadVoice[] = [];
  for (const f of PAD_DRONE) {
    const g = padVoice(ctx, f, padBus);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    padVoices.push({ g, drone: true });
  }
  for (const f of PAD_POOL) {
    padVoices.push({ g: padVoice(ctx, f, padBus), drone: false });
  }

  // Ocean wash: pink noise → bandpass, swept by two incommensurate LFOs.
  const noise = ctx.createBufferSource();
  noise.buffer = pinkNoiseBuffer(ctx);
  noise.loop = true;
  const bpf = ctx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 700;
  bpf.Q.value = 0.6;
  const wash = ctx.createGain();
  wash.gain.value = 0.14;
  noise.connect(bpf).connect(wash);
  wash.connect(dry);
  wash.connect(conv);
  noise.start();
  lfo(ctx, 0.06, 350, bpf.frequency);
  lfo(ctx, 0.06, 0.09, wash.gain);
  lfo(ctx, 0.037, 180, bpf.frequency);
  lfo(ctx, 0.037, 0.05, wash.gain);

  // Foam hiss.
  const noise2 = ctx.createBufferSource();
  noise2.buffer = pinkNoiseBuffer(ctx);
  noise2.loop = true;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 2000;
  const foam = ctx.createGain();
  foam.gain.value = 0.03;
  noise2.connect(hpf).connect(foam).connect(dry);
  noise2.start();
  lfo(ctx, 0.09, 0.02, foam.gain);

  return {
    ctx, master, dry, conv, padVoices, timers: [], running: false,
    oceanStarted: false,
  };
}

function startSchedulers(e: Engine) {
  if (e.running) return;
  e.running = true;
  const pool = e.padVoices.filter((v) => !v.drone);
  const morph = () => {
    const v = pool[Math.floor(Math.random() * pool.length)];
    const target = Math.random() < 0.45 ? 0 : 0.05 + Math.random() * 0.07;
    const dur = 6 + Math.random() * 6;
    v.g.gain.cancelScheduledValues(e.ctx.currentTime);
    v.g.gain.linearRampToValueAtTime(target, e.ctx.currentTime + dur);
    e.timers.push(window.setTimeout(morph, (8 + Math.random() * 8) * 1000));
  };
  morph();
  const nextPlink = () => {
    plink(e.ctx, PLINKS[Math.floor(Math.random() * PLINKS.length)], e.dry, e.conv);
    e.timers.push(window.setTimeout(nextPlink, (5 + Math.random() * 8) * 1000));
  };
  e.timers.push(window.setTimeout(nextPlink, 3000));
}

function stopSchedulers(e: Engine) {
  e.running = false;
  e.timers.forEach((t) => clearTimeout(t));
  e.timers = [];
}

export default function AmbientToggle() {
  const [on, setOn] = useState(false);
  const ref = useRef<Engine | null>(null);

  const turnOn = async () => {
    if (typeof window === "undefined") return;
    if (!ref.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      ref.current = buildEngine(new Ctx());
    }
    const e = ref.current;
    await e.ctx.resume();
    // iOS unlock: play a 1-sample silent buffer inside the gesture.
    const b = e.ctx.createBuffer(1, 1, 22050);
    const s = e.ctx.createBufferSource();
    s.buffer = b;
    s.connect(e.ctx.destination);
    s.start(0);
    startSchedulers(e);
    void startOcean(e);
    e.master.gain.cancelScheduledValues(e.ctx.currentTime);
    e.master.gain.setValueAtTime(
      Math.max(0.0001, e.master.gain.value),
      e.ctx.currentTime,
    );
    e.master.gain.exponentialRampToValueAtTime(0.5, e.ctx.currentTime + 4);
    setOn(true);
    try {
      localStorage.setItem(LS, "on");
    } catch {}
  };

  const turnOff = async () => {
    const e = ref.current;
    if (e) {
      e.master.gain.cancelScheduledValues(e.ctx.currentTime);
      e.master.gain.setValueAtTime(
        Math.max(0.0001, e.master.gain.value),
        e.ctx.currentTime,
      );
      e.master.gain.exponentialRampToValueAtTime(0.0001, e.ctx.currentTime + 1.4);
      window.setTimeout(() => {
        stopSchedulers(e);
        e.ctx.suspend().catch(() => {});
      }, 1600);
    }
    setOn(false);
    try {
      localStorage.setItem(LS, "off");
    } catch {}
  };

  // If previously enabled, resume on the first interaction (autoplay policy).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LS);
    } catch {}
    if (saved !== "on") return;
    const once = () => {
      void turnOn();
      window.removeEventListener("pointerdown", once);
    };
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause when the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      const e = ref.current;
      if (!e) return;
      if (document.hidden) e.ctx.suspend().catch(() => {});
      else if (on) e.ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [on]);

  return (
    <button
      onClick={() => (on ? turnOff() : turnOn())}
      aria-pressed={on}
      aria-label={on ? "Turn off ambient beach sounds" : "Turn on ambient beach sounds"}
      title={on ? "Beach sounds on" : "Beach sounds off"}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 grid h-11 w-11 place-items-center rounded-full bg-shell/80 text-lg shadow-[var(--shadow-float)] backdrop-blur transition active:scale-95"
    >
      {on ? "🔊" : "🔈"}
    </button>
  );
}
