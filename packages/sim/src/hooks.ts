import { dealDamage } from "./damage.js";
import { registerHitHook } from "./registry.js";
import { dist, emitFx } from "./world.js";

registerHitHook("burn", "before", (ctx, value) => {
  ctx.amount += value;
});

registerHitHook("execute", "before", (ctx, value) => {
  if (ctx.target.hp / ctx.target.maxHp < ctx.match.config.executeHpRatio) ctx.amount *= 1 + value;
});

registerHitHook("splash", "after", (ctx, value, info) => {
  if (info.nested || !ctx.sourcePlayer || !ctx.source || value <= 0) return;
  const radius = ctx.match.config.splashRadius * (1 + ctx.sourcePlayer.stats.areaPct);
  emitFx(ctx.match, {
    kind: "ring",
    x: ctx.target.x,
    y: ctx.target.y,
    radius,
    color: "#f4c46a",
    arenaId: ctx.target.arenaId,
    life: 0.28,
  });
  for (const other of ctx.match.entities) {
    if (!other.alive || other.id === ctx.target.id || other.arenaId !== ctx.target.arenaId) continue;
    if (other.team === ctx.source.team) continue;
    if (dist(ctx.target, other) > radius + other.radius) continue;
    dealDamage(ctx.match, {
      source: ctx.source,
      sourcePlayer: ctx.sourcePlayer,
      target: other,
      amount: info.final * value,
      abilityId: ctx.abilityId,
      crit: ctx.crit,
    }, true);
  }
});
