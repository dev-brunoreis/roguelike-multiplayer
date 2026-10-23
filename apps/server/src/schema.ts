import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  endedAt: integer("ended_at"),
  winnerId: text("winner_id"),
  winnerName: text("winner_name"),
  configJson: text("config_json").notNull(),
  dataVersion: text("data_version").notNull(),
  seed: integer("seed").notNull(),
});

export const matchPlayers = sqliteTable("match_players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: text("match_id").notNull(),
  userId: text("user_id"),
  name: text("name").notNull(),
  heroId: text("hero_id").notNull(),
  isBot: integer("is_bot").notNull(),
  placement: integer("placement"),
  damage: integer("damage").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
  cardsJson: text("cards_json").notNull().default("[]"),
  eliminated: integer("eliminated").notNull().default(0),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: text("match_id").notNull(),
  round: integer("round").notNull(),
  playerId: text("player_id"),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});
