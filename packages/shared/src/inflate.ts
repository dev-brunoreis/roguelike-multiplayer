import type {
  AbilityView,
  CardView,
  EntitySnap,
  FloatEvent,
  FxSnap,
  MatchMeta,
  PlayerSnap,
  ProjectileSnap,
  Snapshot,
  WireSnapshot,
} from "./protocol.js";

function cardView(meta: MatchMeta, id: string): CardView | null {
  const card = meta.cards.find((item) => item.id === id);
  if (!card) return null;
  return card;
}

function abilityView(meta: MatchMeta, slot: WireSnapshot["players"][number]["abilities"][number]): AbilityView | null {
  const def = meta.abilities.find((item) => item.id === slot.id);
  if (!def) return null;
  return {
    id: def.id,
    nome: def.nome,
    descricao: def.descricao,
    level: slot.level,
    max: def.max,
    cooldown: slot.cooldown,
    cooldownMax: slot.cooldownMax,
    color: def.color,
  };
}

export function inflate(meta: MatchMeta, wire: WireSnapshot): Snapshot {
  const roster = new Map(meta.roster.map((player) => [player.id, player]));
  const creeps = new Map(meta.creeps.map((creep) => [creep.id, creep.nome]));
  const players: PlayerSnap[] = wire.players.map((player) => {
    const who = roster.get(player.id);
    const arena = meta.arenas[player.arena];
    const mine = player.id === wire.youId;
    return {
      id: player.id,
      name: who?.name ?? player.id,
      isBot: who?.isBot ?? false,
      heroId: who?.heroId ?? "",
      color: who?.color ?? "#f4efe4",
      lives: player.lives,
      level: player.level,
      xp: player.xp,
      xpNext: player.xpNext,
      hp: player.hp,
      maxHp: player.maxHp,
      respawnIn: player.respawnIn,
      eliminated: player.eliminated,
      choosing: player.choosing,
      cardTimer: mine ? player.cardTimer : 0,
      pending: mine ? player.pending.flatMap((id) => {
        const card = cardView(meta, id);
        return card ? [card] : [];
      }) : [],
      cards: player.cards.flatMap((id) => {
        const card = cardView(meta, id);
        return card ? [{ id: card.id, nome: card.nome, rarity: card.rarity }] : [];
      }),
      abilities: player.abilities.flatMap((slot) => {
        const view = abilityView(meta, slot);
        return view ? [view] : [];
      }),
      shop: null,
      kills: player.kills,
      deaths: player.deaths,
      damageDealt: player.damageDealt,
      ready: player.ready,
      pauseWant: player.pauseWant,
      godmode: player.godmode,
      bet: player.bet,
      inDuel: player.inDuel,
      arenaId: arena?.id ?? "",
      waveClear: player.waveClear,
      placement: player.placement,
      downed: player.downed,
      revive: player.revive,
    };
  });
  const entities: EntitySnap[] = wire.entities.flatMap((entity) => {
    const arena = meta.arenas[entity.arena];
    if (!arena) return [];
    const who = entity.playerId ? roster.get(entity.playerId) : undefined;
    return [{
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      view: entity.defId,
      x: entity.x,
      y: entity.y,
      radius: entity.radius,
      attackRange: entity.attackRange,
      hp: entity.hp,
      maxHp: entity.maxHp,
      color: entity.color,
      shadowColor: entity.shadowColor,
      arenaId: arena.id,
      flash: entity.flash,
      swing: entity.swing,
      strike: entity.strike,
      label: entity.kind === "hero" ? who?.name : creeps.get(entity.defId),
      playerId: entity.playerId,
      facing: entity.facing,
    }];
  });
  const projectiles: ProjectileSnap[] = wire.projectiles.flatMap((shot) => {
    const arena = meta.arenas[shot.arena];
    if (!arena) return [];
    return [{
      id: shot.id,
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      arenaId: arena.id,
      abilityId: shot.abilityId,
      color: shot.color,
    }];
  });
  const fx: FxSnap[] = wire.fx.flatMap((item) => {
    const arena = meta.arenas[item.arena];
    if (!arena) return [];
    return [{
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      x2: item.x2,
      y2: item.y2,
      radius: item.radius,
      color: item.color,
      arenaId: arena.id,
      t: item.t,
    }];
  });
  const floats: FloatEvent[] = wire.floats.flatMap((item) => {
    const arena = meta.arenas[item.arena];
    if (!arena) return [];
    return [{
      id: item.id,
      x: item.x,
      y: item.y,
      text: item.text,
      crit: item.crit,
      arenaId: arena.id,
      sourcePlayerId: item.sourcePlayerId,
      targetPlayerId: item.targetPlayerId,
    }];
  });
  return {
    tick: wire.tick,
    round: wire.round,
    phase: wire.phase,
    phaseTime: wire.phaseTime,
    winnerId: wire.winnerId,
    paused: wire.paused,
    youId: wire.youId,
    dataVersion: meta.dataVersion,
    log: wire.log,
    arenas: meta.arenas,
    players,
    entities,
    projectiles,
    fx,
    floats,
    duel: wire.duel.flatMap((pair) => {
      const arena = meta.arenas[pair.arena];
      if (!arena) return [];
      return [{ a: pair.a, b: pair.b, arenaId: arena.id, resolved: pair.resolved }];
    }),
    duelAnnounce: wire.duelAnnounce,
    announce: wire.announce,
    mode: meta.mode,
    portals: meta.portals,
    dungeon: wire.dungeon
      ? {
        sealed: wire.dungeon.sealed.flatMap((index) => {
          const arena = meta.arenas[index];
          return arena ? [arena.id] : [];
        }),
        revealed: wire.dungeon.revealed.flatMap((index) => {
          const arena = meta.arenas[index];
          return arena ? [arena.id] : [];
        }),
        objective: wire.dungeon.objective,
        result: wire.dungeon.result,
      }
      : null,
  };
}
