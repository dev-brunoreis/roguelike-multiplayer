import type { AbilityLevel, ActionDef } from "@game/shared";
import type { Entity, Match, PlayerState } from "../types.js";
import { dist } from "../world.js";
import { runAction } from "./actions.js";
import { mergeNumbers } from "./numbers.js";

function foeNear(match: Match, caster: Entity) {
  let best: Entity | null = null;
  let bestGap = 30;
  for (const entity of match.entities) {
    if (!entity.alive || entity.arenaId !== caster.arenaId || entity.team === caster.team || entity.id === caster.id) continue;
    const gap = dist(caster, entity);
    if (gap > bestGap) continue;
    best = entity;
    bestGap = gap;
  }
  return best;
}

export function castSpell(
  match: Match,
  caster: Entity,
  spell: { cast: ActionDef[]; vfx?: string },
  opts: {
    player: PlayerState | null;
    level: AbilityLevel | null;
    spellId: string;
    color: string;
    vfx: string;
    targeting: string;
  },
) {
  let aim = opts.player && opts.player.aimX != null && opts.player.aimY != null
    ? { x: opts.player.aimX, y: opts.player.aimY }
    : null;
  if (!aim) {
    const foe = foeNear(match, caster);
    if (foe) {
      caster.facing = Math.atan2(foe.y - caster.y, foe.x - caster.x);
      aim = { x: foe.x, y: foe.y };
    }
  }
  let delay = 0;
  let fired = false;
  for (const action of spell.cast) {
    const numbers = mergeNumbers(opts.level, action);
    const ctx = {
      match,
      caster,
      player: opts.player,
      spellId: opts.spellId,
      color: opts.color,
      vfx: action.vfx || opts.vfx,
      targeting: action.do === "chain" ? opts.targeting : opts.targeting,
      numbers,
      aim,
      action,
    };
    if (delay > 0) {
      match.telegraphs.push({
        id: match.nextId++,
        left: delay,
        casterId: caster.id,
        playerId: opts.player?.id ?? "",
        spellId: opts.spellId,
        color: ctx.color,
        vfx: ctx.vfx,
        targeting: opts.targeting,
        numbers,
        aimX: aim?.x ?? null,
        aimY: aim?.y ?? null,
        action,
      });
      fired = true;
      continue;
    }
    if (action.do === "warn") {
      if (!runAction(ctx, false)) break;
      delay = Math.max(0, numbers.time);
      fired = true;
      continue;
    }
    if (runAction(ctx, false)) fired = true;
  }
  return fired;
}
