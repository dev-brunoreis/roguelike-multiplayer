import { flushDamage, spawnCreep } from "../../../spawn.js";
import type { Match } from "../../../types.js";
import { addLog, alivePlayers, emit, syncWorld } from "../../../world.js";
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

export function beginPve(match: Match) {
  if (match.phase === "ended") return;
  flushDamage(match);
  match.phase = "pve";
  match.phaseTime = Math.min(180, match.config.pveSeconds + Math.max(0, match.round - 1) * 4);
  match.spawns = [];
  match.duel = [];
  match.duelPending = false;
  match.duelAnnounce = 0;
  match.projectiles = [];
  match.bossAnnounced = false;
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.arenas = match.arenas.filter((arena) => arena.kind !== "duel");
  const wave = waveFor(match);
  const boss = bossForRound(match);
  if (boss && !match.bossAnnounced) {
    match.bossAnnounced = true;
    addLog(match, `Boss: ${boss.nome}`);
  }
  for (const player of match.players) {
    player.ready = false;
    player.botActed = false;
    player.bet = null;
    player.shopOffers = [];
    player.waveClear = player.eliminated;
    if (player.eliminated) continue;
    sendHome(match, player);
    revive(match, player);
    const extra = 1 + Math.max(0, match.round - wave.round) * 0.38;
    const haste = 1 + Math.max(0, match.round - 1) * 0.035;
    for (const group of wave.spawns) {
      match.spawns.push({
        arenaId: player.arenaId,
        creepId: group.creepId,
        left: Math.max(1, Math.round(group.count * extra)),
        interval: group.interval / haste,
        acc: group.interval / haste,
      });
    }
    if (boss) {
      match.spawns.push({
        arenaId: player.arenaId,
        creepId: boss.creepId,
        left: 1,
        interval: 0.4,
        acc: 0.4,
      });
    }
  }
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
  match.projectiles = [];
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

export function updatePve(match: Match, dt: number) {
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
  for (const player of alivePlayers(match)) {
    if (player.waveClear) continue;
    if (!arenaQuiet(match, player.arenaId)) continue;
    player.waveClear = true;
    addLog(match, `${player.name} limpou a arena`);
  }
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (alivePlayers(match).every((player) => player.waveClear)) {
    endPve(match, true);
    return;
  }
  if (match.phaseTime <= 0) endPve(match, false);
}
