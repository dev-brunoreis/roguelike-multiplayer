import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const EndScreen = memo(function EndScreen({ onLeave }: { onLeave: () => void }) {
  const ended = useSlice(() => matchStore.ended);
  const name = useSlice(() => matchStore.winnerName);
  const snap = useSlice(() => (matchStore.ended ? matchStore.snap : null));
  if (!ended || !snap) return null;
  return (
    <section className="overlay end">
      <h2>{snap.abyss?.result === "win" ? "O coração foi encontrado" : snap.abyss?.result === "lose" ? "A descida acaba" : snap.dungeon?.result === "win" ? "Vitória do grupo" : snap.dungeon?.result === "lose" ? "Derrota" : snap.winnerId ? `${name} venceu` : "Sem vencedor"}</h2>
      <table>
        <thead><tr><th>#</th><th>Nome</th><th>Dano</th><th>Abates</th><th>Build</th></tr></thead>
        <tbody>
          {[...snap.players].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99)).map((player) => (
            <tr key={player.id}>
              <td>{player.placement}</td>
              <td>{player.name}</td>
              <td>{player.damageDealt}</td>
              <td>{player.kills}</td>
              <td>{player.cards.map((card) => card.nome).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn primary" tabIndex={-1} onClick={onLeave}>Voltar ao lobby</button>
    </section>
  );
});
