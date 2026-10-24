import { describe, expect, it } from "vitest"
import { compose, type Mood } from "./music.js"

const MOODS: Mood[] = ["calm", "wild", "duel", "boss", "end"]

function midi(songRoot: number, semi: number) {
  return songRoot + semi
}

function intervals(degrees: number[]) {
  const jumps: number[] = []
  for (let i = 1; i < degrees.length; i += 1) jumps.push(Math.abs(degrees[i]! - degrees[i - 1]!))
  return jumps
}

describe("compose", () => {
  it("monta frase, resposta e trecho contrastante", () => {
    for (const mood of MOODS) {
      for (let n = 0; n < 24; n += 1) {
        const song = compose(mood, Math.random)
        const home = song.melody.filter((hit) => hit.step < 64).map((hit) => hit.degree)
        const repeat = song.melody.filter((hit) => hit.step >= 64 && hit.step < 128).map((hit) => hit.degree)
        const bridge = song.melody.filter((hit) => hit.step >= 128 && hit.step < 192).map((hit) => hit.degree)
        const back = song.melody.filter((hit) => hit.step >= 192).map((hit) => hit.degree)
        expect(repeat).toEqual(home)
        expect(back).toEqual(home)
        expect(bridge.join(",")).not.toBe(home.join(","))
        const cadence = song.melody.filter((hit) => hit.step >= 32 && hit.step < 64)
        const last = cadence[cadence.length - 1]
        expect(last?.degree === 0 || last?.degree === 7).toBe(true)
        for (const hit of [...song.melody, ...song.harmony, ...song.bass, ...song.arp]) {
          const note = midi(song.root, hit.semi)
          expect(note).toBeGreaterThanOrEqual(36)
          expect(note).toBeLessThanOrEqual(86)
          expect(hit.length).toBeGreaterThan(0)
        }
        const jumps = intervals(home)
        expect(jumps.every((jump) => jump <= 7)).toBe(true)
        expect(song.bass.length).toBeGreaterThan(8)
        if (mood !== "end") expect(song.arp.length).toBeGreaterThan(8)
        else expect(song.arp).toEqual([])
      }
    }
  })

  it("sorteia tom, andamento e desenho diferentes", () => {
    const songs = Array.from({ length: 16 }, () => compose("calm"))
    expect(new Set(songs.map((song) => song.root)).size).toBeGreaterThan(2)
    expect(new Set(songs.map((song) => song.bpm)).size).toBeGreaterThan(2)
    const shapes = new Set(songs.map((song) => song.melody.map((hit) => hit.degree).join(",")))
    expect(shapes.size).toBeGreaterThan(8)
  })
})
