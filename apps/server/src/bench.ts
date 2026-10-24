import { createRequire } from "node:module";
import { loadGameData } from "@game/game-data";
import { jumpWave, setBotsGodmode } from "@game/sim/debug";
import { buildWire, createMatch, tick } from "@game/sim";

const require = createRequire(new URL("../package.json", import.meta.url));
const nested = createRequire(require.resolve("colyseus"));
const { pack } = nested("@colyseus/msgpackr") as { pack: (value: unknown) => Uint8Array };

const data = loadGameData();
const roster = Array.from({ length: 8 }, (_, index) => ({
  id: `bot${index}`,
  name: `Bot ${index}`,
  isBot: true,
  heroId: data.heroes[index % data.heroes.length]!.id,
}));

function p95(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

function mean(samples: number[]) {
  return samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
}

function measure(round: number) {
  const match = createMatch({ players: roster, seed: 9, data });
  setBotsGodmode(match, true);
  jumpWave(match, round);
  const ticks: number[] = [];
  for (let i = 0; i < 80; i += 1) {
    const started = performance.now();
    tick(match);
    ticks.push(performance.now() - started);
  }
  const started = performance.now();
  const wires = roster.map((player) => buildWire(match, player.id));
  const buildMs = performance.now() - started;
  const bytes = wires.map((wire) => pack(wire).byteLength);
  const each = bytes.reduce((sum, value) => sum + value, 0) / bytes.length;
  const perSecond = (bytes.reduce((sum, value) => sum + value, 0) * 10) / 1024;
  console.log(
    `onda ${round}: tick médio ${mean(ticks).toFixed(2)}ms · p95 ${p95(ticks).toFixed(2)}ms · 8 snapshots ${buildMs.toFixed(2)}ms · ${Math.round(each)} B/cliente · ${perSecond.toFixed(1)} KB/s`,
  );
}

console.log("bench 8 bots, godmode, 80 ticks");
for (const round of [1, 4, 6, 9]) measure(round);
