import type { SpellDef } from "@game/shared";
import { dealDamage } from "../damage.js";
import type { Entity, Match, Zone } from "../types.js";
import { creepById, dist, emitFx, entityById, playerById, skillOf } from "../world.js";
import { popBurst, runAction } from "./actions.js";
import { castSpell } from "./cast.js";
import { launchVolley } from "./shots.js";
import { applyStatus, moveScale } from "./status.js";

function creepSpells(match: Match, creep: Entity): SpellDef[] {
  const def = creepById(match, creep.defId);
  if (!def) return [];
  if (def.skills && def.skills.length > 0) return def.skills;
  return def.skill ? [def.skill] : [];
}

function peekSpell(match: Match, creep: Entity) {
  const list = creepSpells(match, creep);
  if (list.length === 0) return null;
  const def = creepById(match, creep.defId);
  const state = skillOf(match, creep.id);
  const phase = def?.phases?.[state.phase];
  if (!phase) return list[0] ?? null;
  const id = phase.rotation[state.rot % phase.rotation.length];
  return list.find((spell) => spell.id === id) ?? null;
}

export function tickBossPhases(match: Match) {
  for (const entity of match.entities) {
    if (!entity.alive || entity.kind !== "boss") continue;
    const phases = creepById(match, entity.defId)?.phases;
    if (!phases || phases.length === 0) continue;
    const state = skillOf(match, entity.id);
    if (state.pace <= 0) state.pace = entity.speed;
    const ratio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0;
    const order = phases.map((phase, index) => ({ phase, index })).sort((a, b) => a.phase.hpBelow - b.phase.hpBelow);
    let index = order[order.length - 1]?.index ?? 0;
    for (const item of order) {
      if (ratio <= item.phase.hpBelow) {
        index = item.index;
        break;
      }
    }
    if (state.phase !== index) {
      state.phase = index;
      state.rot = 0;
      state.timer = 0;
    }
    entity.speed = state.pace * (phases[index]?.speedMul ?? 1);
  }
}

function tickDash(match: Match, creep: Entity, dt: number) {
  const state = skillOf(match, creep.id);
  const scale = moveScale(match, creep.id);
  state.left = Math.max(0, state.left - dt);
  creep.x += state.vx * dt * scale;
  creep.y += state.vy * dt * scale;
  if (!state.hit) {
    for (const hero of match.entities) {
      if (!hero.alive || hero.team === creep.team || hero.arenaId !== creep.arenaId) continue;
      if (dist(creep, hero) > creep.radius + hero.radius + 0.12) continue;
      dealDamage(match, {
        source: creep,
        target: hero,
        amount: state.payload,
        abilityId: creep.defId,
        crit: state.crit,
      });
      state.hit = true;
      creep.swing = (creep.swing ?? 0) + 1;
      break;
    }
  }
  if (state.left <= 0) state.step = "";
}

function tickWindup(match: Match, creep: Entity, dt: number) {
  const state = skillOf(match, creep.id);
  state.left = Math.max(0, state.left - dt);
  creep.winding = state.left;
  if (state.left > 0) return;
  popBurst(match, creep);
}

export function creepCastBusy(match: Match, creep: Entity, dt: number) {
  const state = skillOf(match, creep.id);
  if (state.step === "dash") {
    tickDash(match, creep, dt);
    return true;
  }
  if (state.step === "burst") {
    tickWindup(match, creep, dt);
    return true;
  }
  const spells = creepSpells(match, creep);
  if (spells.length === 0) return false;
  state.timer = Math.max(0, state.timer - dt);
  if (state.timer > 0) return false;
  const spell = peekSpell(match, creep);
  if (!spell) return false;
  const fired = castSpell(match, creep, spell, {
    player: null,
    level: null,
    spellId: spell.id || creep.defId,
    color: creep.color,
    vfx: spell.vfx ?? "",
    targeting: "nearest",
  });
  if (!fired) return false;
  state.rot += 1;
  state.timer = spell.cooldown;
  const step = skillOf(match, creep.id).step;
  return step === "dash" || step === "burst";
}

function hurtZone(match: Match, zone: Zone, x: number, y: number, radius: number) {
  const owner = playerById(match, zone.ownerId);
  const source = entityById(match, zone.sourceId);
  for (const entity of match.entities) {
    if (!entity.alive || entity.arenaId !== zone.arenaId || entity.team === zone.team) continue;
    if (dist(entity, { x, y }) > radius + entity.radius) continue;
    if (zone.damage > 0) {
      dealDamage(match, {
        source: source ?? undefined,
        sourcePlayer: owner,
        target: entity,
        amount: zone.damage,
        abilityId: zone.spellId,
        crit: zone.crit,
      });
    }
    if (zone.status) {
      applyStatus(match, entity, zone.status, zone.statusTime, zone.statusValue, {
        sourceId: zone.sourceId,
        ownerId: zone.ownerId,
        spellId: zone.spellId,
      });
    }
  }
}

function dropZone(match: Match, zone: Zone) {
  const angle = match.rng.next() * Math.PI * 2;
  const distanced = Math.sqrt(match.rng.next()) * zone.radius;
  const x = zone.x + Math.cos(angle) * distanced;
  const y = zone.y + Math.sin(angle) * distanced;
  hurtZone(match, zone, x, y, zone.dropRadius);
  emitFx(match, {
    kind: "flash",
    x,
    y,
    radius: zone.dropRadius,
    color: zone.color,
    arenaId: zone.arenaId,
    life: 0.28,
    vfx: zone.vfx,
  });
}

export function tickZones(match: Match, dt: number) {
  const born: Zone[] = [];
  for (const zone of match.zones) {
    zone.ttl -= dt;
    const caster = entityById(match, zone.sourceId);
    if ((zone.follow === "caster" || zone.follow === "trail") && caster?.alive) {
      zone.x = caster.x;
      zone.y = caster.y;
    }
    const step = zone.every > 0 ? zone.every : dt;
    zone.acc += dt;
    if (zone.drops > 0) {
      while (zone.acc >= step) {
        zone.acc -= step;
        for (let i = 0; i < zone.drops; i += 1) dropZone(match, zone);
      }
      continue;
    }
    if (zone.follow === "trail") {
      if (zone.acc >= step && caster?.alive) {
        zone.acc = 0;
        born.push({
          ...zone,
          id: match.nextId++,
          x: caster.x,
          y: caster.y,
          radius: zone.dropRadius,
          follow: "point",
          drops: 0,
          acc: step,
          ttl: zone.childLife,
          born: match.time,
        });
      }
      continue;
    }
    while (zone.acc >= step) {
      zone.acc -= step;
      hurtZone(match, zone, zone.x, zone.y, zone.radius);
    }
  }
  match.zones.push(...born);
  match.zones = match.zones.filter((zone) => zone.ttl > 0);
}

export function tickVolleys(match: Match, dt: number) {
  const next = [];
  for (const volley of match.volleys) {
    const caster = entityById(match, volley.casterId);
    if (!caster?.alive) continue;
    volley.left -= dt;
    if (volley.left > 0) {
      next.push(volley);
      continue;
    }
    launchVolley(match, volley);
    volley.bursts -= 1;
    volley.angle += volley.spin;
    volley.left = volley.interval;
    if (volley.bursts > 0) next.push(volley);
  }
  match.volleys = next;
}

export function tickTelegraphs(match: Match, dt: number) {
  const next = [];
  for (const item of match.telegraphs) {
    item.left -= dt;
    if (item.left > 0) {
      next.push(item);
      continue;
    }
    const caster = entityById(match, item.casterId);
    if (!caster?.alive) continue;
    const player = playerById(match, item.playerId) ?? null;
    runAction({
      match,
      caster,
      player,
      spellId: item.spellId,
      color: item.color,
      vfx: item.vfx,
      targeting: item.targeting,
      numbers: item.numbers,
      aim: item.aimX == null || item.aimY == null ? null : { x: item.aimX, y: item.aimY },
      action: item.action,
    }, true);
  }
  match.telegraphs = next;
}

export function tickWarnings(match: Match) {
  match.warnings = match.warnings.filter((warning) => match.time - warning.born < warning.life);
}
