import type { AbilityView, CardView, PlayerSnap, ShopView, Snapshot } from "@game/shared";
import { cardPrice, isFighter, upgradeCost } from "./actions.js";
import type { Match, PlayerState } from "./types.js";
import { abilityById, cardById, heroEntity, xpToNext } from "./world.js";

function cardView(match: Match, id: string): CardView | null {
  const card = cardById(match, id);
  if (!card) return null;
  return { id: card.id, nome: card.nome, descricao: card.descricao, rarity: card.rarity };
}

function abilitiesOf(match: Match, player: PlayerState): AbilityView[] {
  return player.abilities.flatMap((slot) => {
    const def = abilityById(match, slot.abilityId);
    if (!def) return [];
    return [{
      id: def.id,
      nome: def.nome,
      descricao: def.descricao,
      level: slot.level,
      max: def.levels.length,
      cooldown: Math.max(0, slot.cooldown),
      cooldownMax: slot.cooldownMax,
      color: def.color,
    }];
  });
}

function shopOf(match: Match, player: PlayerState): ShopView | null {
  if ((match.phase !== "shop" && match.phase !== "hub") || player.eliminated) return null;
  return {
    offers: player.shopOffers.flatMap((id) => {
      const card = cardView(match, id);
      if (!card) return [];
      return [{ ...card, price: cardPrice(match, card.rarity) }];
    }),
    rerollCost: match.data.economy.rerollCost,
    upgrades: player.abilities.flatMap((slot) => {
      const def = abilityById(match, slot.abilityId);
      if (!def || slot.level >= def.levels.length) return [];
      return [{
        abilityId: slot.abilityId,
        nome: def.nome,
        level: slot.level,
        max: def.levels.length,
        cost: upgradeCost(match, slot.level),
      }];
    }),
  };
}

function placementOf(match: Match, player: PlayerState) {
  if (match.phase !== "ended") return null;
  const ordered = [...match.players].sort((a, b) => {
    if (a.id === match.winnerId) return -1;
    if (b.id === match.winnerId) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    if (a.eliminated && !b.eliminated) return 1;
    return (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
  });
  return ordered.findIndex((item) => item.id === player.id) + 1;
}

function playerSnap(match: Match, player: PlayerState, youId: string): PlayerSnap {
  const entity = heroEntity(match, player);
  const mine = player.id === youId;
  const cards = player.cards.flatMap((id) => {
    const card = cardById(match, id);
    return card ? [{ id: card.id, nome: card.nome, rarity: card.rarity }] : [];
  });
  return {
    id: player.id,
    name: player.name,
    isBot: player.isBot,
    heroId: player.heroId,
    color: player.color,
    lives: player.lives,
    level: player.level,
    xp: player.xp,
    xpNext: xpToNext(match, player.level),
    gold: Math.floor(player.gold),
    hp: entity?.alive ? entity.hp : 0,
    maxHp: entity?.maxHp ?? 1,
    eliminated: player.eliminated,
    choosing: player.pendingCards.length > 0,
    cardTimer: mine ? Math.max(0, player.cardTimer) : 0,
    pending: mine ? player.pendingCards.flatMap((id) => {
      const card = cardView(match, id);
      return card ? [card] : [];
    }) : [],
    cards,
    abilities: abilitiesOf(match, player),
    shop: mine ? shopOf(match, player) : null,
    kills: player.kills,
    deaths: player.deaths,
    damageDealt: Math.round(player.damageDealt),
    ready: player.ready,
    bet: player.bet,
    inDuel: isFighter(match, player.id),
    arenaId: entity?.arenaId ?? player.arenaId,
    waveClear: player.waveClear,
    placement: placementOf(match, player),
  };
}

export function buildSnapshot(match: Match, youId: string): Snapshot {
  return {
    tick: match.tick,
    round: match.round,
    phase: match.phase,
    phaseTime: Math.max(0, match.phaseTime),
    winnerId: match.winnerId,
    youId,
    dataVersion: match.data.version,
    log: match.log.slice(-8),
    arenas: match.arenas.map((arena) => ({
      id: arena.id,
      x: arena.x,
      y: arena.y,
      size: arena.size,
      ownerId: arena.ownerId,
      kind: arena.kind,
      label: arena.label,
    })),
    players: match.players.map((player) => playerSnap(match, player, youId)),
    entities: match.entities.filter((entity) => entity.alive).map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      view: entity.defId,
      x: entity.x,
      y: entity.y,
      radius: entity.radius,
      hp: entity.hp,
      maxHp: entity.maxHp,
      color: entity.color,
      arenaId: entity.arenaId,
      flash: entity.flash,
      label: entity.kind === "hero" ? playerByName(match, entity.playerId) : undefined,
      playerId: entity.playerId,
    })),
    projectiles: match.projectiles.map((shot) => ({
      id: shot.id,
      x: shot.x,
      y: shot.y,
      arenaId: shot.arenaId,
      color: shot.color,
    })),
    floats: match.floats.slice(-40),
    duel: match.duel.map((pair) => ({ ...pair })),
  };
}

function playerByName(match: Match, id?: string) {
  return match.players.find((player) => player.id === id)?.name;
}
