import type { Match, PlayerState } from "../../../types.js";
import { arenaById, arenaCenter, heroEntity } from "../../../world.js";

export function sendHome(match: Match, player: PlayerState) {
  const home = match.arenas.find((arena) => arena.ownerId === player.id && arena.kind === "pve");
  if (!home) return;
  player.arenaId = home.id;
  const entity = heroEntity(match, player);
  if (entity) {
    entity.arenaId = home.id;
    entity.team = "player";
  }
}

export function sendToHub(match: Match, player: PlayerState, index: number, total: number) {
  const hub = match.arenas.find((arena) => arena.kind === "hub");
  if (!hub) return;
  const center = arenaCenter(hub);
  const angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
  const radius = Math.min(6, hub.size * 0.22);
  player.arenaId = hub.id;
  const entity = heroEntity(match, player);
  if (!entity) return;
  entity.arenaId = hub.id;
  entity.team = "player";
  entity.alive = true;
  entity.hp = entity.maxHp;
  entity.invuln = 0.4;
  entity.x = center.x + Math.cos(angle) * radius;
  entity.y = center.y + Math.sin(angle) * radius;
  player.respawnIn = 0;
}

export function arenaQuiet(match: Match, arenaId: string) {
  const spawning = match.spawns.some((job) => job.arenaId === arenaId && job.left > 0);
  const creeps = match.entities.some((entity) => entity.alive && entity.kind !== "hero" && entity.arenaId === arenaId);
  return !spawning && !creeps;
}

export function revive(match: Match, player: PlayerState) {
  const entity = heroEntity(match, player);
  const arena = arenaById(match, player.arenaId);
  if (!entity || !arena) return;
  const center = arenaCenter(arena);
  entity.alive = true;
  entity.hp = entity.maxHp;
  entity.x = center.x;
  entity.y = center.y;
  entity.team = "player";
  entity.arenaId = player.arenaId;
  entity.invuln = 0.4;
  player.respawnIn = 0;
}

export function respawnHero(match: Match, player: PlayerState) {
  revive(match, player);
  const entity = heroEntity(match, player);
  if (entity) entity.invuln = match.config.invulnSeconds;
}
