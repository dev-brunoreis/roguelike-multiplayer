import type { Match } from "./types.js";
import { emit } from "./world.js";
import { arenaById, creepById, emptySkill, roundScale } from "./world.js";

export function spawnCreep(
  match: Match,
  arenaId: string,
  creepId: string,
  at?: { x: number; y: number; scale?: { hp: number; damage: number }; home?: boolean },
) {
  const def = creepById(match, creepId);
  const arena = arenaById(match, arenaId);
  if (!def || !arena) return;
  const scale = at?.scale ?? roundScale(match);
  const pad = 2;
  const x = at?.x ?? arena.x + pad + match.rng.next() * Math.max(1, arena.size - pad * 2);
  const y = at?.y ?? arena.y + pad + match.rng.next() * Math.max(1, arena.size - pad * 2);
  match.entities.push({
    id: match.nextId++,
    kind: def.kind,
    defId: def.id,
    arenaId,
    x,
    y,
    radius: def.radius,
    hp: def.hp * scale.hp,
    maxHp: def.hp * scale.hp,
    speed: def.speed,
    damage: def.damage * scale.damage,
    attackCooldown: def.attackCooldown,
    attackTimer: def.attackCooldown * 0.5,
    attackRange: def.attackRange,
    attackWindup: def.attackWindup,
    winding: 0,
    armor: def.armor,
    xp: def.xp,
    gold: def.gold,
    color: def.color,
    team: "enemy",
    alive: true,
    invuln: 0,
    flash: 0,
    swing: 0,
    facing: 0,
    behavior: def.behavior,
  });
  const skill = emptySkill();
  if (def.skill) skill.timer = def.skill.cooldown * 0.45;
  if (at?.home) {
    skill.homeX = x;
    skill.homeY = y;
  }
  match.skillState.set(match.entities[match.entities.length - 1]!.id, skill);
  match.entitiesById.set(match.entities[match.entities.length - 1]!.id, match.entities[match.entities.length - 1]!);
}

export function flushDamage(match: Match) {
  for (const player of match.players) {
    if (Object.keys(player.phaseDamage).length === 0) continue;
    emit(match, {
      type: "damage_summary",
      round: match.round,
      playerId: player.id,
      byAbility: player.phaseDamage,
    });
    player.phaseDamage = {};
  }
}
