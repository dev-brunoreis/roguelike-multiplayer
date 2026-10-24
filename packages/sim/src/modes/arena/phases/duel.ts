import type { DuelPair, Match } from "../../../types.js";
import { addLog, arenaById, clearHazards, emit, heroEntity, pushBanner, syncWorld } from "../../../world.js";
import { checkWinner } from "../victory.js";
import { beginPve } from "./pve.js";

export function duelLive(match: Match) {
  const pending = (match.phase === "hub" || match.phase === "shop") && match.duelPending && match.duel.length > 0;
  const fighting = match.phase === "duel" || match.phase === "betting";
  return { pending, fighting };
}

export function dropDuel(match: Match) {
  for (const player of match.players) {
    if (!player.bet) continue;
    player.gold += player.bet.amount;
    player.bet = null;
  }
  match.duel = [];
  match.duelPending = false;
  match.duelAnnounce = 0;
  clearHazards(match);
  match.arenas = match.arenas.filter((arena) => arena.kind !== "duel");
  syncWorld(match);
}

export function beginDuel(match: Match) {
  if (match.phase === "ended") return;
  match.phase = "duel";
  match.phaseTime = match.config.duelSeconds;
  match.duelAnnounce = 0;
  clearHazards(match);
  match.duel.forEach((pair, index) => {
    if (!arenaById(match, pair.arenaId)) placeDuelArena(match, pair.arenaId, index + 1);
    sendToDuel(match, pair.a, pair.arenaId, "red", 0.28);
    sendToDuel(match, pair.b, pair.arenaId, "blue", 0.72);
  });
  syncWorld(match);
  addLog(match, "Duelo!");
}

function placeDuelArena(match: Match, arenaId: string, slot: number) {
  const hub = match.arenas.find((arena) => arena.kind === "hub");
  const hubExtent = (hub?.size ?? match.config.hubSize) / 2;
  const size = match.config.arenaSize;
  const gap = match.config.arenaGap;
  match.arenas.push({
    id: arenaId,
    x: (slot - 1) * (size + gap) - size / 2,
    y: -(hubExtent + gap + size),
    size,
    ownerId: null,
    kind: "duel",
    label: "Duelo",
  });
}

function sendToDuel(match: Match, playerId: string, arenaId: string, team: string, along: number) {
  const player = match.players.find((item) => item.id === playerId);
  const arena = arenaById(match, arenaId);
  const entity = player ? heroEntity(match, player) : undefined;
  if (!player || !arena || !entity) return;
  player.arenaId = arenaId;
  entity.alive = true;
  entity.hp = entity.maxHp;
  entity.team = team;
  entity.arenaId = arenaId;
  entity.invuln = 0.6;
  entity.x = arena.x + arena.size * along;
  entity.y = arena.y + arena.size / 2;
  player.respawnIn = 0;
}

export function updateDuel(match: Match, dt: number) {
  for (const pair of match.duel) {
    if (pair.resolved) continue;
    const a = match.players.find((player) => player.id === pair.a);
    const b = match.players.find((player) => player.id === pair.b);
    const aDown = !a || a.eliminated || !heroEntity(match, a)?.alive;
    const bDown = !b || b.eliminated || !heroEntity(match, b)?.alive;
    if (aDown || bDown) resolvePair(match, pair.a, pair.b, pair, false);
  }
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (match.duel.every((pair) => pair.resolved) || match.phaseTime <= 0) {
    for (const pair of match.duel) {
      if (!pair.resolved) resolvePair(match, pair.a, pair.b, pair, true);
    }
    checkWinner(match);
    if (match.phase !== "ended") {
      match.round += 1;
      beginPve(match);
    }
  }
}

function resolvePair(
  match: Match,
  aId: string,
  bId: string,
  pair: DuelPair,
  timeout: boolean,
) {
  if (pair.resolved) return;
  pair.resolved = true;
  const a = match.players.find((player) => player.id === aId);
  const b = match.players.find((player) => player.id === bId);
  if (!a || !b) return;
  const aEntity = heroEntity(match, a);
  const bEntity = heroEntity(match, b);
  const aAlive = Boolean(aEntity?.alive);
  const bAlive = Boolean(bEntity?.alive);
  const aRatio = aAlive && aEntity ? aEntity.hp / aEntity.maxHp : 0;
  const bRatio = bAlive && bEntity ? bEntity.hp / bEntity.maxHp : 0;
  if (timeout && aAlive && bAlive && Math.abs(aRatio - bRatio) < 0.01) {
    refundBets(match, [aId, bId]);
    addLog(match, `Duelo empatado: ${a.name} e ${b.name}`);
    pushBanner(match, { kind: "duel_result", title: "Duelo empatado", detail: `${a.name} e ${b.name}`, life: 4 });
    return;
  }
  if (!aAlive && !bAlive) {
    refundBets(match, [aId, bId]);
    addLog(match, `Duelo nocaute duplo: ${a.name} e ${b.name}`);
    pushBanner(match, { kind: "duel_result", title: "Nocaute duplo", detail: `${a.name} e ${b.name}`, life: 4 });
    return;
  }
  const winner = !aAlive || bRatio > aRatio ? b : a;
  const loser = winner === a ? b : a;
  const loserEntity = heroEntity(match, loser);
  if (loserEntity?.alive) {
    loserEntity.hp = 0;
    loserEntity.alive = false;
    loser.lives -= 1;
    loser.deaths += 1;
    emit(match, { type: "death", round: match.round, playerId: loser.id, livesLeft: Math.max(0, loser.lives) });
    if (loser.lives <= 0) {
      loser.eliminated = true;
      loser.eliminatedAt = match.time;
      loser.ready = true;
      emit(match, { type: "eliminate", round: match.round, playerId: loser.id, reason: "duelo" });
      addLog(match, `${loser.name} foi eliminado`);
    }
  }
  payBets(match, winner.id, aId, bId);
  emit(match, { type: "duel_result", round: match.round, winnerId: winner.id, loserId: loser.id, timeout });
  addLog(match, `${winner.name} venceu o duelo contra ${loser.name}`);
  pushBanner(match, {
    kind: "duel_result",
    title: `${winner.name} venceu`,
    detail: `Duelo contra ${loser.name}`,
    life: 4.2,
  });
}

function payBets(match: Match, winnerId: string, aId: string, bId: string) {
  for (const player of match.players) {
    if (!player.bet) continue;
    if (player.bet.targetId !== aId && player.bet.targetId !== bId) continue;
    if (player.bet.targetId === winnerId) player.gold += player.bet.amount * 2;
    player.bet = null;
  }
}

function refundBets(match: Match, ids: string[]) {
  for (const player of match.players) {
    if (!player.bet) continue;
    if (!ids.includes(player.bet.targetId)) continue;
    player.gold += player.bet.amount;
    player.bet = null;
  }
}
