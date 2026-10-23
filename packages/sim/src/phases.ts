import { eligible } from "./damage.js";
import { flushDamage, spawnCreep } from "./spawn.js";
import type { Match, PlayerState } from "./types.js";
import { addLog, alivePlayers, arenaById, arenaCenter, emit, heroEntity } from "./world.js";

export function checkWinner(match: Match) {
  if (match.phase === "ended") return;
  const alive = alivePlayers(match);
  if (alive.length === 0) {
    finish(match, null);
    return;
  }
  if (match.rosterCount >= 2 && alive.length === 1) finish(match, alive[0]!.id);
}

function finish(match: Match, winnerId: string | null) {
  flushDamage(match);
  match.phase = "ended";
  match.phaseTime = 0;
  match.winnerId = winnerId;
  const winner = match.players.find((player) => player.id === winnerId);
  addLog(match, winner ? `${winner.name} venceu a partida` : "A partida terminou sem vencedor");
  emit(match, { type: "win", round: match.round, playerId: winnerId });
}

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
  match.phaseTime = match.config.pveSeconds;
  match.spawns = [];
  match.duel = [];
  match.projectiles = [];
  match.bossAnnounced = false;
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.arenas = match.arenas.filter((arena) => arena.kind === "pve");
  const wave = waveFor(match);
  const boss = bossForRound(match);
  if (boss && !match.bossAnnounced) {
    match.bossAnnounced = true;
    addLog(match, `Boss: ${boss.nome}`);
  }
  for (const player of alivePlayers(match)) {
    player.ready = false;
    player.botActed = false;
    player.bet = null;
    player.shopOffers = [];
    revive(match, player);
    for (const group of wave.spawns) {
      match.spawns.push({
        arenaId: player.arenaId,
        creepId: group.creepId,
        left: group.count,
        interval: group.interval,
        acc: group.interval,
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
}

export function revive(match: Match, player: PlayerState) {
  const entity = heroEntity(match, player);
  const arena = arenaById(match, player.arenaId);
  if (!entity || !arena) return;
  const center = arenaCenter(arena);
  entity.alive = true;
  entity.hp = entity.maxHp;
  entity.x = center.x;
  entity.y = center.y;
  entity.team = "player";
  entity.arenaId = player.arenaId;
  entity.invuln = 0.4;
  player.respawnIn = 0;
}

export function respawnHero(match: Match, player: PlayerState) {
  revive(match, player);
  const entity = heroEntity(match, player);
  if (entity) entity.invuln = match.config.invulnSeconds;
}

function endPve(match: Match, cleared: boolean) {
  flushDamage(match);
  if (cleared) {
    emit(match, { type: "wave_cleared", round: match.round });
    addLog(match, `Onda ${match.round} limpa`);
    for (const player of alivePlayers(match)) {
      player.gold += match.data.economy.goldPerWave * (1 + player.stats.goldPct);
    }
  } else {
    emit(match, { type: "wave_failed", round: match.round });
    addLog(match, `Onda ${match.round} acabou no tempo`);
  }
  match.spawns = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.projectiles = [];
  checkWinner(match);
  if (match.phase === "ended") return;
  const fighters = alivePlayers(match);
  if (match.round >= match.config.duelStartRound && fighters.length >= 2) beginBetting(match);
  else beginShop(match);
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
  const spawning = match.spawns.some((job) => job.left > 0);
  const creeps = match.entities.some((entity) => entity.alive && entity.kind !== "hero");
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (!spawning && !creeps) {
    endPve(match, true);
    return;
  }
  if (match.phaseTime <= 0) endPve(match, false);
}

export function beginBetting(match: Match) {
  if (match.phase === "ended") return;
  match.phase = "betting";
  match.phaseTime = match.config.bettingSeconds;
  match.duel = pairPlayers(match);
  addLog(match, "Apostas abertas");
  for (const player of match.players) player.bet = null;
}

function pairPlayers(match: Match) {
  const ids = alivePlayers(match).map((player) => player.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = match.rng.int(i + 1);
    const swap = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = swap;
  }
  const pairs = [];
  if (ids.length % 2 === 1) {
    const bye = match.players.find((player) => player.id === ids.pop());
    if (bye) {
      bye.gold += match.data.economy.byeGold;
      addLog(match, `${bye.name} folga e ganha ${match.data.economy.byeGold} de ouro`);
    }
  }
  let n = 0;
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i];
    const b = ids[i + 1];
    if (!a || !b) continue;
    n += 1;
    const arenaId = `duel-${match.round}-${n}`;
    match.arenas.push({
      id: arenaId,
      x: n * (match.config.arenaSize + match.config.arenaGap),
      y: -match.config.arenaSize - match.config.arenaGap,
      size: match.config.arenaSize,
      ownerId: null,
      kind: "duel",
      label: "Duelo",
    });
    pairs.push({ a, b, arenaId, resolved: false });
  }
  return pairs;
}

export function beginDuel(match: Match) {
  if (match.phase === "ended") return;
  match.phase = "duel";
  match.phaseTime = match.config.duelSeconds;
  match.projectiles = [];
  for (const pair of match.duel) {
    sendToDuel(match, pair.a, pair.arenaId, "red", 0.28);
    sendToDuel(match, pair.b, pair.arenaId, "blue", 0.72);
  }
  addLog(match, "Duelo!");
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
    if (match.phase !== "ended") beginShop(match);
  }
}

function resolvePair(
  match: Match,
  aId: string,
  bId: string,
  pair: { resolved: boolean },
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
    return;
  }
  if (!aAlive && !bAlive) {
    refundBets(match, [aId, bId]);
    addLog(match, `Duelo nocaute duplo: ${a.name} e ${b.name}`);
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
  winner.gold += match.data.economy.duelWinGold;
  payBets(match, winner.id, aId, bId);
  emit(match, { type: "duel_result", round: match.round, winnerId: winner.id, loserId: loser.id, timeout });
  addLog(match, `${winner.name} venceu o duelo contra ${loser.name}`);
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

export function beginShop(match: Match) {
  if (match.phase === "ended") return;
  flushDamage(match);
  match.phase = "shop";
  match.phaseTime = match.config.shopSeconds;
  match.projectiles = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  for (const player of match.players) {
    player.botActed = false;
    player.shopOffers = [];
    player.ready = player.eliminated;
    if (player.eliminated) continue;
    const home = match.arenas.find((arena) => arena.ownerId === player.id && arena.kind === "pve");
    if (home) {
      player.arenaId = home.id;
      const entity = heroEntity(match, player);
      if (entity) {
        entity.arenaId = home.id;
        entity.team = "player";
      }
    }
    revive(match, player);
    player.shopOffers = rollShop(match, player);
  }
  addLog(match, "Loja aberta");
}

export function rollShop(match: Match, player: PlayerState) {
  const pool = match.data.cards.filter((card) => eligible(match, player, card));
  const draft = [...pool];
  const offers: string[] = [];
  for (let i = 0; i < match.config.shopSlots && draft.length > 0; i += 1) {
    const total = draft.reduce((sum, card) => sum + card.weight, 0);
    let roll = match.rng.next() * total;
    let index = 0;
    for (let n = 0; n < draft.length; n += 1) {
      roll -= draft[n]!.weight;
      if (roll <= 0) {
        index = n;
        break;
      }
    }
    const [card] = draft.splice(index, 1);
    if (card) offers.push(card.id);
  }
  return offers;
}

export function updateBetting(match: Match, dt: number) {
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  if (match.phaseTime <= 0) beginDuel(match);
}

export function updateShop(match: Match, dt: number) {
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  const pending = alivePlayers(match).some((player) => !player.ready);
  if (!pending || match.phaseTime <= 0) {
    match.round += 1;
    beginPve(match);
  }
}
