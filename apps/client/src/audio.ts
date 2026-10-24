const MUSIC_KEY = "caos.music";
const SFX_KEY = "caos.sfx";

export type Mood = "calm" | "wild" | "duel" | "end";

const MAJOR = [0, 2, 4, 7, 9];
const MINOR = [0, 3, 5, 7, 10];

interface Song {
  id: string;
  bpm: number;
  root: number;
  scale: number[];
  melody: Array<number | null>;
  bars: number[];
  moods: Mood[];
}

function tune(pattern: string): Array<number | null> {
  return pattern.trim().split(/\s+/).map((token) => (token === "." ? null : Number(token)));
}

const SONGS: Song[] = [
  {
    id: "feira",
    bpm: 104,
    root: 60,
    scale: MAJOR,
    moods: ["calm", "wild", "duel"],
    bars: [0, 5, 7, 0, 0, 5, 7, 0],
    melody: tune(`
      0 2 4 . 4 2 0 2
      4 7 4 . 2 4 2 .
      7 4 2 4 2 0 . 2
      0 . 4 2 0 . . .
      4 4 2 4 7 4 2 .
      7 5 4 2 4 2 0 .
      2 4 7 4 2 4 0 2
      0 . . . 2 0 . .
    `),
  },
  {
    id: "rio",
    bpm: 100,
    root: 55,
    scale: MAJOR,
    moods: ["calm", "wild", "end"],
    bars: [0, 0, 5, 7, 5, 0, 7, 0],
    melody: tune(`
      0 . 2 4 2 . 4 7
      4 . 2 0 2 4 . .
      0 2 4 7 4 2 0 .
      2 0 . . 4 2 0 .
      4 2 0 2 4 7 4 2
      7 4 2 4 0 2 4 .
      2 0 4 2 7 4 2 0
      0 . . . . 2 0 .
    `),
  },
  {
    id: "trilha",
    bpm: 112,
    root: 62,
    scale: MAJOR,
    moods: ["wild", "duel"],
    bars: [0, 7, 5, 0, 0, 5, 7, 0],
    melody: tune(`
      0 4 7 4 0 4 7 .
      4 7 4 2 0 2 4 .
      7 4 0 4 7 4 2 .
      0 . 2 4 0 . . .
      0 0 4 4 7 4 2 0
      4 2 0 4 7 4 . 2
      7 4 2 0 2 4 7 4
      0 . . 4 2 0 . .
    `),
  },
  {
    id: "lume",
    bpm: 98,
    root: 53,
    scale: MAJOR,
    moods: ["calm", "end"],
    bars: [0, 5, 0, 7, 5, 0, 7, 0],
    melody: tune(`
      0 2 . 4 2 0 2 .
      4 . 2 4 7 4 . 2
      0 2 4 . 2 0 . .
      4 2 0 . . 2 0 .
      2 4 2 0 4 7 4 .
      7 4 2 0 2 4 2 .
      0 4 2 4 0 2 4 2
      0 . . . . . 2 0
    `),
  },
  {
    id: "pulo",
    bpm: 108,
    root: 57,
    scale: MAJOR,
    moods: ["wild", "duel", "calm"],
    bars: [0, 0, 7, 5, 0, 7, 5, 0],
    melody: tune(`
      0 0 2 2 4 4 2 .
      4 4 7 7 4 2 0 .
      2 4 7 4 2 0 2 4
      0 . . 2 0 . . .
      7 7 4 4 2 2 0 .
      4 2 4 7 4 2 4 .
      2 0 2 4 7 4 2 0
      0 2 0 . . . . .
    `),
  },
  {
    id: "brasa",
    bpm: 106,
    root: 64,
    scale: MINOR,
    moods: ["duel", "wild"],
    bars: [0, 5, 7, 0, 3, 5, 7, 0],
    melody: tune(`
      0 2 4 2 0 2 4 .
      4 3 2 0 2 . 0 .
      0 0 2 4 3 2 0 .
      2 0 . . 4 2 0 .
      4 4 2 4 0 2 4 2
      0 2 4 3 2 0 . .
      2 4 2 0 4 2 0 2
      0 . . . . . . .
    `),
  },
  {
    id: "praca",
    bpm: 102,
    root: 58,
    scale: MAJOR,
    moods: ["calm", "wild"],
    bars: [0, 5, 0, 7, 0, 5, 7, 0],
    melody: tune(`
      . 0 2 . 4 2 . 4
      . 7 4 . 2 4 2 .
      0 . 2 4 . 2 0 2
      . 0 . . 2 . 0 .
      . 4 4 . 2 4 7 .
      . 4 2 . 0 2 4 .
      2 . 4 7 . 4 2 0
      0 . . . . . . .
    `),
  },
  {
    id: "volta",
    bpm: 96,
    root: 60,
    scale: MAJOR,
    moods: ["end", "calm"],
    bars: [0, 5, 7, 0, 5, 3, 7, 0],
    melody: tune(`
      4 2 0 . 2 4 2 .
      0 2 4 2 0 . 4 2
      7 4 2 . 4 2 0 .
      2 0 . . . 2 4 .
      4 4 2 0 2 4 7 4
      2 0 2 4 2 0 . .
      0 2 4 7 4 2 0 2
      0 . . . . . . .
    `),
  },
];

for (const song of SONGS) {
  if (song.melody.length !== song.bars.length * 8) {
    throw new Error(`faixa ${song.id} fora do compasso`);
  }
}

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicLevel = loadLevel(MUSIC_KEY, 0.62);
let sfxLevel = loadLevel(SFX_KEY, 0.7);
let mood: Mood = "calm";
let booted = false;
let song: Song | null = null;
let songId = "";
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
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.2;
  compressor.attack.value = 0.04;
  compressor.release.value = 0.35;
  compressor.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = musicLevel;
  sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxLevel;

  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 1.4, 2.4);
  musicGain.connect(dry).connect(compressor);
  musicGain.connect(reverb).connect(wet).connect(compressor);
  sfxGain.connect(compressor);

  beginSong(pickSong());
  nextAt = ctx.currentTime + 0.15;
  schedule();
  window.setInterval(schedule, 250);
}

function pickSong() {
  const pool = SONGS.filter((item) => item.moods.includes(mood));
  const fresh = pool.filter((item) => item.id !== songId);
  const choices = fresh.length > 0 ? fresh : pool;
  return choices[Math.floor(Math.random() * choices.length)] ?? SONGS[0]!;
}

function beginSong(next: Song) {
  song = next;
  songId = next.id;
  step = 0;
  switchSoon = false;
}

function impulse(audio: AudioContext, seconds: number, decay: number) {
  const length = Math.floor(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buffer;
}

function schedule() {
  if (!ctx || !musicGain || !song) return;
  const horizon = ctx.currentTime + 1.3;
  while (nextAt < horizon) {
    const current = song;
    const eighth = 60 / current.bpm / 2;
    const loops = 2;
    if ((switchSoon && step > 0 && step % 8 === 0) || step >= current.melody.length * loops) {
      beginSong(pickSong());
      nextAt += 0.45;
      continue;
    }
    playStep(current, step % current.melody.length, nextAt);
    step += 1;
    nextAt += eighth;
  }
}

function playStep(current: Song, index: number, when: number) {
  const degree = current.melody[index];
  if (degree != null) note(degreeHz(current, degree), when, 0.2, 0.05);
  const bar = current.bars[Math.floor(index / 8)] ?? 0;
  const root = hz(current.root + bar);
  if (index % 8 === 0) {
    bass(root / 2, when, 0.075);
    note(root, when, 1.15, 0.016);
    note(hz(current.root + bar + 7), when, 1.15, 0.012);
  } else if (index % 8 === 4) {
    bass(root / 2, when, 0.05);
  }
  if (index % 4 === 2) hat(when);
}

function degreeHz(current: Song, degree: number) {
  const span = current.scale.length;
  const oct = Math.floor(degree / span);
  const semi = current.scale[degree % span] ?? 0;
  return hz(current.root + semi + oct * 12);
}

function hz(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function note(freq: number, when: number, duration: number, amount: number) {
  if (!ctx || !musicGain) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(amount, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const warm = ctx.createOscillator();
  warm.type = "sine";
  warm.frequency.value = freq;
  warm.detune.value = 6;
  osc.connect(filter);
  warm.connect(filter);
  filter.connect(gain).connect(musicGain);
  osc.start(when);
  warm.start(when);
  osc.stop(when + duration + 0.02);
  warm.stop(when + duration + 0.02);
}

function bass(freq: number, when: number, amount: number) {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.4, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(amount, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  osc.connect(gain).connect(musicGain);
  osc.start(when);
  osc.stop(when + 0.24);
}

let hatBuffer: AudioBuffer | null = null;

function hat(when: number) {
  if (!ctx || !musicGain) return;
  if (!hatBuffer) {
    const length = Math.floor(ctx.sampleRate * 0.04);
    hatBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = hatBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = hatBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 3200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.018, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  source.connect(filter).connect(gain).connect(musicGain);
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
