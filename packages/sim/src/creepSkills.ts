import type { CreepSkillDef } from "@game/shared";
import { dealDamage } from "./damage.js";
import { getCreepSkill, registerCreepSkill } from "./registry.js";
import { spawnCreep } from "./spawn.js";
import type { Entity, Match } from "./types.js";
import { creepById, dist, emitFx, floatText, roundScale } from "./world.js";

function heroesNear(match: Match, creep: Entity) {
  return match.entities.filter(
    (entity) => entity.alive && entity.kind === "hero" && entity.arenaId === creep.arenaId && entity.team !== creep.team,
  );
}

function nearestHero(match: Match, creep: Entity, range: number) {
  let best: Entity | null = null;
  let bestGap = range;
  for (const hero of heroesNear(match, creep)) {
    const gap = dist(creep, hero);
    if (gap > bestGap) continue;
    best = hero;
    bestGap = gap;
  }
  return best ? { hero: best, gap: bestGap } : null;
}

function scaledDamage(match: Match, amount: number) {
  return amount * roundScale(match).damage;
}

registerCreepSkill("charge", (match, creep, skill) => {
  const range = skill.range ?? 0;
  const speed = skill.speed ?? 0;
  const found = nearestHero(match, creep, range);
  if (!found || found.gap <= creep.attackRange || speed <= 0) return false;
  const dx = (found.hero.x - creep.x) / found.gap;
  const dy = (found.hero.y - creep.y) / found.gap;
  creep.chargeVx = dx * speed;
  creep.chargeVy = dy * speed;
  creep.skillLeft = range / speed;
  creep.skillStep = "charge";
  creep.chargeHit = false;
  creep.facing = Math.atan2(dy, dx);
  emitFx(match, {
    kind: "slash",
    x: creep.x,
    y: creep.y,
    radius: 1.2,
    color: creep.color,
    arenaId: creep.arenaId,
    life: 0.24,
  });
  return true;
});

registerCreepSkill("burst", (match, creep, skill) => {
  const range = skill.range ?? 0;
  if (!nearestHero(match, creep, range)) return false;
  const windup = creep.attackWindup ?? 0;
  creep.skillStep = "burst";
  creep.skillLeft = windup;
  creep.winding = windup;
  if (windup <= 0) popBurst(match, creep, skill);
  return true;
});

registerCreepSkill("summon", (match, creep, skill) => {
  const creepId = skill.creepId;
  const cap = skill.count ?? 1;
  if (!creepId || !creepById(match, creepId)) return false;
  const living = match.entities.filter((entity) => entity.alive && entity.summonedBy === creep.id).length;
  if (living >= cap) return false;
  const before = match.entities.length;
  spawnCreep(match, creep.arenaId, creepId);
  const spawned = match.entities.length > before ? match.entities[match.entities.length - 1] : undefined;
  if (!spawned || spawned.defId !== creepId) return false;
  const angle = creep.facing + Math.PI;
  spawned.x = creep.x + Math.cos(angle) * (creep.radius + spawned.radius + 0.35);
  spawned.y = creep.y + Math.sin(angle) * (creep.radius + spawned.radius + 0.35);
  spawned.summonedBy = creep.id;
  emitFx(match, {
    kind: "flash",
    x: spawned.x,
    y: spawned.y,
    radius: 1.1,
    color: creep.color,
    arenaId: creep.arenaId,
    life: 0.3,
  });
  return true;
});

registerCreepSkill("mend", (match, creep, skill) => {
  const range = skill.range ?? 0;
  const amount = (skill.amount ?? 0) * roundScale(match).hp;
  let wounded: Entity | null = null;
  let lowest = 1;
  for (const ally of match.entities) {
    if (!ally.alive || ally.id === creep.id || ally.team !== creep.team || ally.arenaId !== creep.arenaId) continue;
    if (ally.hp >= ally.maxHp) continue;
    if (dist(creep, ally) > range + ally.radius) continue;
    const ratio = ally.hp / ally.maxHp;
    if (ratio >= lowest) continue;
    wounded = ally;
    lowest = ratio;
  }
  if (!wounded || amount <= 0) return false;
  const healed = Math.min(amount, wounded.maxHp - wounded.hp);
  wounded.hp += healed;
  floatText(match, wounded, `+${Math.round(healed)}`);
  emitFx(match, {
    kind: "flash",
    x: wounded.x,
    y: wounded.y,
    radius: 1.15,
    color: "#8fdb67",
    arenaId: wounded.arenaId,
    life: 0.28,
  });
  return true;
});

registerCreepSkill("bolt", (match, creep, skill) => {
  const found = nearestHero(match, creep, skill.range ?? 0);
  if (!found) return false;
  dealDamage(match, {
    source: creep,
    target: found.hero,
    amount: scaledDamage(match, skill.damage ?? 0),
    abilityId: creep.defId,
  });
  creep.swing = (creep.swing ?? 0) + 1;
  creep.facing = Math.atan2(found.hero.y - creep.y, found.hero.x - creep.x);
  emitFx(match, {
    kind: "bolt",
    x: creep.x,
    y: creep.y,
    x2: found.hero.x,
    y2: found.hero.y,
    radius: 0.22,
    color: creep.color,
    arenaId: creep.arenaId,
    life: 0.22,
  });
  return true;
});

function popBurst(match: Match, creep: Entity, skill: CreepSkillDef) {
  const radius = skill.radius ?? 0;
  emitFx(match, {
    kind: "ring",
    x: creep.x,
    y: creep.y,
    radius,
    color: creep.color,
    arenaId: creep.arenaId,
    life: 0.32,
  });
  for (const hero of heroesNear(match, creep)) {
    if (dist(creep, hero) > radius + hero.radius) continue;
    dealDamage(match, {
      source: creep,
      target: hero,
      amount: scaledDamage(match, skill.damage ?? 0),
      abilityId: creep.defId,
    });
  }
  creep.swing = (creep.swing ?? 0) + 1;
  creep.skillStep = "";
  creep.winding = 0;
}

function tickCharge(match: Match, creep: Entity, dt: number) {
  creep.skillLeft = Math.max(0, (creep.skillLeft ?? 0) - dt);
  creep.x += (creep.chargeVx ?? 0) * dt;
  creep.y += (creep.chargeVy ?? 0) * dt;
  if (!creep.chargeHit) {
    const skill = creepById(match, creep.defId)?.skill;
    for (const hero of heroesNear(match, creep)) {
      if (dist(creep, hero) > creep.radius + hero.radius + 0.12) continue;
      dealDamage(match, {
        source: creep,
        target: hero,
        amount: scaledDamage(match, skill?.damage ?? creep.damage),
        abilityId: creep.defId,
      });
      creep.chargeHit = true;
      creep.swing = (creep.swing ?? 0) + 1;
      break;
    }
  }
  if ((creep.skillLeft ?? 0) <= 0) creep.skillStep = "";
}

function tickBurst(match: Match, creep: Entity, dt: number) {
  creep.skillLeft = Math.max(0, (creep.skillLeft ?? 0) - dt);
  creep.winding = creep.skillLeft;
  if ((creep.skillLeft ?? 0) > 0) return;
  const skill = creepById(match, creep.defId)?.skill;
  if (skill) popBurst(match, creep, skill);
  else creep.skillStep = "";
}

export function creepSkillBusy(match: Match, creep: Entity, dt: number) {
  if (creep.skillStep === "charge") {
    tickCharge(match, creep, dt);
    return true;
  }
  if (creep.skillStep === "burst") {
    tickBurst(match, creep, dt);
    return true;
  }
  const skill = creepById(match, creep.defId)?.skill;
  if (!skill) return false;
  creep.skillTimer = Math.max(0, (creep.skillTimer ?? 0) - dt);
  if ((creep.skillTimer ?? 0) > 0) return false;
  const fn = getCreepSkill(skill.kind);
  if (!fn?.(match, creep, skill)) return false;
  creep.skillTimer = skill.cooldown;
  return creep.skillStep === "charge" || creep.skillStep === "burst";
}

export function assertCreepSkills(creeps: { id: string; skill?: CreepSkillDef }[]) {
  for (const creep of creeps) {
    const skill = creep.skill;
    if (!skill) continue;
    if (!getCreepSkill(skill.kind)) throw new Error(`Skill desconhecida em ${creep.id}: ${skill.kind}`);
    const missing = missingField(skill);
    if (missing) throw new Error(`Skill ${skill.kind} de ${creep.id} precisa de ${missing}`);
  }
}

function missingField(skill: CreepSkillDef) {
  if (skill.kind === "charge") {
    if (skill.damage == null) return "damage";
    if (skill.range == null) return "range";
    if (skill.speed == null) return "speed";
  }
  if (skill.kind === "burst") {
    if (skill.damage == null) return "damage";
    if (skill.range == null) return "range";
    if (skill.radius == null) return "radius";
  }
  if (skill.kind === "summon") {
    if (!skill.creepId) return "creepId";
    if (skill.count == null) return "count";
  }
  if (skill.kind === "mend") {
    if (skill.amount == null) return "amount";
    if (skill.range == null) return "range";
  }
  if (skill.kind === "bolt") {
    if (skill.damage == null) return "damage";
    if (skill.range == null) return "range";
  }
  return "";
}
