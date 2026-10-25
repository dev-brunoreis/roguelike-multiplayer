import type { Match } from "./types.js";
import { addLog, alivePlayers, heroEntity, playerById, pushBanner } from "./world.js";
import { beginPve } from "./modes/arena/phases/pve.js";
import { beginHub } from "./modes/arena/phases/hub.js";
import { dropDuel, duelLive, joinWave } from "./modes/arena/phases/duel.js";
import { arenaQuiet, respawnHero, sendHome, sendToHub } from "./modes/arena/phases/move.js";

export function setGodmode(match: Match, playerId: string, on?: boolean): boolean | null {
  const player = playerById(match, playerId);
  if (!player || player.isBot) return null;
  player.godmode = on ?? !player.godmode;
  return player.godmode;
}

export function setBotsGodmode(match: Match, on?: boolean): boolean | null {
  const next = on ?? !match.botsGodmode;
  match.botsGodmode = next;
  for (const bot of match.players) {
    if (bot.isBot) bot.godmode = next;
  }
  return next;
}

export function setDuels(match: Match, on?: boolean): boolean | null {
  if (match.phase === "ended") return null;
  match.duelsEnabled = on ?? !match.duelsEnabled;
  if (!match.duelsEnabled) {
    const { pending, fighting } = duelLive(match);
    if (pending || fighting) {
      const side = fighting && !match.waveDone;
      if (side) refundBets(match);
      else dropDuel(match);
      addLog(match, "Duelos desligados");
      if (side) joinWave(match);
      else if (fighting) {
        if (match.waveDone) match.round += 1;
        beginPve(match);
      } else {
        pushBanner(match, { kind: "info", title: "Duelos desligados", detail: "A onda segue sem duelo", life: 3.2 });
      }
    }
  }
  return match.duelsEnabled;
}

export function jumpWave(match: Match, round: number): number | null {
  if (match.phase === "ended" || !Number.isInteger(round) || round < 1 || round > 99) return null;
  match.round = round;
  beginPve(match);
  pushBanner(match, { kind: "info", title: `Onda ${round}`, detail: "Começou agora", life: 3.2 });
  return round;
}

export function skipDuel(match: Match) {
  if (match.phase === "ended") return false;
  const { pending, fighting } = duelLive(match);
  if (!pending && !fighting) return false;
  const side = fighting && !match.waveDone;
  if (side) refundBets(match);
  else dropDuel(match);
  addLog(match, "Duelo pulado");
  pushBanner(match, { kind: "info", title: "Duelo pulado", detail: "Ninguém perde vida", life: 3.2 });
  if (side) joinWave(match);
  else if (fighting) {
    if (match.waveDone) match.round += 1;
    beginPve(match);
  }
  return true;
}

function refundBets(match: Match) {
  for (const player of match.players) {
    if (!player.bet) continue;
    player.gold += player.bet.amount;
    player.bet = null;
  }
}

export function revivePlayer(
  match: Match,
  playerId: string,
  targetName?: string,
): { status: "revived"; name: string } | { status: "alive" | "missing" } {
  const named = targetName?.trim().toLowerCase();
  const target = named
    ? match.players.find((player) => player.name.toLowerCase() === named)
    : playerById(match, playerId);
  if (!target) return { status: "missing" };
  if (target.downed) {
    target.downed = false;
    target.reviveProgress = 0;
    target.respawnIn = 0;
    const body = heroEntity(match, target);
    if (body) {
      body.alive = true;
      body.hp = Math.max(1, body.maxHp * (match.data.dungeon?.reviveHpPct ?? 1));
      body.invuln = match.config.invulnSeconds;
    }
    if (target.isBot && match.botsGodmode) target.godmode = true;
    if (match.phase === "ended" && match.mode === "masmorra") {
      match.phase = "dungeon";
      match.winnerId = null;
      if (match.dungeon) match.dungeon.result = null;
    }
    addLog(match, `${target.name} reviveu`);
    pushBanner(match, { kind: "info", title: `${target.name} reviveu`, life: 3.2 });
    return { status: "revived", name: target.name };
  }
  const entity = heroEntity(match, target);
  const down = target.eliminated || target.lives <= 0 || target.respawnIn > 0 || !entity?.alive;
  if (!down) return { status: "alive" };
  const ended = match.phase === "ended";
  if (target.eliminated || target.lives <= 0) {
    target.eliminated = false;
    target.surrendered = false;
    target.eliminatedAt = null;
    target.lives = 1;
    target.ready = false;
    target.waveClear = false;
  }
  target.respawnIn = 0;
  if (target.isBot && match.botsGodmode) target.godmode = true;
  if (ended) {
    match.winnerId = null;
    match.phase = "hub";
    beginHub(match);
  } else if (match.phase === "hub") {
    const fighters = alivePlayers(match);
    const index = Math.max(0, fighters.findIndex((player) => player.id === target.id));
    sendToHub(match, target, index, Math.max(1, fighters.length));
  } else {
    const inDuel = match.phase === "duel" && match.duel.some((pair) => pair.a === target.id || pair.b === target.id);
    if (!inDuel) sendHome(match, target);
    respawnHero(match, target);
    if (match.phase === "pve") target.waveClear = arenaQuiet(match, target.arenaId);
  }
  addLog(match, `${target.name} reviveu`);
  pushBanner(match, { kind: "info", title: `${target.name} reviveu`, life: 3.2 });
  return { status: "revived", name: target.name };
}
