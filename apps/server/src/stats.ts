import type { Match, PersistEvent } from "@game/sim";
import { buildSnapshot, isPersist } from "@game/sim";
import { finishMatch, insertEvents, insertMatch, insertMatchPlayer, updateMatchPlayer } from "./db.js";

export class StatsWriter {
  private rows = new Map<string, number>();

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
      const rowId = insertMatchPlayer({
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
      this.rows.set(player.id, rowId);
    }
  }

  write(list: PersistEvent[]) {
    const now = Date.now();
    insertEvents(list.filter(isPersist).map((event) => ({
      matchId: this.matchId,
      round: event.round,
      playerId: "playerId" in event ? (event.playerId ?? null) : null,
      type: event.type,
      payload: JSON.stringify(event),
      createdAt: now,
    })));
  }

  finish(match: Match) {
    const snap = buildSnapshot(match, "");
    const winner = match.players.find((player) => player.id === match.winnerId);
    finishMatch(this.matchId, match.winnerId, winner?.name ?? null);
    for (const player of snap.players) {
      const rowId = this.rows.get(player.id);
      if (rowId == null) continue;
      updateMatchPlayer(rowId, {
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
