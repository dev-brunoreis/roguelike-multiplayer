import { simulateCombat, simulateMove } from "../../combat.js";
import { loseLife } from "../../elimination.js";
import { registerMode } from "../../registry.js";
import type { GameMode, Match } from "../../types.js";
import { arenaCenter, heroEntity, playerById } from "../../world.js";
import { updateBetting } from "./phases/betting.js";
import { updateDuel } from "./phases/duel.js";
import { updateHub } from "./phases/hub.js";
import { beginPve, updatePve } from "./phases/pve.js";
import { updateShop } from "./phases/shop.js";
import { checkWinner } from "./victory.js";

function layout(match: Match) {
  const config = match.config;
  const hubSize = config.hubSize;
  match.arenas.push({
    id: "hub",
    x: -hubSize / 2,
    y: -hubSize / 2,
    size: hubSize,
    ownerId: null,
    kind: "hub",
    label: "Salão",
  });
  const ring = hubSize / 2 + config.arenaGap + config.arenaSize / 2;
  const roster = match.players.length;
  match.players.forEach((player, index) => {
    const angle = (index / Math.max(1, roster)) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;
    const arena = {
      id: `arena-${player.id}`,
      x: cx - config.arenaSize / 2,
      y: cy - config.arenaSize / 2,
      size: config.arenaSize,
      ownerId: player.id,
      kind: "pve" as const,
      label: player.name,
    };
    match.arenas.push(arena);
    const center = arenaCenter(arena);
    player.arenaId = arena.id;
    const entity = heroEntity(match, player);
    if (!entity) return;
    entity.arenaId = arena.id;
    entity.x = center.x;
    entity.y = center.y;
  });
}

export const arenaMode: GameMode = {
  id: "arena",
  bot: "simple",
  setup(match) {
    layout(match);
    beginPve(match);
  },
  update(match, dt) {
    if (match.phase === "pve") {
      simulateCombat(match, dt);
      checkWinner(match);
      if (match.phase === "pve") updatePve(match, dt);
    } else if (match.phase === "hub") {
      simulateMove(match, dt);
      updateHub(match, dt);
    } else if (match.phase === "betting") {
      simulateMove(match, dt);
      updateBetting(match, dt);
    } else if (match.phase === "duel") {
      simulateCombat(match, dt);
      checkWinner(match);
      if (match.phase === "duel") updateDuel(match, dt);
    } else if (match.phase === "shop") {
      simulateMove(match, dt);
      updateShop(match, dt);
    }
  },
  checkEnd(match) {
    checkWinner(match);
  },
  onHeroKilled(match, player) {
    loseLife(match, player);
  },
  offerOnLevel(match) {
    return match.phase === "hub";
  },
  interest(match, watchId) {
    const ids = new Set<string>();
    for (const arena of match.arenas) {
      if (arena.kind === "hub" || arena.kind === "duel") ids.add(arena.id);
    }
    const player = playerById(match, watchId);
    const hero = player ? heroEntity(match, player) : undefined;
    if (hero?.arenaId) ids.add(hero.arenaId);
    else if (player) ids.add(player.arenaId);
    return ids;
  },
};

registerMode("arena", arenaMode);
