import { z } from "zod";

export const STATS = [
  "damagePct",
  "attackSpeedPct",
  "moveSpeedPct",
  "maxHpFlat",
  "armor",
  "critChance",
  "critMultiplier",
  "lifesteal",
  "areaPct",
  "xpPct",
  "cooldownPct",
] as const;

export const statSchema = z.enum(STATS);
export type StatName = z.infer<typeof statSchema>;

export const abilityLevelSchema = z.object({
  damage: z.number().nonnegative(),
  cooldown: z.number().positive(),
  range: z.number().positive(),
  targets: z.number().int().positive().optional(),
  falloff: z.array(z.number().nonnegative()).optional(),
  radius: z.number().positive().optional(),
  angle: z.number().positive().optional(),
  projectileSpeed: z.number().positive().optional(),
});

export const abilitySchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string(),
  behavior: z.string().min(1),
  targeting: z.string().min(1),
  tags: z.array(z.string()),
  color: z.string(),
  levels: z.array(abilityLevelSchema).min(1),
});

export const effectSchema = z
  .object({
    type: z.string().min(1),
    stat: z.string().optional(),
    value: z.number().optional(),
    abilityId: z.string().optional(),
    hook: z.string().optional(),
  })
  .passthrough();

export const cardSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string(),
  rarity: z.string().min(1),
  weight: z.number().positive(),
  unique: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  requires: z
    .object({
      ability: z.string().optional(),
      missingAbility: z.string().optional(),
    })
    .optional(),
  effects: z.array(effectSchema).min(1),
});

export const heroSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string(),
  color: z.string(),
  hp: z.number().positive(),
  speed: z.number().positive(),
  radius: z.number().positive(),
  startingAbility: z.string().min(1),
});

export const creepSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  damage: z.number().nonnegative(),
  attackCooldown: z.number().positive(),
  attackRange: z.number().positive(),
  attackWindup: z.number().nonnegative().default(0),
  radius: z.number().positive(),
  xp: z.number().nonnegative(),
  gold: z.number().nonnegative(),
  color: z.string(),
  armor: z.number().nonnegative().default(0),
  behavior: z.string().min(1),
  kind: z.enum(["creep", "boss"]).default("creep"),
  dropChance: z.number().min(0).max(1).default(0),
});

export const waveSchema = z.object({
  round: z.number().int().positive(),
  spawns: z
    .array(
      z.object({
        creepId: z.string().min(1),
        count: z.number().int().positive(),
        interval: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const bossSchema = z.object({
  id: z.string().min(1),
  creepId: z.string().min(1),
  nome: z.string(),
  everyRounds: z.number().int().positive(),
});

export const synergySchema = z.object({
  id: z.string().min(1),
  nome: z.string(),
  descricao: z.string(),
  tag: z.string().min(1),
  count: z.number().int().positive(),
  effects: z.array(effectSchema).min(1),
});

export const matchConfigSchema = z.object({
  version: z.string(),
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(1),
  lives: z.number().int().min(1),
  cardsPerLevelUp: z.number().int().min(1),
  maxAbilities: z.number().int().min(1).max(8),
  cardPickSeconds: z.number().positive(),
  pveSeconds: z.number().positive(),
  hubSeconds: z.number().positive(),
  hubSize: z.number().positive(),
  duelAnnounceSeconds: z.number().nonnegative(),
  duelStartRound: z.number().int().min(1),
  duelSeconds: z.number().positive(),
  bettingSeconds: z.number().nonnegative(),
  shopSeconds: z.number().positive(),
  shopSlots: z.number().int().min(1),
  bossEveryRounds: z.number().int().min(1),
  arenaSize: z.number().positive(),
  arenaGap: z.number().nonnegative(),
  tickRate: z.number().int().min(1),
  xpBase: z.number().positive(),
  xpPower: z.number().positive(),
  levelCap: z.number().int().min(1),
  respawnSeconds: z.number().nonnegative(),
  invulnSeconds: z.number().nonnegative(),
  aimSlack: z.number().nonnegative(),
  shadowColors: z.array(z.string()).min(1),
});

export const matchOptionsSchema = z.object({
  slots: z.number().int().min(1).max(8).optional(),
  fillWithBots: z.boolean().optional(),
  lives: z.number().int().min(1).max(9).optional(),
  cardsPerLevelUp: z.number().int().min(2).max(8).optional(),
});

export type AbilityLevel = z.infer<typeof abilityLevelSchema>;
export type AbilityDef = z.infer<typeof abilitySchema>;
export type EffectDef = z.infer<typeof effectSchema>;
export type CardDef = z.infer<typeof cardSchema>;
export type HeroDef = z.infer<typeof heroSchema>;
export type CreepDef = z.infer<typeof creepSchema>;
export type WaveDef = z.infer<typeof waveSchema>;
export type BossDef = z.infer<typeof bossSchema>;
export type SynergyDef = z.infer<typeof synergySchema>;
export type MatchConfig = z.infer<typeof matchConfigSchema>;
export type MatchOptions = z.infer<typeof matchOptionsSchema>;
