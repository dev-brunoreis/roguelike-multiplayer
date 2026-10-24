import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./schema.js";

const file = process.env.DATABASE_PATH
  ?? join(dirname(fileURLToPath(import.meta.url)), "../../../data/game.sqlite");

mkdirSync(dirname(file), { recursive: true });

const sqlite = new DatabaseSync(file);
sqlite.exec("PRAGMA journal_mode=WAL");
sqlite.exec("PRAGMA synchronous=NORMAL");
sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY)");
const applied = new Set(
  (sqlite.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((row) => row.id),
);
const mark = sqlite.prepare("INSERT INTO schema_migrations (id) VALUES (?)");
for (const migration of MIGRATIONS) {
  if (applied.has(migration.id)) continue;
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(migration.sql);
    mark.run(migration.id);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export const dbFile = file;

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface MatchRow {
  id: string;
  createdAt: number;
  endedAt: number | null;
  winnerId: string | null;
  winnerName: string | null;
  configJson: string;
  dataVersion: string;
  seed: number;
}

export interface MatchPlayerRow {
  matchId: string;
  userId: string | null;
  name: string;
  heroId: string;
  isBot: number;
  placement: number | null;
  damage: number;
  kills: number;
  deaths: number;
  cardsJson: string;
  eliminated: number;
}

export interface EventRow {
  matchId: string;
  round: number;
  playerId: string | null;
  type: string;
  payload: string;
  createdAt: number;
}

const findUserStmt = sqlite.prepare("SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE lower(username) = lower(?)");
const insertUserStmt = sqlite.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)");
const insertMatchStmt = sqlite.prepare(`
  INSERT INTO matches (id, created_at, ended_at, winner_id, winner_name, config_json, data_version, seed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlayerStmt = sqlite.prepare(`
  INSERT INTO match_players (match_id, user_id, name, hero_id, is_bot, placement, damage, kills, deaths, cards_json, eliminated)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertEventStmt = sqlite.prepare(`
  INSERT INTO events (match_id, round, player_id, type, payload, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const finishMatchStmt = sqlite.prepare("UPDATE matches SET ended_at = ?, winner_id = ?, winner_name = ? WHERE id = ?");
const updatePlayerStmt = sqlite.prepare(`
  UPDATE match_players
  SET placement = ?, damage = ?, kills = ?, deaths = ?, cards_json = ?, eliminated = ?
  WHERE id = ?
`);
const recentStmt = sqlite.prepare(`
  SELECT id, created_at AS createdAt, ended_at AS endedAt, winner_id AS winnerId, winner_name AS winnerName,
         config_json AS configJson, data_version AS dataVersion, seed
  FROM matches ORDER BY created_at DESC LIMIT ?
`);
const playerStmt = sqlite.prepare("SELECT * FROM match_players WHERE match_id = ?");
const eventStmt = sqlite.prepare("SELECT COUNT(*) AS n FROM events WHERE match_id = ?");

export function findUserByName(username: string) {
  const row = findUserStmt.get(username) as UserRow | undefined;
  return row ?? null;
}

export function insertUser(row: { id: string; username: string; passwordHash: string; createdAt: number }) {
  insertUserStmt.run(row.id, row.username, row.passwordHash, row.createdAt);
}

export function insertMatch(row: MatchRow) {
  insertMatchStmt.run(row.id, row.createdAt, row.endedAt ?? null, row.winnerId ?? null, row.winnerName ?? null, row.configJson, row.dataVersion, row.seed);
}

export function insertMatchPlayer(row: MatchPlayerRow) {
  const result = insertPlayerStmt.run(
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
  return Number(result.lastInsertRowid);
}

export function insertEvents(rows: EventRow[]) {
  if (rows.length === 0) return;
  sqlite.exec("BEGIN");
  try {
    for (const row of rows) {
      insertEventStmt.run(row.matchId, row.round, row.playerId ?? null, row.type, row.payload, row.createdAt);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export function finishMatch(id: string, winnerId: string | null, winnerName: string | null) {
  finishMatchStmt.run(Date.now(), winnerId, winnerName, id);
}

export function updateMatchPlayer(
  rowId: number,
  patch: { placement: number | null; damage: number; kills: number; deaths: number; cardsJson: string; eliminated: number },
) {
  updatePlayerStmt.run(patch.placement, patch.damage, patch.kills, patch.deaths, patch.cardsJson, patch.eliminated, rowId);
}

export function recentMatches(limit = 20) {
  const list = recentStmt.all(limit) as unknown as MatchRow[];
  return list.map((match) => ({
    ...match,
    players: playerStmt.all(match.id),
    events: Number((eventStmt.get(match.id) as { n: number } | undefined)?.n ?? 0),
  }));
}
