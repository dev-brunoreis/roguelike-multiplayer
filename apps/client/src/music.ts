export type Mood = "calm" | "wild" | "duel" | "end"

export interface Hit {
  step: number
  semi: number
  length: number
  degree: number
}

export interface Song {
  bpm: number
  root: number
  steps: number
  melody: Hit[]
  harmony: Hit[]
  bass: Hit[]
  arp: Hit[]
  drum: number
  mood: Mood
  wide: boolean
  bright: number
  lead: number
}

export interface Drum {
  kick: boolean
  snare: boolean
  hat: "off" | "closed" | "open"
}

const BARS = 16
const STEPS = BARS * 16

const SCALE: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
}

const HOOKS = [
  [0, 2, 4, 5, 4, 2, 1, 0],
  [0, 0, 2, 4, 5, 4, 2, 0],
  [2, 2, 4, 5, 7, 5, 4, 2],
  [0, 4, 2, 5, 4, 2, 4, 0],
  [4, 2, 0, 1, 2, 4, 2, 0],
  [0, 1, 2, 4, 2, 5, 4, 2],
  [7, 5, 4, 2, 4, 5, 2, 0],
  [0, 2, 3, 5, 3, 2, 1, 0],
  [2, 4, 5, 4, 2, 0, 2, 4],
  [0, 5, 4, 2, 1, 2, 4, 5],
  [4, 4, 5, 4, 2, 1, 2, 0],
  [0, 2, 4, 7, 5, 4, 2, 0],
]

const RHYTHM: Record<Mood, number[][]> = {
  calm: [
    [0, 4, 8, 12],
    [0, 4, 6, 8, 12],
    [0, 2, 4, 8, 12, 14],
    [0, 6, 8, 12],
    [0, 4, 8, 10, 12],
    [2, 4, 8, 12, 14],
  ],
  wild: [
    [0, 2, 4, 6, 8, 10, 12, 14],
    [0, 2, 4, 7, 8, 10, 12, 14],
    [0, 3, 4, 6, 8, 10, 12, 15],
    [0, 2, 4, 6, 8, 11, 12, 14],
    [0, 2, 6, 8, 10, 12, 14],
    [0, 4, 6, 8, 10, 12, 14],
  ],
  duel: [
    [0, 2, 4, 6, 8, 10, 12, 14],
    [0, 2, 4, 7, 8, 10, 12, 14],
    [0, 3, 4, 6, 8, 10, 12, 14],
    [0, 2, 4, 6, 8, 11, 12, 14],
    [0, 2, 6, 8, 10, 12, 15],
  ],
  end: [
    [0, 4, 8, 12],
    [0, 6, 8, 14],
    [0, 4, 8, 10],
    [0, 4, 10, 12],
    [2, 6, 8, 12],
  ],
}

const PROGRESS: Record<string, number[][]> = {
  major: [
    [0, 5, 3, 0],
    [0, 3, 4, 0],
    [0, 4, 3, 0],
    [0, 5, 4, 0],
    [0, 3, 5, 0],
    [0, 1, 4, 0],
    [5, 3, 4, 0],
  ],
  minor: [
    [0, 5, 3, 0],
    [0, 3, 4, 0],
    [0, 6, 5, 0],
    [0, 5, 2, 0],
    [0, 4, 5, 0],
    [5, 3, 4, 0],
  ],
  bridgeMajor: [
    [3, 4, 5, 4],
    [1, 4, 0, 4],
    [5, 3, 0, 4],
    [3, 5, 1, 4],
  ],
  bridgeMinor: [
    [3, 4, 5, 4],
    [6, 5, 3, 4],
    [5, 2, 6, 4],
    [3, 6, 5, 4],
  ],
}

const BASS: Array<Array<number | null>> = [
  [0, null, null, null, 2, null, null, null],
  [0, null, 0, null, 2, null, 0, null],
  [0, null, 2, null, 3, null, 2, null],
  [0, null, null, 1, null, null, 2, null],
  [0, 0, null, 2, null, 2, 0, null],
]

const ARP_STEPS: Record<Mood, number[][]> = {
  calm: [
    [4, 12],
    [2, 6, 10, 14],
    [4, 7, 12, 15],
  ],
  wild: [
    [0, 2, 4, 6, 8, 10, 12, 14],
    [0, 2, 4, 7, 8, 10, 12, 15],
    [0, 3, 4, 7, 8, 11, 12, 15],
  ],
  duel: [
    [0, 2, 4, 6, 8, 10, 12, 14],
    [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
    [0, 2, 4, 7, 8, 10, 12, 15],
  ],
  end: [[]],
}

const CYCLES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [1, 2, 3, 2],
]

interface Rng {
  float(): number
  int(max: number): number
  pick<T>(items: readonly T[]): T
}

function rngOf(random: () => number): Rng {
  return {
    float: () => random(),
    int: (max) => Math.floor(random() * max),
    pick: (items) => items[Math.floor(random() * items.length)]!,
  }
}

function semiOf(scale: number[], degree: number) {
  const oct = Math.floor(degree / 7)
  const wrapped = degree - oct * 7
  return scale[wrapped]! + oct * 12
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function singable(degrees: number[]) {
  const out = degrees.slice()
  out[0] = clamp(out[0] ?? 0, -1, 9)
  for (let i = 1; i < out.length; i += 1) {
    out[i] = clamp(out[i] ?? 0, -1, 9)
    const leap = out[i]! - out[i - 1]!
    if (Math.abs(leap) > 5) out[i] = clamp(out[i - 1]! + Math.sign(leap) * 5, -1, 9)
  }
  for (let i = 1; i < out.length - 1; i += 1) {
    const leap = out[i]! - out[i - 1]!
    const next = out[i + 1]! - out[i]!
    if (Math.abs(leap) >= 4 && next !== 0 && Math.sign(next) === Math.sign(leap)) {
      out[i + 1] = clamp(out[i]! - Math.sign(leap), -1, 9)
    }
  }
  return out
}

function fit(hook: readonly number[], count: number, rng: Rng) {
  if (hook.length === count) return hook.slice()
  if (hook.length > count) {
    const start = rng.int(hook.length - count + 1)
    return hook.slice(start, start + count)
  }
  const out = hook.slice()
  while (out.length < count) {
    const last = out[out.length - 1] ?? 0
    out.push(clamp(last + (last > 4 ? -1 : 1), -1, 9))
  }
  return out
}

function vary(hook: number[], rng: Rng) {
  let next = hook.slice()
  if (rng.float() < 0.35) {
    const pivot = 4
    next = next.map((degree) => pivot - (degree - pivot))
    const floor = Math.min(...next)
    if (floor < 0) next = next.map((degree) => degree - floor)
  }
  if (rng.float() < 0.2) next.reverse()
  return next
}

function openEnd(degrees: number[], rng: Rng) {
  const out = degrees.slice()
  const last = out.length - 1
  const target = rng.pick([2, 4, 5])
  if (last > 0) {
    const leap = target - (out[last - 1] ?? 0)
    if (Math.abs(leap) > 4) out[last - 1] = target - Math.sign(leap) * 2
  }
  out[last] = target
  return out
}

function closeEnd(degrees: number[]) {
  const out = degrees.slice()
  const last = out.length - 1
  if (last <= 0) {
    out[0] = 0
    return out
  }
  const neighbors = [-1, 1, 6]
  const prev = out[last - 1] ?? 0
  const approach = neighbors.includes(prev)
    ? prev
    : neighbors.reduce((best, item) => (Math.abs(item - prev) < Math.abs(best - prev) ? item : best))
  out[last - 1] = approach
  out[last] = approach >= 4 ? 7 : 0
  return out
}

function voiceHits(scale: number[], degrees: number[], attacks: number[], origin: number, span: number, maxHold: number, finalHold: number) {
  const hits: Hit[] = []
  for (let i = 0; i < degrees.length; i += 1) {
    const eighth = origin + attacks[i]!
    const next = i + 1 < degrees.length ? origin + attacks[i + 1]! : origin + span
    let length = Math.min(maxHold, Math.max(1, (next - eighth) * 2))
    if (i === degrees.length - 1 && finalHold > 0) length = Math.max(length, Math.min(16, finalHold))
    const degree = degrees[i] ?? 0
    hits.push({ step: eighth * 2, degree, semi: semiOf(scale, degree), length })
  }
  return hits
}

function shift(hits: Hit[], bars: number) {
  const delta = bars * 16
  return hits.map((hit) => ({ ...hit, step: hit.step + delta }))
}

function phrase(scale: number[], hook: number[], attacks: number[], rng: Rng, maxHold: number, close: boolean, lift: number) {
  const shaped = singable(vary(fit(hook, attacks.length, rng), rng).map((degree) => degree + lift))
  const question = openEnd(shaped, rng)
  const answer = close ? closeEnd(shaped) : openEnd(shaped, rng)
  return [
    ...voiceHits(scale, question, attacks, 0, 16, maxHold, 0),
    ...voiceHits(scale, answer, attacks, 16, 16, maxHold, close ? 8 : 0),
  ]
}

function chordAt(home: number[], bridge: number[], bar: number) {
  if (bar >= 8 && bar < 12) return bridge[bar - 8] ?? 0
  return home[bar % 4] ?? 0
}

function bassSemi(scale: number[], chord: number, tone: number) {
  const step = [0, 2, 4, 7][tone] ?? 0
  let semi = semiOf(scale, chord + step)
  while (semi > 12) semi -= 12
  while (semi < 0) semi += 12
  return semi - 12
}

function arpSemi(scale: number[], chord: number, tone: number) {
  const root = semiOf(scale, chord)
  const step = [0, 2, 4, 7][tone] ?? 0
  let semi = semiOf(scale, chord + step)
  while (semi < root) semi += 12
  while (semi > root + 12) semi -= 12
  if (semi > 16) semi -= 12
  return semi
}

function modePool(mood: Mood) {
  if (mood === "calm") return ["major", "major", "mixolydian", "dorian"]
  if (mood === "wild") return ["major", "dorian", "mixolydian", "minor"]
  if (mood === "duel") return ["minor", "harmonic", "dorian", "minor"]
  return ["minor", "dorian", "harmonic"]
}

function tempoOf(mood: Mood, rng: Rng) {
  const pool = {
    calm: [96, 100, 104, 108, 112],
    wild: [126, 130, 134, 138],
    duel: [138, 142, 146, 150],
    end: [78, 82, 86, 90],
  }[mood]
  return rng.pick(pool)
}

function colorOf(mood: Mood) {
  if (mood === "end") return { bright: 1700, lead: 0.05 }
  if (mood === "calm") return { bright: 2400, lead: 0.062 }
  if (mood === "wild") return { bright: 3000, lead: 0.066 }
  return { bright: 3400, lead: 0.068 }
}

export function compose(mood: Mood, random: () => number = Math.random): Song {
  const rng = rngOf(random)
  const mode = rng.pick(modePool(mood))
  const scale = SCALE[mode] ?? SCALE.major!
  const minor = mode === "minor" || mode === "dorian" || mode === "harmonic"
  const home = rng.pick(minor ? PROGRESS.minor! : PROGRESS.major!)
  const bridge = rng.pick(minor ? PROGRESS.bridgeMinor! : PROGRESS.bridgeMajor!)
  const attacks = rng.pick(RHYTHM[mood])
  const bridgeAttacks = rng.pick(RHYTHM[mood].filter((item) => item !== attacks).concat([attacks]))
  const hook = rng.pick(HOOKS)
  const otherHook = rng.float() < 0.55 ? rng.pick(HOOKS) : hook
  const maxHold = mood === "end" ? 14 : mood === "calm" ? 12 : mood === "wild" ? 8 : 7
  const homePhrase = phrase(scale, hook, attacks, rng, maxHold, true, 0)
  const bridgePhrase = phrase(scale, otherHook, bridgeAttacks, rng, maxHold, false, rng.pick([2, 3, 4]))
  const melody = [...homePhrase, ...shift(homePhrase, 4), ...shift(bridgePhrase, 8), ...shift(homePhrase, 12)]
  const harmony = melody.flatMap((hit) => {
    if (hit.length < 4) return []
    const degree = hit.degree - 2
    return [{ step: hit.step, degree, semi: semiOf(scale, degree), length: Math.max(2, hit.length - 1) }]
  })
  const bassPattern = mood === "end" ? BASS[0]! : mood === "calm" ? rng.pick(BASS.slice(0, 3)) : rng.pick(BASS)
  const bass: Hit[] = []
  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chordAt(home, bridge, bar)
    for (let eighth = 0; eighth < bassPattern.length; eighth += 1) {
      const tone = bassPattern[eighth]
      if (tone == null) continue
      const step = bar * 16 + eighth * 2
      let end = step + 4
      for (let ahead = eighth + 1; ahead < bassPattern.length; ahead += 1) {
        if (bassPattern[ahead] != null) {
          end = bar * 16 + ahead * 2
          break
        }
      }
      bass.push({
        step,
        degree: chord,
        semi: bassSemi(scale, chord, tone),
        length: Math.max(2, Math.min(8, end - step)),
      })
    }
  }
  const arpPattern = rng.pick(ARP_STEPS[mood])
  const cycle = rng.pick(CYCLES)
  const arp: Hit[] = []
  let cursor = 0
  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chordAt(home, bridge, bar)
    for (const slot of arpPattern) {
      const tone = cycle[cursor % cycle.length] ?? 0
      cursor += 1
      arp.push({
        step: bar * 16 + slot,
        degree: chord,
        semi: arpSemi(scale, chord, tone),
        length: mood === "calm" ? 2 : 1,
      })
    }
  }
  const color = colorOf(mood)
  const wideChance = mood === "duel" ? 0.7 : mood === "wild" ? 0.35 : mood === "calm" ? 0.12 : 0
  return {
    bpm: tempoOf(mood, rng),
    root: rng.pick([55, 57, 59, 60, 62, 64, 65]),
    steps: STEPS,
    melody,
    harmony,
    bass,
    arp,
    drum: rng.int(2),
    mood,
    wide: rng.float() < wideChance,
    bright: color.bright,
    lead: color.lead,
  }
}

export function drumAt(mood: Mood, variant: number, step: number, fill: boolean): Drum {
  if (mood === "end") return { kick: step === 0, snare: false, hat: step === 8 ? "closed" : "off" }
  if (mood === "calm") {
    if (variant % 2 === 0) return { kick: step === 0 || step === 8, snare: false, hat: step % 4 === 2 ? "closed" : "off" }
    return { kick: step === 0, snare: step === 8, hat: step % 4 === 2 ? "closed" : "off" }
  }
  const duel = mood === "duel"
  const kick = step === 0 || step === 8 || ((duel || variant % 2 === 1) && step === 10)
  let snare = step === 4 || step === 12 || (duel && variant % 2 === 1 && step === 14)
  if (fill && step >= 8 && step % 2 === 0) snare = true
  let hat: Drum["hat"] = step % 2 === 0 ? (step % 8 === 6 ? "open" : "closed") : "off"
  if (snare && hat === "open") hat = "closed"
  return { kick, snare, hat }
}
