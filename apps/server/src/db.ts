import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { events, matchPlayers, matches } from "./schema.js";

const file = process.env.DATABASE_PATH
  ?? join(dirname(fileURLToPath(import.meta.url)), "../../../data/game.sqlite");

mkdirSync(dirname(file), { recursive: true });

const sqlite = new DatabaseSync(file);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    ended_at INTEGER,
    winner_id TEXT,
    winner_name TEXT,
    config_json TEXT NOT NULL,
    data_version TEXT NOT NULL,
    seed INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS match_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    hero_id TEXT NOT NULL,
    is_bot INTEGER NOT NULL,
    placement INTEGER,
    damage INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    cards_json TEXT NOT NULL DEFAULT '[]',
    eliminated INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    player_id TEXT,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_match_idx ON events (match_id);
`);

export const dbFile = file;

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export function findUserByName(username: string) {
  const row = sqlite.prepare("SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE lower(username) = lower(?)").get(username) as UserRow | undefined;
  return row ?? null;
}

export function insertUser(row: { id: string; username: string; passwordHash: string; createdAt: number }) {
  sqlite.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(row.id, row.username, row.passwordHash, row.createdAt);
}

export function insertMatch(row: typeof matches.$inferInsert) {
  sqlite.prepare(`
    INSERT INTO matches (id, created_at, ended_at, winner_id, winner_name, config_json, data_version, seed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.createdAt, row.endedAt ?? null, row.winnerId ?? null, row.winnerName ?? null, row.configJson, row.dataVersion, row.seed);
}

export function insertMatchPlayer(row: typeof matchPlayers.$inferInsert) {
  sqlite.prepare(`
    INSERT INTO match_players (match_id, user_id, name, hero_id, is_bot, placement, damage, kills, deaths, cards_json, eliminated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.matchId,
    row.userId ?? null,
    row.name,
    row.heroId,
    row.isBot,
    row.placement ?? null,
    row.damage ?? 0,
    row.kills ?? 0,
    row.deaths ?? 0,
    row.cardsJson ?? "[]",
    row.eliminated ?? 0,
  );
}

export function insertEvent(row: typeof events.$inferInsert) {
  sqlite.prepare(`
    INSERT INTO events (match_id, round, player_id, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.matchId, row.round, row.playerId ?? null, row.type, row.payload, row.createdAt);
}

export function finishMatch(id: string, winnerId: string | null, winnerName: string | null) {
  sqlite.prepare("UPDATE matches SET ended_at = ?, winner_id = ?, winner_name = ? WHERE id = ?").run(Date.now(), winnerId, winnerName, id);
}

export function updateMatchPlayer(
  matchId: string,
  name: string,
  patch: { placement: number | null; damage: number; kills: number; deaths: number; cardsJson: string; eliminated: number },
) {
  sqlite.prepare(`
    UPDATE match_players
    SET placement = ?, damage = ?, kills = ?, deaths = ?, cards_json = ?, eliminated = ?
    WHERE match_id = ? AND name = ?
  `).run(patch.placement, patch.damage, patch.kills, patch.deaths, patch.cardsJson, patch.eliminated, matchId, name);
}

export function recentMatches(limit = 20) {
  const list = sqlite.prepare(`
    SELECT id, created_at AS createdAt, ended_at AS endedAt, winner_id AS winnerId, winner_name AS winnerName,
           config_json AS configJson, data_version AS dataVersion, seed
    FROM matches ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Array<{
    id: string;
    createdAt: number;
    endedAt: number | null;
    winnerId: string | null;
    winnerName: string | null;
    configJson: string;
    dataVersion: string;
    seed: number;
  }>;
  const playerStmt = sqlite.prepare("SELECT * FROM match_players WHERE match_id = ?");
  const eventStmt = sqlite.prepare("SELECT COUNT(*) AS n FROM events WHERE match_id = ?");
  return list.map((match) => ({
    ...match,
    players: playerStmt.all(match.id),
    events: Number((eventStmt.get(match.id) as { n: number } | undefined)?.n ?? 0),
  }));
}
