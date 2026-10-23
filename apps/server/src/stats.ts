import type { PersistEvent } from "@game/shared";
import type { Match } from "@game/sim";
import { buildSnapshot } from "@game/sim";
import { finishMatch, insertEvent, insertMatch, insertMatchPlayer, updateMatchPlayer } from "./db.js";

const PERSIST = new Set([
  "match_start",
  "card_offer",
  "card_pick",
  "level",
  "death",
  "eliminate",
  "wave_cleared",
  "wave_failed",
  "duel_result",
  "bet",
  "shop",
  "damage_summary",
  "win",
  "synergy",
]);

export class StatsWriter {
  constructor(private matchId: string) {}

  start(match: Match) {
    insertMatch({
      id: this.matchId,
      createdAt: Date.now(),
      endedAt: null,
      winnerId: null,
      winnerName: null,
      configJson: JSON.stringify(match.config),
      dataVersion: match.data.version,
      seed: match.seed,
    });
    for (const player of match.players) {
      insertMatchPlayer({
        matchId: this.matchId,
        userId: player.isBot ? null : player.id,
        name: player.name,
        heroId: player.heroId,
        isBot: player.isBot ? 1 : 0,
        placement: null,
        damage: 0,
        kills: 0,
        deaths: 0,
        cardsJson: "[]",
        eliminated: 0,
      });
    }
  }

  write(list: PersistEvent[]) {
    const now = Date.now();
    for (const event of list) {
      if (!PERSIST.has(event.type)) continue;
      insertEvent({
        matchId: this.matchId,
        round: event.round,
        playerId: "playerId" in event ? (event.playerId ?? null) : null,
        type: event.type,
        payload: JSON.stringify(event),
        createdAt: now,
      });
    }
  }

  finish(match: Match) {
    const snap = buildSnapshot(match, "");
    const winner = match.players.find((player) => player.id === match.winnerId);
    finishMatch(this.matchId, match.winnerId, winner?.name ?? null);
    for (const player of snap.players) {
      updateMatchPlayer(this.matchId, player.name, {
        placement: player.placement,
        damage: player.damageDealt,
        kills: player.kills,
        deaths: player.deaths,
        cardsJson: JSON.stringify(player.cards),
        eliminated: player.eliminated ? 1 : 0,
      });
    }
  }
}
