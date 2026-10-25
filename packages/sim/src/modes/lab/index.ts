import type { AbilityLevel } from "@game/shared";
import { simulateCombat } from "../../combat.js";
import { registerCreepBehavior, registerMode } from "../../registry.js";
import { castSpell } from "../../spells/cast.js";
import { spawnCreep } from "../../spawn.js";
import type { Entity, GameMode, Match, PlayerState } from "../../types.js";
import { clearHazards, creepById, heroEntity, skillOf, syncWorld } from "../../world.js";

interface Bag {
  dummies: Map<number, { x: number; y: number }>;
  holdHero: boolean;
  holdCreeps: boolean;
}

const bags = new WeakMap<Match, Bag>();

function bag(match: Match): Bag {
  let found = bags.get(match);
  if (!found) {
    found = { dummies: new Map(), holdHero: true, holdCreeps: false };
    bags.set(match, found);
  }
  return found;
}

function pin(match: Match) {
  const state = bag(match);
  for (const [id, home] of state.dummies) {
    const entity = match.entitiesById.get(id);
    if (!entity) continue;
    entity.alive = true;
    entity.hp = entity.maxHp;
    entity.speed = 0;
    entity.x = home.x;
    entity.y = home.y;
    entity.behavior = "still";
    const skill = skillOf(match, entity.id);
    skill.timer = 9999;
    skill.step = "";
  }
  if (state.holdCreeps) {
    for (const entity of match.entities) {
      if (entity.kind === "hero" || state.dummies.has(entity.id)) continue;
      entity.speed = 0;
      entity.behavior = "still";
      const skill = skillOf(match, entity.id);
      skill.timer = 9999;
      skill.step = "";
    }
  }
  if (state.holdHero) {
    for (const player of match.players) {
      for (const slot of player.abilities) {
        if (slot.cooldown < 1) slot.cooldown = 1;
      }
    }
  }
}

registerCreepBehavior("still", () => {});

export const labMode: GameMode = {
  id: "lab",
  bot: "simple",
  setup(match) {
    const size = match.config.arenaSize;
    const player = match.players[0];
    match.arenas.push({
      id: "lab",
      x: -size / 2,
      y: -size / 2,
      size,
      ownerId: player?.id ?? null,
      kind: "pve",
      label: "Lab",
    });
    if (!player) return;
    player.arenaId = "lab";
    player.godmode = true;
    const hero = heroEntity(match, player);
    if (!hero) return;
    hero.arenaId = "lab";
    hero.x = 0;
    hero.y = 0;
    match.phase = "pve";
    match.phaseTime = 9999;
    syncWorld(match);
  },
  update(match, dt) {
    pin(match);
    simulateCombat(match, dt);
    pin(match);
    match.phaseTime = 9999;
  },
  checkEnd() {},
  onHeroKilled() {},
  offerOnLevel() {
    return false;
  },
  interest(match) {
    return new Set(match.arenas.map((arena) => arena.id));
  },
};

registerMode("lab", labMode);

export function labHold(match: Match, flags: { hero?: boolean; creeps?: boolean }) {
  const state = bag(match);
  if (flags.hero != null) state.holdHero = flags.hero;
  if (flags.creeps != null) state.holdCreeps = flags.creeps;
}

export function labClear(match: Match) {
  match.entities = match.entities.filter((entity) => entity.kind === "hero");
  clearHazards(match);
  match.fx = [];
  match.floats = [];
  bag(match).dummies.clear();
  syncWorld(match);
}

export function labSpawn(
  match: Match,
  creepId: string,
  at: { x: number; y: number },
  opts?: { dummy?: boolean },
) {
  const id = match.nextId;
  spawnCreep(match, "lab", creepId, { x: at.x, y: at.y, scale: { hp: 1, damage: 1 }, home: true });
  const entity = match.entities.find((item) => item.id === id);
  if (!entity) return null;
  if (opts?.dummy) {
    entity.behavior = "still";
    entity.speed = 0;
    bag(match).dummies.set(entity.id, { x: at.x, y: at.y });
    pin(match);
  }
  return entity.id;
}

export function labAim(match: Match, playerId: string, x: number, y: number) {
  const player = match.players.find((item) => item.id === playerId);
  if (!player) return;
  player.aimX = x;
  player.aimY = y;
}

export function labSetLevel(match: Match, playerId: string, abilityId: string, level: number) {
  const player = match.players.find((item) => item.id === playerId);
  const ability = match.data.byId.abilities.get(abilityId);
  if (!player || !ability) return;
  const lv = Math.min(ability.levels.length, Math.max(1, Math.round(level)));
  player.abilities = [{ abilityId, level: lv, cooldown: 999, cooldownMax: 999 }];
}

function creepSpells(match: Match, entity: Entity) {
  const def = creepById(match, entity.defId);
  if (!def) return [];
  return [...(def.skills ?? []), ...(def.skill ? [def.skill] : [])];
}

export function labCast(
  match: Match,
  entityId: number,
  spellId: string,
  opts?: { level?: number; aim?: { x: number; y: number }; skillIndex?: number },
) {
  const caster = match.entities.find((entity) => entity.id === entityId);
  if (!caster?.alive) return false;
  const player = caster.playerId ? match.players.find((item) => item.id === caster.playerId) ?? null : null;
  if (opts?.aim && player) {
    player.aimX = opts.aim.x;
    player.aimY = opts.aim.y;
  }
  caster.swing = (caster.swing ?? 0) + 1;
  const ability = match.data.byId.abilities.get(spellId);
  if (ability && caster.kind === "hero") {
    const levelIndex = Math.min(ability.levels.length, Math.max(1, opts?.level ?? player?.abilities[0]?.level ?? 1)) - 1;
    const level: AbilityLevel | null = ability.levels[levelIndex] ?? null;
    return castSpell(match, caster, ability, {
      player,
      level,
      spellId: ability.id,
      color: ability.color,
      vfx: ability.vfx ?? "",
      targeting: ability.targeting,
    });
  }
  const spells = creepSpells(match, caster);
  const spell = spells.find((item) => item.id === spellId)
    ?? (opts?.skillIndex != null ? spells[opts.skillIndex] : undefined)
    ?? null;
  if (!spell) return false;
  return castSpell(match, caster, spell, {
    player: null,
    level: null,
    spellId: spell.id || spellId,
    color: caster.color,
    vfx: spell.vfx ?? "",
    targeting: "nearest",
  });
}

export function labForcePhase(match: Match, entityId: number, phaseIndex: number) {
  const entity = match.entities.find((item) => item.id === entityId);
  const phases = entity ? creepById(match, entity.defId)?.phases : undefined;
  const target = phases?.[phaseIndex];
  if (!entity || !phases || !target) return;
  const lower = phases.reduce((best, phase) => phase.hpBelow < target.hpBelow ? Math.max(best, phase.hpBelow) : best, 0);
  const ratio = lower === 0 && target.hpBelow >= 1 ? 1 : (lower + target.hpBelow) / 2;
  entity.hp = Math.max(1, entity.maxHp * Math.min(1, ratio));
  const state = skillOf(match, entity.id);
  state.phase = phaseIndex;
  state.rot = 0;
  state.timer = 0.05;
}

export function labHero(match: Match): PlayerState | undefined {
  return match.players[0];
}
