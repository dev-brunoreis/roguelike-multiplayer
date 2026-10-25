import { flushDamage, spawnCreep } from "../../../spawn.js";
import type { Match, PlayerState } from "../../../types.js";
import { addLog, alivePlayers, clearHazards, emit, pushBanner, syncWorld } from "../../../world.js";
import { arenaQuiet, revive, sendHome } from "./move.js";
import { checkWinner } from "../victory.js";
import { beginHub } from "./hub.js";

export function waveFor(match: Match) {
  const sorted = [...match.data.waves].sort((a, b) => a.round - b.round);
  let chosen = sorted[0]!;
  for (const wave of sorted) {
    if (wave.round <= match.round) chosen = wave;
  }
  return chosen;
}

export function bossForRound(match: Match) {
  const due = match.data.bosses.filter((boss) => match.round % boss.everyRounds === 0);
  due.sort((a, b) => b.everyRounds - a.everyRounds);
  return due[0] ?? null;
}

export function waveBudget(match: Match) {
  return Math.min(180, match.config.pveSeconds + Math.max(0, match.round - 1) * 4);
}

export function armPlayers(match: Match, players: PlayerState[]) {
  const wave = waveFor(match);
  const extra = 1 + Math.max(0, match.round - wave.round) * 0.38;
  const haste = 1 + Math.max(0, match.round - 1) * 0.035;
  for (const player of players) {
    player.ready = false;
    player.botActed = false;
    player.bet = null;
    player.shopOffers = [];
    player.waveClear = player.eliminated;
    if (player.eliminated) continue;
    sendHome(match, player);
    revive(match, player);
    for (const group of wave.spawns) {
      match.spawns.push({
        arenaId: player.arenaId,
        creepId: group.creepId,
        left: Math.max(1, Math.round(group.count * extra)),
        interval: group.interval / haste,
        acc: group.interval / haste,
      });
    }
  }
}

export function beginPve(match: Match) {
  if (match.phase === "ended") return;
  flushDamage(match);
  match.phase = "pve";
  match.phaseTime = waveBudget(match);
  match.spawns = [];
  match.duel = [];
  match.duelPending = false;
  match.duelAnnounce = 0;
  clearHazards(match);
  match.bossArenas.clear();
  match.bossAnnounced = false;
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.arenas = match.arenas.filter((arena) => arena.kind !== "duel");
  armPlayers(match, match.players);
  syncWorld(match);
  addLog(match, `Onda ${match.round}`);
}

function endPve(match: Match, cleared: boolean) {
  flushDamage(match);
  match.waveDone = true;
  if (cleared) {
    emitCleared(match);
    addLog(match, `Onda ${match.round} limpa`);
  } else {
    emitFailed(match);
    addLog(match, `Onda ${match.round} acabou no tempo`);
  }
  match.spawns = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  clearHazards(match);
  match.bossArenas.clear();
  syncWorld(match);
  checkWinner(match);
  if (match.phase === "ended") return;
  beginHub(match);
}

function emitCleared(match: Match) {
  emit(match, { type: "wave_cleared", round: match.round });
}

function emitFailed(match: Match) {
  emit(match, { type: "wave_failed", round: match.round });
}

function bossAlive(match: Match, arenaId: string) {
  return match.entities.some((entity) => entity.alive && entity.kind === "boss" && entity.arenaId === arenaId);
}

export function tickSpawns(match: Match, dt: number, skip: (playerId: string) => boolean) {
  const boss = bossForRound(match);
  for (const job of match.spawns) {
    if (job.left <= 0) continue;
    const aliveCreeps = match.entities.filter((entity) => entity.alive && entity.arenaId === job.arenaId && entity.kind !== "hero").length;
    if (aliveCreeps >= 28) continue;
    job.acc += dt;
    if (job.acc < job.interval && job.interval > 0) continue;
    job.acc = 0;
    job.left -= 1;
    spawnCreep(match, job.arenaId, job.creepId);
  }
  let spawnedBoss = false;
  for (const player of alivePlayers(match)) {
    if (skip(player.id) || player.waveClear) continue;
    if (!arenaQuiet(match, player.arenaId)) continue;
    if (boss && !bossAlive(match, player.arenaId)) {
      if (!match.bossArenas.has(player.arenaId)) {
        spawnCreep(match, player.arenaId, boss.creepId);
        match.bossArenas.add(player.arenaId);
        if (!match.bossAnnounced) {
          match.bossAnnounced = true;
          spawnedBoss = true;
          addLog(match, `Boss: ${boss.nome}`);
          pushBanner(match, { kind: "boss", title: boss.nome, detail: "O chefe entrou na arena", life: 4.5 });
        }
        continue;
      }
    }
    if (boss && bossAlive(match, player.arenaId)) continue;
    player.waveClear = true;
    addLog(match, `${player.name} limpou a arena`);
  }
  return spawnedBoss;
}

export function updatePve(match: Match, dt: number) {
  if (tickSpawns(match, dt, () => false)) match.phaseTime += match.config.bossSeconds;
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (alivePlayers(match).every((player) => player.waveClear)) {
    endPve(match, true);
    return;
  }
  if (match.phaseTime <= 0) endPve(match, false);
}
