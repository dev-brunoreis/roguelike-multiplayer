import { damagePipeline, getHitHook, getMode } from "./registry.js";
import type { DamageContext, Entity, Match, PlayerState } from "./types.js";
import { grantXp } from "./progression.js";
import { arenaById, floatText, playerById } from "./world.js";

export interface HitInput {
  source?: Entity;
  sourcePlayer?: PlayerState;
  target: Entity;
  amount: number;
  abilityId?: string;
  crit?: boolean;
}

export function dealDamage(match: Match, hit: HitInput, nested = false): number {
  const target = hit.target;
  if (!target.alive || target.invuln > 0) return 0;
  if (match.phase === "hub") return 0;
  const arena = arenaById(match, target.arenaId);
  if (arena?.kind === "hub") return 0;
  const targetPlayer = target.playerId ? playerById(match, target.playerId) : undefined;
  if (targetPlayer?.eliminated || targetPlayer?.godmode) return 0;

  const ctx: DamageContext = {
    match,
    source: hit.source,
    sourcePlayer: hit.sourcePlayer,
    target,
    amount: hit.amount,
    abilityId: hit.abilityId,
    crit: hit.crit ?? false,
    killed: false,
  };

  if (ctx.sourcePlayer) {
    for (const hook of ctx.sourcePlayer.hooks.onHit) {
      const registered = getHitHook(hook.hook);
      if (registered?.phase === "before") registered.fn(ctx, hook.value, { final: 0, nested });
    }
  }
  for (const hook of damagePipeline.beforeDamage) hook(ctx);

  const armor = targetPlayer ? targetPlayer.stats.armor : target.armor;
  const soften = match.config.armorConstant;
  const mitigated = ctx.amount * (1 - armor / (armor + soften));
  const final = Math.max(1, mitigated);
  target.hp -= final;
  target.flash += 1;
  floatText(match, target, String(Math.round(final)), ctx.crit, {
    sourcePlayerId: ctx.sourcePlayer?.id,
    targetPlayerId: target.playerId,
  });

  if (ctx.sourcePlayer) {
    ctx.sourcePlayer.damageDealt += final;
    if (ctx.abilityId) {
      ctx.sourcePlayer.phaseDamage[ctx.abilityId] = (ctx.sourcePlayer.phaseDamage[ctx.abilityId] ?? 0) + final;
    }
    if (ctx.source && ctx.sourcePlayer.stats.lifesteal > 0) {
      const heal = final * ctx.sourcePlayer.stats.lifesteal;
      ctx.source.hp = Math.min(ctx.source.maxHp, ctx.source.hp + heal);
    }
  }

  for (const hook of damagePipeline.afterDamage) hook(ctx);
  if (ctx.sourcePlayer) {
    for (const hook of ctx.sourcePlayer.hooks.onHit) {
      const registered = getHitHook(hook.hook);
      if (registered?.phase === "after") registered.fn(ctx, hook.value, { final, nested });
    }
  }

  if (target.hp <= 0) {
    target.hp = 0;
    ctx.killed = true;
    killEntity(match, target, ctx.sourcePlayer);
    for (const hook of damagePipeline.onKill) hook(ctx);
  }
  return final;
}

export function killEntity(match: Match, entity: Entity, killer?: PlayerState) {
  if (!entity.alive) return;
  entity.alive = false;
  entity.hp = 0;
  if (entity.kind === "hero" && entity.playerId) {
    const player = playerById(match, entity.playerId);
    if (!player || player.eliminated) return;
    if (killer && killer.id !== player.id) killer.kills += 1;
    getMode(match.mode).onHeroKilled(match, player);
    return;
  }
  if (killer && !killer.eliminated) {
    killer.kills += 1;
    grantXp(match, killer, entity.xp);
  }
}
