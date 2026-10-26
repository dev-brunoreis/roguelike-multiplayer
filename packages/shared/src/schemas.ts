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
  duration: z.number().positive().optional(),
  every: z.number().positive().optional(),
  dropRadius: z.number().positive().optional(),
  count: z.number().int().positive().optional(),
  interval: z.number().nonnegative().optional(),
  time: z.number().nonnegative().optional(),
  bursts: z.number().int().positive().optional(),
  spin: z.number().optional(),
  speed: z.number().positive().optional(),
  pierce: z.number().int().nonnegative().optional(),
  amount: z.number().positive().optional(),
  statusTime: z.number().positive().optional(),
  statusValue: z.number().nonnegative().optional(),
  curve: z.number().optional(),
});

export const actionSchema = z.object({
  do: z.string().min(1),
  damage: z.number().nonnegative().optional(),
  range: z.number().positive().optional(),
  radius: z.number().positive().optional(),
  angle: z.number().positive().optional(),
  speed: z.number().positive().optional(),
  targets: z.number().int().positive().optional(),
  falloff: z.array(z.number().nonnegative()).optional(),
  duration: z.number().positive().optional(),
  every: z.number().positive().optional(),
  dropRadius: z.number().positive().optional(),
  count: z.number().int().positive().optional(),
  interval: z.number().nonnegative().optional(),
  time: z.number().nonnegative().optional(),
  bursts: z.number().int().positive().optional(),
  spin: z.number().optional(),
  pierce: z.number().int().nonnegative().optional(),
  amount: z.number().positive().optional(),
  statusTime: z.number().positive().optional(),
  statusValue: z.number().nonnegative().optional(),
  curve: z.number().optional(),
  drops: z.number().nonnegative().optional(),
  shape: z.string().optional(),
  follow: z.enum(["point", "caster", "trail"]).optional(),
  at: z.enum(["caster", "aim"]).optional(),
  status: z.string().optional(),
  vfx: z.string().optional(),
  creepId: z.string().optional(),
  windup: z.boolean().optional(),
  returns: z.boolean().optional(),
});

export const abilitySchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string(),
  targeting: z.string().min(1),
  tags: z.array(z.string()),
  color: z.string(),
  vfx: z.string().optional(),
  cast: z.array(actionSchema).min(1),
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

export const spellSchema = z.object({
  id: z.string().min(1).optional(),
  cooldown: z.number().positive(),
  vfx: z.string().optional(),
  cast: z.array(actionSchema).min(1),
});

export const bossPhaseSchema = z.object({
  hpBelow: z.number().positive().max(1),
  rotation: z.array(z.string().min(1)).min(1),
  speedMul: z.number().positive().optional(),
});

export const creepSkillSchema = spellSchema;

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
  skill: spellSchema.optional(),
  skills: z.array(spellSchema).optional(),
  phases: z.array(bossPhaseSchema).optional(),
  aggro: z.object({
    radius: z.number().positive(),
    leash: z.number().positive(),
  }).optional(),
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

export const dungeonSpawnSchema = z.object({
  creepId: z.string().min(1),
  count: z.number().int().positive(),
});

export const dungeonObstacleSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("circle"),
    x: z.number(),
    y: z.number(),
    r: z.number().positive(),
  }),
  z.object({
    shape: z.literal("box"),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
]);

export const dungeonLayoutSchema = z.object({
  id: z.string().min(1),
  roles: z.array(z.enum(["entrance", "fight", "rest", "elite", "boss"])).min(1),
  obstacles: z.array(dungeonObstacleSchema),
});

export const dungeonSchema = z.object({
  roomsMin: z.number().int().min(3),
  roomsMax: z.number().int().min(3),
  roomSizes: z.array(z.number().positive()).min(1),
  cellSize: z.number().positive(),
  extraLinks: z.number().int().nonnegative(),
  restRooms: z.number().int().nonnegative(),
  eliteRooms: z.number().int().nonnegative(),
  aggroRadius: z.number().positive(),
  leashRadius: z.number().positive(),
  portalRadius: z.number().positive(),
  portalCooldown: z.number().nonnegative(),
  reviveSeconds: z.number().positive(),
  reviveRadius: z.number().positive(),
  reviveHpPct: z.number().positive().max(1),
  depthHp: z.number().nonnegative(),
  depthDamage: z.number().nonnegative(),
  navCell: z.number().positive(),
  repathSeconds: z.number().positive(),
  callRadius: z.number().positive(),
  giveUpSeconds: z.number().positive(),
  returnSpeedMul: z.number().positive(),
  flankRadius: z.number().nonnegative(),
  layouts: z.array(dungeonLayoutSchema).min(1),
  encounters: z.array(z.object({
    depth: z.number().int().nonnegative(),
    spawns: z.array(dungeonSpawnSchema).min(1),
  })).min(1),
  elites: z.array(dungeonSpawnSchema).min(1),
  bosses: z.array(z.object({ creepId: z.string().min(1) })).min(1),
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
  armorConstant: z.number().positive().default(50),
  executeHpRatio: z.number().min(0).max(1).default(0.35),
  splashRadius: z.number().positive().default(2.1),
  startCooldown: z.number().nonnegative().default(0.35),
  grantCooldown: z.number().nonnegative().default(0.2),
  stunImmuneSeconds: z.number().nonnegative().default(2.5),
  bossSeconds: z.number().positive().default(45),
  maxShotsPerArena: z.number().int().positive().default(96),
  shadowColors: z.array(z.string()).min(1),
});

export const clientInputSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  aimX: z.number().finite().optional(),
  aimY: z.number().finite().optional(),
});

export const pickSchema = z.object({
  cardId: z.string().min(1),
});

export const shopActionSchema = z.object({
  kind: z.enum(["buy", "upgrade", "reroll", "ready"]),
  cardId: z.string().min(1).optional(),
  abilityId: z.string().min(1).optional(),
});

export const betSchema = z.object({
  targetId: z.string().min(1),
  amount: z.number().finite(),
});

export const pauseSchema = z.object({
  want: z.boolean(),
});

export const watchSchema = z.object({
  playerId: z.string().min(1),
});

export const matchOptionsSchema = z.object({
  slots: z.number().int().min(1).max(8).optional(),
  fillWithBots: z.boolean().optional(),
  lives: z.number().int().min(1).max(9).optional(),
  cardsPerLevelUp: z.number().int().min(2).max(8).optional(),
  mode: z.enum(["arena", "masmorra"]).optional(),
});

export const vfxDefSchema = z.object({
  id: z.string().min(1),
  frames: z.number().int().positive(),
  fps: z.number().positive(),
  loop: z.boolean(),
  wide: z.number().positive(),
  tall: z.number().positive(),
  tint: z.boolean(),
  aim: z.boolean(),
  sheet: z.string(),
  builtin: z.enum(["orb", "arrow", "spear", "dart", "blade"]).optional(),
});

export const vfxVisualSchema = z.object({
  defs: z.array(vfxDefSchema).min(1),
  byAbility: z.record(z.string(), z.string()),
  fxKind: z.record(z.string(), z.string()),
  bolt: z.object({
    vfx: z.string().min(1),
    tall: z.number().positive(),
  }),
});

export const actorFpsSchema = z.object({
  idle: z.number().positive(),
  run: z.number().positive(),
  attack: z.number().positive(),
  hit: z.number().positive(),
});

export const actorKindSchema = z.object({
  bodyMul: z.number().positive(),
  fps: actorFpsSchema,
  attackSeconds: z.number().positive(),
});

export const actorViewSchema = z.object({
  source: z.enum(["pack", "drawn"]).optional(),
  bodyMul: z.number().positive().optional(),
  fps: actorFpsSchema.partial().optional(),
  attackSeconds: z.number().positive().optional(),
});

export const actorsVisualSchema = z.object({
  byKind: z.object({
    hero: actorKindSchema,
    boss: actorKindSchema,
    creep: actorKindSchema,
  }),
  views: z.record(z.string(), actorViewSchema),
});

export const labVisualSchema = z.object({
  arenaSize: z.number().positive(),
  caster: z.object({ x: z.number(), y: z.number() }),
  dummies: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
  creep: z.object({ x: z.number(), y: z.number() }),
  previewSeconds: z.number().positive(),
  dummyCreep: z.string().min(1),
  presets: z.array(z.object({
    id: z.string().min(1),
    zoom: z.number().positive(),
  })).default([]),
});

export type AbilityLevel = z.infer<typeof abilityLevelSchema>;
export type ActionDef = z.infer<typeof actionSchema>;
export type SpellDef = z.infer<typeof spellSchema>;
export type BossPhaseDef = z.infer<typeof bossPhaseSchema>;
export type AbilityDef = z.infer<typeof abilitySchema>;
export type EffectDef = z.infer<typeof effectSchema>;
export type CardDef = z.infer<typeof cardSchema>;
export type HeroDef = z.infer<typeof heroSchema>;
export type CreepSkillDef = z.infer<typeof creepSkillSchema>;
export type CreepDef = z.infer<typeof creepSchema>;
export type WaveDef = z.infer<typeof waveSchema>;
export type BossDef = z.infer<typeof bossSchema>;
export type DungeonDef = z.infer<typeof dungeonSchema>;
export type SynergyDef = z.infer<typeof synergySchema>;
export type MatchConfig = z.infer<typeof matchConfigSchema>;
export type MatchOptions = z.infer<typeof matchOptionsSchema>;
export type VfxDefData = z.infer<typeof vfxDefSchema>;
export type VfxVisual = z.infer<typeof vfxVisualSchema>;
export type ActorKindVisual = z.infer<typeof actorKindSchema>;
export type ActorViewVisual = z.infer<typeof actorViewSchema>;
export type ActorsVisual = z.infer<typeof actorsVisualSchema>;
export type LabVisual = z.infer<typeof labVisualSchema>;
export type ClientInputMessage = z.infer<typeof clientInputSchema>;
export type PickMessage = z.infer<typeof pickSchema>;
export type PauseMessage = z.infer<typeof pauseSchema>;
export type WatchMessage = z.infer<typeof watchSchema>;
