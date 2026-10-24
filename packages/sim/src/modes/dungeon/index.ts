import { simulateCombat } from "../../combat.js";
import { registerMode } from "../../registry.js";
import { spawnCreep } from "../../spawn.js";
import type { Arena, DungeonPortal, DungeonState, GameMode, Match, PlayerState } from "../../types.js";
import { addLog, alivePlayers, arenaById, arenaCenter, dist, emit, heroEntity, pushBanner, syncWorld } from "../../world.js";
import "./bot.js";
import { generateDungeon } from "./generate.js";

const LABEL: Record<DungeonState["rooms"][number]["role"], string> = {
  entrance: "Entrada",
  fight: "Sala",
  rest: "Descanso",
  elite: "Elite",
  boss: "Chefe",
};

function stateOf(match: Match) {
  if (!match.dungeon) throw new Error("Masmorra sem mapa");
  return match.dungeon;
}

function placeParty(match: Match, arenaId: string) {
  const arena = arenaById(match, arenaId);
  if (!arena) return;
  const center = arenaCenter(arena);
  const party = alivePlayers(match);
  party.forEach((player, index) => {
    const angle = party.length > 0 ? (index / party.length) * Math.PI * 2 : 0;
    const entity = heroEntity(match, player);
    player.arenaId = arenaId;
    if (!entity) return;
    entity.arenaId = arenaId;
    entity.x = center.x + Math.cos(angle) * 1.4;
    entity.y = center.y + Math.sin(angle) * 1.4;
    entity.team = "player";
  });
}

function revealAround(match: Match, arenaId: string) {
  const state = stateOf(match);
  state.revealed.add(arenaId);
  for (const portal of state.portals) {
    if (portal.arenaId === arenaId) state.revealed.add(portal.toArenaId);
  }
}

function landInside(portal: { x: number; y: number }, arena: Arena, distance: number) {
  const center = arenaCenter(arena);
  const vx = center.x - portal.x;
  const vy = center.y - portal.y;
  const len = Math.hypot(vx, vy) || 1;
  return {
    x: portal.x + (vx / len) * distance,
    y: portal.y + (vy / len) * distance,
  };
}

function linkPortals(match: Match, aId: string, bId: string, index: number): DungeonPortal[] {
  const a = arenaById(match, aId);
  const b = arenaById(match, bId);
  if (!a || !b) return [];
  const ax = a.x + a.size / 2;
  const ay = a.y + a.size / 2;
  const bx = b.x + b.size / 2;
  const by = b.y + b.size / 2;
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  const inset = 1.35;
  const land = 2.4;
  const aPortal = {
    x: ax + dx * (a.size / 2 - inset),
    y: ay + dy * (a.size / 2 - inset),
  };
  const bPortal = {
    x: bx - dx * (b.size / 2 - inset),
    y: by - dy * (b.size / 2 - inset),
  };
  const aLand = landInside(aPortal, a, land);
  const bLand = landInside(bPortal, b, land);
  return [
    {
      id: `portal-${index}-a`,
      arenaId: aId,
      x: aPortal.x,
      y: aPortal.y,
      toArenaId: bId,
      toX: bLand.x,
      toY: bLand.y,
    },
    {
      id: `portal-${index}-b`,
      arenaId: bId,
      x: bPortal.x,
      y: bPortal.y,
      toArenaId: aId,
      toX: aLand.x,
      toY: aLand.y,
    },
  ];
}

function encounterScale(match: Match, depth: number) {
  const def = match.data.dungeon;
  return {
    hp: 1 + depth * def.depthHp,
    damage: 1 + depth * def.depthDamage,
  };
}

function groupsFor(match: Match, role: DungeonState["rooms"][number]["role"], depth: number) {
  const def = match.data.dungeon;
  if (role === "boss") {
    const boss = match.rng.pick(def.bosses);
    return [{ creepId: boss.creepId, count: 1 }];
  }
  if (role === "elite") {
    const elite = match.rng.pick(def.elites);
    return [{ creepId: elite.creepId, count: elite.count }];
  }
  if (role === "rest" || role === "entrance") return [];
  const sorted = [...def.encounters].sort((a, b) => a.depth - b.depth);
  let chosen = sorted[0]!;
  for (const encounter of sorted) {
    if (encounter.depth <= depth) chosen = encounter;
  }
  return chosen.spawns;
}

function farPoint(match: Match, arenaId: string, anchors: { x: number; y: number }[]) {
  const arena = arenaById(match, arenaId);
  if (!arena) return { x: 0, y: 0 };
  const pad = 2.2;
  let best = arenaCenter(arena);
  let bestScore = -1;
  for (let i = 0; i < 8; i += 1) {
    const spot = {
      x: arena.x + pad + match.rng.next() * Math.max(1, arena.size - pad * 2),
      y: arena.y + pad + match.rng.next() * Math.max(1, arena.size - pad * 2),
    };
    const score = anchors.length === 0 ? 1 : Math.min(...anchors.map((anchor) => dist(anchor, spot)));
    if (score > bestScore) {
      best = spot;
      bestScore = score;
    }
  }
  return best;
}

function armRoom(match: Match, roomId: string) {
  const state = stateOf(match);
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room || room.armed) return;
  room.armed = true;
  const groups = groupsFor(match, room.role, room.depth);
  if (groups.length === 0) {
    if (room.role === "rest") addLog(match, "Sala de descanso");
    return;
  }
  const heroes = match.entities.filter((entity) => entity.kind === "hero" && entity.arenaId === roomId);
  const scale = encounterScale(match, room.depth);
  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) {
      const at = farPoint(match, roomId, heroes);
      spawnCreep(match, roomId, group.creepId, { x: at.x, y: at.y, scale, home: true });
    }
  }
  if (room.role === "boss") addLog(match, "O chefe acordou");
  else if (room.role === "elite") addLog(match, "Um guarda bloqueia a sala");
}

function roomHasCreeps(match: Match, arenaId: string) {
  return match.entities.some((entity) => entity.alive && entity.kind !== "hero" && entity.arenaId === arenaId);
}

function crossPortals(match: Match, dt: number) {
  const state = stateOf(match);
  const radius = match.data.dungeon.portalRadius;
  for (const player of alivePlayers(match)) {
    if (player.downed) continue;
    const entity = heroEntity(match, player);
    if (!entity?.alive) continue;
    const portal = state.portals.find((item) => item.arenaId === entity.arenaId && dist(entity, item) <= radius);
    if (player.portalCd > 0) {
      if (!portal) player.portalCd = Math.max(0, player.portalCd - dt);
      continue;
    }
    if (!portal || roomHasCreeps(match, entity.arenaId)) continue;
    entity.arenaId = portal.toArenaId;
    entity.x = portal.toX;
    entity.y = portal.toY;
    entity.invuln = Math.max(entity.invuln, 0.25);
    player.arenaId = portal.toArenaId;
    player.portalCd = match.data.dungeon.portalCooldown;
  }
}

function stand(match: Match, player: PlayerState, hpPct: number) {
  const entity = heroEntity(match, player);
  player.downed = false;
  player.reviveProgress = 0;
  player.respawnIn = 0;
  if (!entity) return;
  entity.alive = true;
  entity.hp = Math.max(1, entity.maxHp * hpPct);
  entity.invuln = match.config.invulnSeconds;
}

function updateRevive(match: Match, dt: number) {
  const def = match.data.dungeon;
  for (const player of match.players) {
    if (!player.downed || player.eliminated) continue;
    const entity = heroEntity(match, player);
    if (!entity) continue;
    const near = match.players.some((ally) => {
      if (ally.id === player.id || ally.eliminated || ally.downed) return false;
      const body = heroEntity(match, ally);
      return Boolean(body?.alive && body.arenaId === entity.arenaId && dist(body, entity) <= def.reviveRadius);
    });
    if (near) player.reviveProgress += dt / def.reviveSeconds;
    else player.reviveProgress = Math.max(0, player.reviveProgress - dt / def.reviveSeconds);
    if (player.reviveProgress < 1) continue;
    stand(match, player, def.reviveHpPct);
    addLog(match, `${player.name} se levantou`);
  }
}

function visitRooms(match: Match) {
  for (const player of match.players) {
    if (player.eliminated) continue;
    const entity = heroEntity(match, player);
    const arenaId = entity?.arenaId || player.arenaId;
    if (!arenaId) continue;
    revealAround(match, arenaId);
    if (player.downed || !entity?.alive) continue;
    armRoom(match, arenaId);
  }
}

function finish(match: Match, result: "win" | "lose") {
  const state = stateOf(match);
  if (match.phase === "ended") return;
  match.phase = "ended";
  match.phaseTime = 0;
  match.winnerId = null;
  state.result = result;
  addLog(match, result === "win" ? "O chefe caiu. A masmorra está limpa" : "O grupo inteiro caiu");
  if (result === "win") emit(match, { type: "win", round: match.round, playerId: null });
  pushBanner(match, {
    kind: "info",
    title: result === "win" ? "Vitória do grupo" : "Derrota",
    life: 5,
  });
}

export const dungeonMode: GameMode = {
  id: "masmorra",
  bot: "coop",
  setup(match) {
    const def = match.data.dungeon;
    const generated = generateDungeon(match.rng, def);
    const state: DungeonState = { rooms: [], portals: [], revealed: new Set(), result: null };
    match.dungeon = state;
    for (const room of generated.rooms) {
      match.arenas.push({
        id: room.id,
        x: room.col * def.cellSize,
        y: room.row * def.cellSize,
        size: room.size,
        ownerId: null,
        kind: "room",
        role: room.role,
        label: LABEL[room.role],
      });
      state.rooms.push({
        id: room.id,
        col: room.col,
        row: room.row,
        depth: room.depth,
        role: room.role,
        armed: room.role === "entrance",
      });
    }
    generated.links.forEach((link, index) => {
      state.portals.push(...linkPortals(match, link.a, link.b, index));
    });
    const entrance = state.rooms.find((room) => room.role === "entrance") ?? state.rooms[0];
    if (entrance) {
      placeParty(match, entrance.id);
      revealAround(match, entrance.id);
    }
    match.phase = "dungeon";
    match.phaseTime = 0;
    syncWorld(match);
    addLog(match, "A masmorra abre");
  },
  update(match, dt) {
    if (match.phase !== "dungeon") return;
    simulateCombat(match, dt);
    updateRevive(match, dt);
    crossPortals(match, dt);
    visitRooms(match);
  },
  checkEnd(match) {
    if (match.phase === "ended" || !match.dungeon) return;
    const boss = match.dungeon.rooms.find((room) => room.role === "boss");
    if (boss?.armed) {
      const alive = match.entities.some((entity) => entity.alive && entity.kind === "boss" && entity.arenaId === boss.id);
      if (!alive) {
        finish(match, "win");
        return;
      }
    }
    const active = match.players.filter((player) => !player.eliminated);
    if (active.length > 0 && active.every((player) => player.downed)) finish(match, "lose");
  },
  onHeroKilled(match, player) {
    player.downed = true;
    player.reviveProgress = 0;
    player.deaths += 1;
    const entity = heroEntity(match, player);
    if (entity) {
      entity.alive = false;
      entity.hp = 0;
    }
    emit(match, { type: "death", round: match.round, playerId: player.id, livesLeft: player.lives });
    addLog(match, `${player.name} caiu`);
    pushBanner(match, { kind: "death", title: `${player.name} caiu`, detail: "Um aliado pode levantar", life: 3.2 });
  },
  offerOnLevel() {
    return true;
  },
  interest(match, watchId) {
    const ids = new Set<string>();
    const player = match.players.find((item) => item.id === watchId);
    const hero = player ? heroEntity(match, player) : undefined;
    const arenaId = hero?.arenaId || player?.arenaId;
    if (arenaId) ids.add(arenaId);
    return ids;
  },
};

registerMode("masmorra", dungeonMode);
