import { applyCard } from "../effects.js";
import { offerCards } from "../progression.js";
import { flushDamage } from "../spawn.js";
import type { Match, PlayerState } from "../types.js";
import { addLog, alivePlayers, emit, pushBanner, syncWorld } from "../world.js";
import { sendToHub } from "./move.js";
import { beginPve } from "./pve.js";
import { beginDuel } from "./duel.js";
import { checkWinner } from "../victory.js";

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
  match.duelAnnounce = 0;
  const fighters = alivePlayers(match);
  if (match.duelsEnabled && match.waveDone && match.round >= match.config.duelStartRound && fighters.length >= 2) {
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
    if (player.unspentPicks > 0 && player.pendingCards.length === 0) offerCards(match, player);
  });
  syncWorld(match);
  addLog(match, match.waveDone ? "Salão aberto: escolhe carta e respira" : "Salão aberto");
  if (match.duelPending) addLog(match, "Duelo em seguida.");
}

function pairPlayers(match: Match) {
  const ids = alivePlayers(match).map((player) => player.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = match.rng.int(i + 1);
    const swap = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = swap;
  }
  const pairs: { a: string; b: string; arenaId: string; resolved: boolean }[] = [];
  const a = ids[0];
  const b = ids[1];
  if (!a || !b) return pairs;
  pairs.push({ a, b, arenaId: `duel-${match.round}-1`, resolved: false });
  return pairs;
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
  if (match.duelPending && match.duel.length > 0) {
    const announceFor = match.config.duelAnnounceSeconds;
    if (announceFor <= 0) {
      if (!waiting || match.phaseTime <= 0) leaveHub(match);
      return;
    }
    if (match.duelAnnounce <= 0 && (!waiting || match.phaseTime <= announceFor)) {
      match.duelAnnounce = announceFor;
      const pair = match.duel[0]!;
      const a = match.players.find((player) => player.id === pair.a);
      const b = match.players.find((player) => player.id === pair.b);
      addLog(match, `Duelo: ${a?.name ?? "?"} vs ${b?.name ?? "?"}`);
      pushBanner(match, {
        kind: "duel",
        title: `${a?.name ?? "?"} vs ${b?.name ?? "?"}`,
        detail: "Duelo",
        life: announceFor,
      });
    }
    if (match.duelAnnounce > 0) {
      match.duelAnnounce = Math.max(0, match.duelAnnounce - dt);
      if (match.duelAnnounce <= 0) leaveHub(match);
      return;
    }
    return;
  }
  if (!waiting || match.phaseTime <= 0) leaveHub(match);
}
