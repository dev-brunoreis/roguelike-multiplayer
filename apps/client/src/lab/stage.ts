import type { LabVisual } from "@game/shared";
import type { Match } from "@game/sim";
import { labCast, labClear, labForcePhase, labHold, labSetLevel, labSpawn } from "@game/sim/lab";
import type { LabSel } from "./select.js";

export interface StagePose {
  casterId: number | null;
  foeId: number | null;
  spellId: string | null;
  level: number;
}

function spellsOf(match: Match, creepId: string) {
  const creep = match.data.byId.creeps.get(creepId);
  if (!creep) return [];
  return [...(creep.skills ?? []), ...(creep.skill ? [creep.skill] : [])];
}

export function composeStage(match: Match, layout: LabVisual, sel: LabSel, level: number, phase: number): StagePose {
  labClear(match);
  const player = match.players[0];
  const hero = match.entities.find((entity) => entity.kind === "hero");
  const aim = layout.dummies[1] ?? layout.dummies[0] ?? { x: 2, y: 0 };
  if (hero && player) {
    hero.x = layout.caster.x;
    hero.y = layout.caster.y;
    player.aimX = aim.x;
    player.aimY = aim.y;
  }
  if (sel.kind === "vfx" || sel.kind === "file") {
    labHold(match, { hero: true, creeps: true });
    return { casterId: hero?.id ?? null, foeId: null, spellId: null, level };
  }
  if ((sel.kind === "creep" || sel.kind === "boss") && hero) {
    const id = labSpawn(match, sel.id, layout.creep);
    labHold(match, { hero: true, creeps: false });
    if (id != null && sel.kind === "boss") labForcePhase(match, id, phase);
    const spell = spellsOf(match, sel.id)[0];
    if (id != null && spell) {
      labCast(match, id, spell.id ?? sel.id, { skillIndex: 0, aim: { x: layout.caster.x, y: layout.caster.y } });
    }
    return { casterId: id, foeId: hero.id, spellId: spell?.id ?? null, level: 1 };
  }
  if (!hero || !player) return { casterId: null, foeId: null, spellId: null, level };
  const abilityId = sel.kind === "ability"
    ? sel.id
    : match.data.byId.heroes.get(sel.id)?.startingAbility ?? player.abilities[0]?.abilityId ?? "";
  if (abilityId) labSetLevel(match, player.id, abilityId, level);
  for (const at of layout.dummies) labSpawn(match, layout.dummyCreep, at, { dummy: true });
  labHold(match, { hero: true, creeps: true });
  if (abilityId) labCast(match, hero.id, abilityId, { level, aim });
  return { casterId: hero.id, foeId: null, spellId: abilityId || null, level };
}
