import { damagePipeline } from "./registry.js";
import type { DamageContext, Entity, Match, PlayerState } from "./types.js";
import { arenaById, dist, emitFx, floatText, heroEntity, playerById } from "./world.js";

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
  if (targetPlayer?.eliminated) return 0;

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
      if (hook.hook === "burn") ctx.amount += hook.value;
      if (hook.hook === "execute" && target.hp / target.maxHp < 0.35) ctx.amount *= 1 + hook.value;
    }
  }
  for (const hook of damagePipeline.beforeDamage) hook(ctx);

  const armor = targetPlayer ? targetPlayer.stats.armor : target.armor;
  const mitigated = ctx.amount * (1 - armor / (armor + 50));
  const final = Math.max(1, mitigated);
  target.hp -= final;
  target.flash += 1;
  floatText(match, target, `${Math.round(final)}${ctx.crit ? "!" : ""}`, ctx.crit);

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

  if (!nested && ctx.sourcePlayer && ctx.source) {
    for (const hook of ctx.sourcePlayer.hooks.onHit) {
      if (hook.hook !== "splash" || hook.value <= 0) continue;
      const radius = 2.1 * (1 + ctx.sourcePlayer.stats.areaPct);
      emitFx(match, {
        kind: "ring",
        x: target.x,
        y: target.y,
        radius,
        color: "#f4c46a",
        arenaId: target.arenaId,
        life: 0.28,
      });
      for (const other of match.entities) {
        if (!other.alive || other.id === target.id || other.arenaId !== target.arenaId) continue;
        if (other.team === ctx.source.team) continue;
        if (dist(target, other) > radius + other.radius) continue;
        dealDamage(match, {
          source: ctx.source,
          sourcePlayer: ctx.sourcePlayer,
          target: other,
          amount: final * hook.value,
          abilityId: ctx.abilityId,
          crit: ctx.crit,
        }, true);
      }
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
    loseLife(match, player);
    return;
  }
  if (killer && !killer.eliminated) {
    killer.kills += 1;
    for (const hook of killer.hooks.onKill) {
      if (hook.hook === "luck") killer.stats.luck += hook.value;
    }
    grantXp(match, killer, entity.xp);
    const def = match.data.creeps.find((creep) => creep.id === entity.defId);
    const chance = (def?.dropChance ?? 0) * (1 + killer.stats.luck);
    if (def && chance > 0 && match.rng.next() < chance) {
      killer.unspentPicks += 1;
      addLogSafe(match, `${killer.name} achou um item`);
      if (match.phase === "hub") offerCards(match, killer);
    }
  }
}

export function loseLife(match: Match, player: PlayerState) {
  if (player.eliminated) return;
  player.lives -= 1;
  player.deaths += 1;
  const entity = heroEntity(match, player);
  if (entity) {
    entity.alive = false;
    entity.hp = 0;
  }
  match.events.push({ type: "death", round: match.round, playerId: player.id, livesLeft: Math.max(0, player.lives) });
  if (player.lives <= 0) eliminate(match, player, "sem vidas");
  else if (match.phase === "pve") player.respawnIn = match.config.respawnSeconds;
}

export function eliminate(match: Match, player: PlayerState, reason: string) {
  if (player.eliminated) return;
  player.eliminated = true;
  player.lives = 0;
  player.paused = false;
  player.pendingCards = [];
  player.unspentPicks = 0;
  player.waveClear = true;
  player.eliminatedAt = match.time;
  player.ready = true;
  const entity = heroEntity(match, player);
  if (entity) entity.alive = false;
  match.events.push({ type: "eliminate", round: match.round, playerId: player.id, reason });
  addLogSafe(match, `${player.name} foi eliminado`);
}

function addLogSafe(match: Match, text: string) {
  match.log.push(text);
  if (match.log.length > 14) match.log.shift();
}

export function grantXp(match: Match, player: PlayerState, amount: number) {
  if (player.eliminated || player.level >= match.config.levelCap) return;
  player.xp += amount * (1 + player.stats.xpPct);
  tryLevel(match, player);
}

export function tryLevel(match: Match, player: PlayerState) {
  if (player.pendingCards.length > 0 || player.eliminated) return;
  if (player.level >= match.config.levelCap) return;
  const need = Math.max(1, Math.floor(match.config.xpBase * Math.pow(player.level, match.config.xpPower)));
  if (player.xp < need) return;
  player.xp -= need;
  player.level += 1;
  player.unspentPicks += 1;
  match.events.push({ type: "level", round: match.round, playerId: player.id, level: player.level });
  addLogSafe(match, `${player.name} subiu para o nível ${player.level}`);
  if (match.phase === "hub") offerCards(match, player);
  else tryLevel(match, player);
}

export function offerCards(match: Match, player: PlayerState) {
  const pool = match.data.cards.filter((card) => eligible(match, player, card));
  const picked: string[] = [];
  const draft = [...pool];
  const count = Math.min(match.config.cardsPerLevelUp, draft.length);
  for (let i = 0; i < count; i += 1) {
    const total = draft.reduce((sum, card) => sum + cardWeight(match, player, card), 0);
    let roll = match.rng.next() * total;
    let index = draft.length - 1;
    for (let n = 0; n < draft.length; n += 1) {
      roll -= cardWeight(match, player, draft[n]!);
      if (roll <= 0) {
        index = n;
        break;
      }
    }
    const [card] = draft.splice(index, 1);
    if (card) picked.push(card.id);
  }
  if (picked.length === 0) {
    player.unspentPicks = Math.max(0, player.unspentPicks - 1);
    return;
  }
  player.pendingCards = picked;
  player.cardTimer = match.config.cardPickSeconds;
  match.events.push({ type: "card_offer", round: match.round, playerId: player.id, cards: picked });
}

export function cardWeight(match: Match, player: PlayerState, card: (typeof match.data.cards)[number]) {
  const bias = match.data.economy.luckBias[card.rarity] ?? 0;
  return Math.max(0.01, card.weight * (1 + player.stats.luck * bias));
}

export function eligible(match: Match, player: PlayerState, card: (typeof match.data.cards)[number]) {
  if (card.unique && player.cards.includes(card.id)) return false;
  if (card.requires?.ability && !player.abilities.some((slot) => slot.abilityId === card.requires?.ability)) return false;
  if (card.requires?.missingAbility && player.abilities.some((slot) => slot.abilityId === card.requires?.missingAbility)) {
    return false;
  }
  for (const effect of card.effects) {
    if (effect.type === "upgradeAbility" && effect.abilityId) {
      const slot = player.abilities.find((item) => item.abilityId === effect.abilityId);
      const def = match.data.abilities.find((ability) => ability.id === effect.abilityId);
      if (!slot || !def || slot.level >= def.levels.length) return false;
    }
    if (effect.type === "grantAbility" && effect.abilityId) {
      if (player.abilities.some((slot) => slot.abilityId === effect.abilityId)) return false;
    }
  }
  return true;
}
