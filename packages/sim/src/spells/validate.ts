import type { GameData } from "@game/game-data";
import type { AbilityDef, AbilityLevel, ActionDef, CreepDef } from "@game/shared";
import { hasAction, hasStatus, hasTargeting } from "../registry.js";
import { given, mergeNumbers } from "./numbers.js";

function missing(level: AbilityLevel | null, action: ActionDef) {
  const kind = action.do;
  const has = (key: "damage" | "range" | "radius" | "speed" | "count" | "amount" | "duration" | "time") => given(level, action, key);
  if (kind === "dash") {
    if (!has("damage")) return "damage";
    if (!has("range")) return "range";
    if (!has("speed")) return "speed";
  }
  if (kind === "burst" || kind === "strike" || kind === "chain" || kind === "cone" || kind === "shoot") {
    if (!has("damage")) return "damage";
    if (!has("range")) return "range";
  }
  if (kind === "summon") {
    if (!action.creepId) return "creepId";
    if (!has("count")) return "count";
  }
  if (kind === "heal") {
    if (!has("amount")) return "amount";
    if (!has("range")) return "range";
  }
  if (kind === "pattern" || kind === "orbit") {
    if (!has("damage")) return "damage";
    if (kind === "pattern" && !has("count")) return "count";
    if (!has("speed")) return "speed";
    if (kind === "orbit" && !has("radius")) return "radius";
    if (kind === "orbit" && !has("duration")) return "duration";
  }
  if (kind === "zone") {
    if (!has("radius") && !has("range")) return "radius";
    if (!has("duration")) return "duration";
  }
  if (kind === "warn" && !has("time")) return "time";
  return "";
}

function checkAction(owner: string, level: AbilityLevel | null, action: ActionDef) {
  if (!hasAction(action.do)) throw new Error(`Ação desconhecida em ${owner}: ${action.do}`);
  if (action.status && !hasStatus(action.status)) throw new Error(`Status desconhecido em ${owner}: ${action.status}`);
  const field = missing(level, action);
  if (field) throw new Error(`Ação ${action.do} de ${owner} precisa de ${field}`);
  mergeNumbers(level, action);
}

function checkSpell(owner: string, spell: { id?: string; cast: ActionDef[] }, level: AbilityLevel | null) {
  for (const action of spell.cast) checkAction(spell.id ? `${owner}/${spell.id}` : owner, level, action);
}

export function assertSpells(data: Pick<GameData, "abilities" | "creeps">) {
  for (const ability of data.abilities) checkAbility(ability);
  for (const creep of data.creeps) checkCreep(creep);
}

function checkAbility(ability: AbilityDef) {
  if (!hasTargeting(ability.targeting)) throw new Error(`Targeting desconhecido em ${ability.id}: ${ability.targeting}`);
  for (const level of ability.levels) checkSpell(ability.id, ability, level);
}

function checkCreep(creep: CreepDef) {
  const spells = [...(creep.skills ?? []), ...(creep.skill ? [creep.skill] : [])];
  for (const spell of spells) checkSpell(creep.id, spell, null);
  for (const phase of creep.phases ?? []) {
    for (const id of phase.rotation) {
      if (!spells.some((spell) => spell.id === id)) throw new Error(`Fase de ${creep.id} cita skill inexistente: ${id}`);
    }
  }
}
