import type { SimEvent } from "./events.js";
import type { Match } from "./types.js";

export function present(match: Match, event: SimEvent) {
  if (event.type === "log") {
    match.log.push(event.text);
    if (match.log.length > 14) match.log.shift();
    return;
  }
  if (event.type === "banner") {
    match.banner = {
      id: match.nextId++,
      kind: event.kind,
      title: event.title,
      detail: event.detail ?? "",
      left: event.life ?? 3.4,
    };
    return;
  }
  if (event.type === "float") {
    match.floats.push({
      id: match.nextId++,
      x: event.x,
      y: event.y,
      text: event.text,
      crit: event.crit,
      arenaId: event.arenaId,
      sourcePlayerId: event.sourcePlayerId,
      targetPlayerId: event.targetPlayerId,
    });
    return;
  }
  if (event.type === "fx") {
    match.fx.push({
      id: match.nextId++,
      kind: event.kind,
      x: event.x,
      y: event.y,
      x2: event.x2,
      y2: event.y2,
      radius: event.radius,
      color: event.color,
      arenaId: event.arenaId,
      born: match.time,
      life: event.life ?? 0.38,
      vfx: event.vfx ?? "",
    });
  }
}
