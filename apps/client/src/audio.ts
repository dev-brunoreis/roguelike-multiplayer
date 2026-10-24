import { compose, drumAt, type Hit, type Mood, type Song } from "./music.js";

const MUSIC_KEY = "caos.music";
const SFX_KEY = "caos.sfx";

export type { Mood };

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let leadBus: GainNode | null = null;
let rhythmBus: GainNode | null = null;
let echo: DelayNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicLevel = loadLevel(MUSIC_KEY, 0.62);
let sfxLevel = loadLevel(SFX_KEY, 0.7);
let mood: Mood = "calm";
let booted = false;
let song: Song | null = null;
let melodyAt: Hit[][] = [];
let harmonyAt: Hit[][] = [];
let bassAt: Hit[][] = [];
let arpAt: Hit[][] = [];
let step = 0;
let nextAt = 0;
let switchSoon = false;
let voices = 0;

function loadLevel(key: string, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return clamp01(value);
  } catch {
    return fallback;
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function readMix() {
  return { music: musicLevel, sfx: sfxLevel };
}

export function setMusicVolume(value: number) {
  musicLevel = clamp01(value);
  try { localStorage.setItem(MUSIC_KEY, String(musicLevel)); } catch { /* ignore */ }
  if (musicGain) musicGain.gain.value = musicLevel;
}

export function setSfxVolume(value: number) {
  sfxLevel = clamp01(value);
  try { localStorage.setItem(SFX_KEY, String(sfxLevel)); } catch { /* ignore */ }
  if (sfxGain) sfxGain.gain.value = sfxLevel;
}

export function setMood(next: Mood) {
  if (next === mood) return;
  mood = next;
  switchSoon = true;
}

export function unlockAudio() {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  ctx ??= new AudioCtx();
  if (ctx.state === "suspended") void ctx.resume().then(() => boot());
  else boot();
}

function boot() {
  if (!ctx || booted) return;
  booted = true;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 16;
  compressor.ratio.value = 2.4;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.22;
  compressor.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = musicLevel;
  sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxLevel;
  leadBus = ctx.createGain();
  rhythmBus = ctx.createGain();

  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
  echo = ctx.createDelay(1);
  echo.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.24;
  leadBus.connect(dry).connect(musicGain);
  leadBus.connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(musicGain);
  rhythmBus.connect(musicGain);
  musicGain.connect(compressor);
  sfxGain.connect(compressor);

  noiseBuffer = noiseBed(ctx, 0.25);
  beginSong(compose(mood));
  nextAt = ctx.currentTime + 0.12;
  schedule();
  window.setInterval(schedule, 200);
}

function beginSong(next: Song) {
  song = next;
  melodyAt = bin(next.melody, next.steps);
  harmonyAt = bin(next.harmony, next.steps);
  bassAt = bin(next.bass, next.steps);
  arpAt = bin(next.arp, next.steps);
  step = 0;
  switchSoon = false;
  if (echo && ctx) {
    const dotted = Math.min(0.42, (60 / next.bpm) * 0.75);
    echo.delayTime.setTargetAtTime(dotted, ctx.currentTime, 0.08);
  }
}

function bin(hits: Hit[], steps: number) {
  const slots: Hit[][] = Array.from({ length: steps }, () => []);
  for (const hit of hits) {
    if (hit.step >= 0 && hit.step < steps) slots[hit.step]!.push(hit);
  }
  return slots;
}

function noiseBed(audio: AudioContext, seconds: number) {
  const length = Math.floor(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function schedule() {
  if (!ctx || !musicGain || !song) return;
  const horizon = ctx.currentTime + 0.5;
  while (nextAt < horizon) {
    const current = song;
    const sixteenth = 60 / current.bpm / 4;
    const index = step % current.steps;
    const pass = Math.floor(step / current.steps);
    const barLine = index % 16 === 0;
    const finished = step > 0 && index === 0 && pass >= 2;
    const swap = switchSoon && step > 0 && (barLine || step < 16);
    if (finished || swap) {
      beginSong(compose(mood));
      nextAt += 0.05;
      continue;
    }
    playStep(current, index, pass, nextAt, sixteenth);
    step += 1;
    nextAt += sixteenth;
  }
}

function playStep(current: Song, index: number, pass: number, when: number, sixteenth: number) {
  const section = Math.floor(index / 64);
  const harmonyOn = pass === 1 || section === 2;
  for (const hit of melodyAt[index] ?? []) {
    const duration = held(hit.length, sixteenth);
    square(hz(current.root + hit.semi), when, duration, current.lead, current.bright, true);
    if (current.wide) square(hz(current.root + hit.semi - 12), when, duration, current.lead * 0.32, current.bright * 0.7, false);
  }
  if (harmonyOn) {
    for (const hit of harmonyAt[index] ?? []) {
      square(hz(current.root + hit.semi), when, held(hit.length, sixteenth), current.lead * 0.38, current.bright * 0.75, false);
    }
  }
  for (const hit of bassAt[index] ?? []) triangle(hz(current.root + hit.semi), when, held(hit.length, sixteenth), 0.078);
  for (const hit of arpAt[index] ?? []) {
    square(hz(current.root + hit.semi), when, Math.max(0.04, hit.length * sixteenth * 0.55), 0.016, current.bright * 0.55, false);
  }
  const stepInBar = index % 16;
  const bar = Math.floor(index / 16);
  const fill = (current.mood === "wild" || current.mood === "duel") && bar === 11 && stepInBar >= 8;
  const drum = drumAt(current.mood, current.drum, stepInBar, fill);
  if (drum.kick) kick(when, current.mood === "end" ? 0.05 : 0.08);
  if (drum.snare) snare(when, current.mood === "calm" ? 0.03 : 0.042);
  if (drum.hat === "closed") hat(when, current.mood === "end" ? 0.01 : 0.016, 0.03);
  if (drum.hat === "open") hat(when, 0.014, 0.09);
}

function held(length: number, sixteenth: number) {
  return Math.max(0.05, length * sixteenth - 0.02);
}

function hz(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function square(freq: number, when: number, duration: number, amount: number, bright: number, sing: boolean) {
  if (!ctx || !leadBus || freq < 40) return;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, when);
  if (sing && duration > 0.22) {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(freq * 0.006, when + Math.min(0.2, duration * 0.45));
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(when);
    lfo.stop(when + duration + 0.05);
  }
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  const end = Math.max(duration, 0.05);
  filter.frequency.setValueAtTime(Math.max(220, bright * 0.3), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, bright), when + Math.min(0.04, end * 0.4));
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(amount, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + end);
  osc.connect(filter).connect(gain).connect(leadBus);
  osc.start(when);
  osc.stop(when + end + 0.02);
}

function triangle(freq: number, when: number, duration: number, amount: number) {
  if (!ctx || !rhythmBus || freq < 30) return;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  const end = Math.max(0.06, duration);
  osc.frequency.setValueAtTime(freq * 1.3, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + Math.min(0.04, end * 0.35));
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(amount, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + end);
  osc.connect(gain).connect(rhythmBus);
  osc.start(when);
  osc.stop(when + end + 0.02);
}

function kick(when: number, amount: number) {
  if (!ctx || !rhythmBus) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(168, when);
  osc.frequency.exponentialRampToValueAtTime(48, when + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amount, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  osc.connect(gain).connect(rhythmBus);
  osc.start(when);
  osc.stop(when + 0.16);
}

function snare(when: number, amount: number) {
  if (!ctx || !rhythmBus) return;
  burst(when, amount, 0.12, "bandpass", 1800);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(196, when);
  osc.frequency.exponentialRampToValueAtTime(120, when + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amount * 0.45, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
  osc.connect(gain).connect(rhythmBus);
  osc.start(when);
  osc.stop(when + 0.11);
}

function hat(when: number, amount: number, decay: number) {
  burst(when, amount, decay, "highpass", 6500);
}

function burst(when: number, amount: number, decay: number, type: BiquadFilterType, freq: number) {
  if (!ctx || !rhythmBus || !noiseBuffer) return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amount, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  source.connect(filter).connect(gain).connect(rhythmBus);
  source.start(when);
}

function occupy() {
  if (!ctx || !sfxGain || sfxLevel <= 0.001 || voices >= 8) return false;
  voices += 1;
  return true;
}

function releaseLater(seconds: number) {
  window.setTimeout(() => {
    voices = Math.max(0, voices - 1);
  }, seconds * 1000 + 30);
}

function tone(freq: number, duration: number, type: OscillatorType, amount: number, slideTo?: number) {
  if (!occupy() || !ctx || !sfxGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), ctx.currentTime + duration);
  gain.gain.setValueAtTime(amount, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(sfxGain);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
  releaseLater(duration);
}

function noise(duration: number, amount: number, freq: number) {
  if (!occupy() || !ctx || !sfxGain) return;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amount, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  source.connect(filter).connect(gain).connect(sfxGain);
  source.start();
  releaseLater(duration);
}

export function sfxSwing(amount = 1) {
  noise(0.06, 0.05 * amount, 1600);
  tone(240, 0.08, "triangle", 0.04 * amount, 90);
}

export function sfxCast(amount = 1) {
  tone(540, 0.1, "sine", 0.045 * amount, 260);
}

export function sfxShot(amount = 1) {
  tone(780, 0.045, "sine", 0.03 * amount, 420);
}

export function sfxHurt(amount = 1) {
  tone(108, 0.14, "sine", 0.07 * amount, 54);
  noise(0.07, 0.04 * amount, 320);
}

export function sfxCrit() {
  tone(880, 0.09, "triangle", 0.05, 1320);
}

export function sfxPick() {
  tone(523, 0.12, "sine", 0.04);
  tone(784, 0.16, "sine", 0.03);
}

export function sfxUi() {
  tone(640, 0.035, "sine", 0.025);
}

interface HeardFx {
  id: number;
  kind: string;
  x: number;
  y: number;
}

interface HeardShot {
  id: number;
  x: number;
  y: number;
}

let primed = false;
let seenFx = new Set<number>();
let seenShots = new Set<number>();

export function resetHear() {
  primed = false;
  seenFx = new Set();
  seenShots = new Set();
}

export function hearWorld(fx: HeardFx[], shots: HeardShot[], origin: { x: number; y: number } | null) {
  if (!primed) {
    seenFx = new Set(fx.map((item) => item.id));
    seenShots = new Set(shots.map((item) => item.id));
    primed = true;
    return;
  }
  const freshFx = fx.filter((item) => !seenFx.has(item.id));
  const freshShots = shots.filter((item) => !seenShots.has(item.id));
  seenFx = new Set(fx.map((item) => item.id));
  seenShots = new Set(shots.map((item) => item.id));
  const ranked = freshFx
    .map((item) => ({ item, amount: falloff(item.x, item.y, origin) }))
    .filter((entry) => entry.amount > 0.08)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  for (const entry of ranked) {
    if (entry.item.kind === "slash" || entry.item.kind === "cone") sfxSwing(entry.amount);
    else sfxCast(entry.amount);
  }
  const shot = freshShots
    .map((item) => ({ item, amount: falloff(item.x, item.y, origin) }))
    .sort((a, b) => b.amount - a.amount)[0];
  if (shot && shot.amount > 0.12) sfxShot(shot.amount * 0.85);
}

function falloff(x: number, y: number, origin: { x: number; y: number } | null) {
  if (!origin) return 0.45;
  const distance = Math.hypot(x - origin.x, y - origin.y);
  return Math.max(0, 1 - distance / 26);
}
