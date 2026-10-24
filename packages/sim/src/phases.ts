import { eligible, offerCards } from "./damage.js";
import { applyCard } from "./effects.js";
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

function sendHome(match: Match, player: PlayerState) {
  const home = match.arenas.find((arena) => arena.ownerId === player.id && arena.kind === "pve");
  if (!home) return;
  player.arenaId = home.id;
  const entity = heroEntity(match, player);
  if (entity) {
    entity.arenaId = home.id;
    entity.team = "player";
  }
}

function sendToHub(match: Match, player: PlayerState, index: number, total: number) {
  const hub = match.arenas.find((arena) => arena.kind === "hub");
  if (!hub) return;
  const center = arenaCenter(hub);
  const angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
  const radius = Math.min(6, hub.size * 0.22);
  player.arenaId = hub.id;
  const entity = heroEntity(match, player);
  if (!entity) return;
  entity.arenaId = hub.id;
  entity.team = "player";
  entity.alive = true;
  entity.hp = entity.maxHp;
  entity.invuln = 0.4;
  entity.x = center.x + Math.cos(angle) * radius;
  entity.y = center.y + Math.sin(angle) * radius;
  player.respawnIn = 0;
}

function arenaQuiet(match: Match, arenaId: string) {
  const spawning = match.spawns.some((job) => job.arenaId === arenaId && job.left > 0);
  const creeps = match.entities.some((entity) => entity.alive && entity.kind !== "hero" && entity.arenaId === arenaId);
  return !spawning && !creeps;
}

export function beginPve(match: Match) {
  if (match.phase === "ended") return;
  flushDamage(match);
  match.phase = "pve";
  match.phaseTime = match.config.pveSeconds;
  match.spawns = [];
  match.duel = [];
  match.duelPending = false;
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
  addLog(match, `Onda ${match.round}`);
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
  match.waveDone = true;
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
  beginHub(match);
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

export function beginHub(match: Match) {
  if (match.phase === "ended") return;
  flushDamage(match);
  match.phase = "hub";
  match.phaseTime = match.config.hubSeconds;
  match.projectiles = [];
  match.spawns = [];
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  match.arenas = match.arenas.filter((arena) => arena.kind !== "duel");
  match.duel = [];
  match.duelPending = false;
  const fighters = alivePlayers(match);
  if (match.waveDone && match.round >= match.config.duelStartRound && fighters.length >= 2) {
    match.duel = pairPlayers(match);
    match.duelPending = match.duel.length > 0;
  }
  for (const player of match.players) {
    player.botActed = false;
    player.ready = player.eliminated;
    player.shopOffers = [];
    player.waveClear = false;
  }
  fighters.forEach((player, index) => {
    sendToHub(match, player, index, fighters.length);
    if (match.waveDone) player.shopOffers = rollShop(match, player);
    if (player.unspentPicks > 0 && player.pendingCards.length === 0) offerCards(match, player);
  });
  addLog(match, match.waveDone ? "Salão aberto: cartas, loja e um respiro" : "Salão aberto");
  if (match.duelPending) addLog(match, "Duelo em seguida. Quem não luta pode apostar.");
}

function forcePick(match: Match, player: PlayerState) {
  while (player.pendingCards.length > 0) {
    const cardId = match.rng.pick(player.pendingCards);
    player.pendingCards = [];
    player.cardTimer = 0;
    player.unspentPicks = Math.max(0, player.unspentPicks - 1);
    applyCard(match, player, cardId);
    emit(match, { type: "card_pick", round: match.round, playerId: player.id, cardId, auto: true });
  }
}

function leaveHub(match: Match) {
  for (const player of alivePlayers(match)) forcePick(match, player);
  checkWinner(match);
  if (match.phase === "ended") return;
  if (match.duelPending && match.duel.length > 0) {
    beginDuel(match);
    return;
  }
  if (match.waveDone) match.round += 1;
  beginPve(match);
}

export function updateHub(match: Match, dt: number) {
  match.phaseTime = Math.max(0, match.phaseTime - dt);
  const waiting = alivePlayers(match).some((player) => !player.ready);
  if (!waiting || match.phaseTime <= 0) leaveHub(match);
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
    pairs.push({ a, b, arenaId: `duel-${match.round}-${n}`, resolved: false });
  }
  return pairs;
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

export function beginDuel(match: Match) {
  if (match.phase === "ended") return;
  match.phase = "duel";
  match.phaseTime = match.config.duelSeconds;
  match.projectiles = [];
  match.duel.forEach((pair, index) => {
    if (!arenaById(match, pair.arenaId)) placeDuelArena(match, pair.arenaId, index + 1);
    sendToDuel(match, pair.a, pair.arenaId, "red", 0.28);
    sendToDuel(match, pair.b, pair.arenaId, "blue", 0.72);
  });
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
  beginHub(match);
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
  updateHub(match, dt);
}
