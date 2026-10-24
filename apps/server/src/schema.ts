export const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
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
    `,
  },
];
