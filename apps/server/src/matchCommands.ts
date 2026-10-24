import {
  jumpWave,
  setBotsGodmode,
  setDuels,
  setGodmode,
  skipDuel,
  type Match,
} from "@game/sim";
import type { ChatCommand } from "./chat.js";

function godmodeReply(on: boolean | null) {
  if (on == null) return "godmode só vale enquanto você está na partida";
  return on ? "godmode ligado" : "godmode desligado";
}

export function runMatchCommand(match: Match, playerId: string, command: ChatCommand): string {
  if (command.name === "godmode") return godmodeReply(setGodmode(match, playerId, command.on));
  if (command.name === "skipduel") return skipDuel(match) ? "duelo pulado" : "não tem duelo para pular";
  if (match.phase === "ended") return "a partida já acabou";
  if (command.name === "duels") {
    const on = setDuels(match, command.on);
    if (on == null) return "a partida já acabou";
    return on ? "duelos ligados" : "duelos desligados";
  }
  if (command.name === "wave") {
    const round = jumpWave(match, command.round);
    return round == null ? "onda inválida (1 a 99)" : `onda ${round}`;
  }
  const on = setBotsGodmode(match, command.on);
  if (on == null) return "não tem bot vivo na partida";
  return on ? "bots imortais" : "bots normais";
}
