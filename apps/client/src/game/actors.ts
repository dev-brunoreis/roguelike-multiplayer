import {
  actorsVisualSchema,
  type ActorKindVisual,
  type ActorsVisual,
  type ActorViewVisual,
} from "@game/shared";
import raw from "../../../../packages/game-data/data/visual/actors.json";

export interface ActorLook extends ActorKindVisual {
  source?: ActorViewVisual["source"];
}

let current: ActorsVisual = actorsVisualSchema.parse(raw);

export function applyActors(data: ActorsVisual) {
  current = data;
}

export function actorsVisual() {
  return current;
}

export function actorLook(view: string, kind: string): ActorLook {
  const base = kind === "hero" ? current.byKind.hero : kind === "boss" ? current.byKind.boss : current.byKind.creep;
  const over = current.views[view];
  if (!over) return base;
  return {
    bodyMul: over.bodyMul ?? base.bodyMul,
    attackSeconds: over.attackSeconds ?? base.attackSeconds,
    fps: {
      idle: over.fps?.idle ?? base.fps.idle,
      run: over.fps?.run ?? base.fps.run,
      attack: over.fps?.attack ?? base.fps.attack,
      hit: over.fps?.hit ?? base.fps.hit,
    },
    source: over.source,
  };
}
