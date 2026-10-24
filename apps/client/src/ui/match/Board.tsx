import { memo } from "react";
import { SkillGlyph } from "../../game/icons.js";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const Board = memo(function Board({ watchId, onWatch }: { watchId: string | null; onWatch: (id: string | null) => void }) {
  const board = useSlice(() => matchStore.board);
  const phase = useSlice(() => matchStore.phase);
  const youId = useSlice(() => matchStore.youId);
  return (
    <aside className="hud side">
      <div className="board">
        {board.map((player) => {
          const mine = player.id === youId;
          const followed = (watchId ?? youId) === player.id;
          return (
            <button key={player.id} tabIndex={-1} className={[player.eliminated ? "out" : "", mine ? "me" : "", player.inDuel ? "duel" : "", followed ? "on" : ""].filter(Boolean).join(" ")} onClick={() => onWatch(player.id === youId ? null : player.id)}>
              <b style={{ color: player.color }}>{player.name}</b>
              <span className="life" title={`${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`}>
                <i style={{ width: `${Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100))}%` }} />
              </span>
              <small>{"♥".repeat(Math.max(0, player.lives))}{player.respawnIn > 0 && player.lives > 0 ? ` · ${Math.ceil(player.respawnIn)}s` : ""}{player.eliminated ? " fora" : ""}{player.inDuel ? " · duelo" : ""}{player.godmode ? " · godmode" : ""}{player.pauseWant ? " · pausa" : ""}{player.waveClear && phase?.phase === "pve" ? " · limpo" : ""}</small>
              <span className="pips">
                {player.abilities.map((ability) => {
                  const ratio = ability.cooldownMax > 0 ? Math.max(0, ability.cooldown) / ability.cooldownMax : 0;
                  return (
                    <span key={ability.id} style={{ opacity: 0.4 + (1 - ratio) * 0.6 }}>
                      <SkillGlyph id={ability.id} color={ability.color} title={`${ability.nome} nv ${ability.level}`} />
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
});
