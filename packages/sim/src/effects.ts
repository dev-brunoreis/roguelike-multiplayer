import type { EffectDef } from "@game/shared";
import { tryLevel } from "./damage.js";
import { getEffect, registerEffect } from "./registry.js";
import type { Match, PlayerState } from "./types.js";
import { isStat } from "./types.js";
import { addLog, heroEntity } from "./world.js";

registerEffect("stat", (match, player, effect) => {
  if (!effect.stat || !isStat(effect.stat) || effect.value === undefined) {
    throw new Error("Efeito stat precisa de stat e value.");
  }
  player.stats[effect.stat] += effect.value;
  if (effect.stat === "maxHpFlat") {
    const entity = heroEntity(match, player);
    if (entity) {
      entity.maxHp += effect.value;
      entity.hp += effect.value;
    }
  }
});

registerEffect("grantAbility", (_match, player, effect) => {
  if (!effect.abilityId) throw new Error("grantAbility precisa de abilityId.");
  if (player.abilities.some((slot) => slot.abilityId === effect.abilityId)) return;
  player.abilities.push({ abilityId: effect.abilityId, level: 1, cooldown: 0.2, cooldownMax: 0.2 });
});

registerEffect("upgradeAbility", (match, player, effect) => {
  if (!effect.abilityId) throw new Error("upgradeAbility precisa de abilityId.");
  const slot = player.abilities.find((item) => item.abilityId === effect.abilityId);
  const def = match.data.abilities.find((ability) => ability.id === effect.abilityId);
  if (!slot || !def || slot.level >= def.levels.length) return;
  slot.level += 1;
});

registerEffect("onHit", (_match, player, effect) => {
  if (!effect.hook || effect.value === undefined) throw new Error("onHit precisa de hook e value.");
  player.hooks.onHit.push({ hook: effect.hook, value: effect.value });
});

registerEffect("onKill", (_match, player, effect) => {
  if (!effect.hook || effect.value === undefined) throw new Error("onKill precisa de hook e value.");
  player.hooks.onKill.push({ hook: effect.hook, value: effect.value });
});

export function applyEffect(match: Match, player: PlayerState, effect: EffectDef) {
  const handler = getEffect(effect.type);
  if (!handler) throw new Error(`Efeito desconhecido: ${effect.type}`);
  handler(match, player, effect);
}

export function applyCard(match: Match, player: PlayerState, cardId: string) {
  const card = match.data.cards.find((item) => item.id === cardId);
  if (!card) return;
  player.cards.push(card.id);
  for (const tag of card.tags) player.tags[tag] = (player.tags[tag] ?? 0) + 1;
  for (const effect of card.effects) applyEffect(match, player, effect);
  for (const synergy of match.data.synergies) {
    if (player.synergies.includes(synergy.id)) continue;
    if ((player.tags[synergy.tag] ?? 0) < synergy.count) continue;
    player.synergies.push(synergy.id);
    for (const effect of synergy.effects) applyEffect(match, player, effect);
    addLog(match, `${player.name} ativou ${synergy.nome}`);
    match.events.push({ type: "synergy", round: match.round, playerId: player.id, synergyId: synergy.id });
  }
  tryLevel(match, player);
}
