import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const CardPick = memo(function CardPick({ onPick }: { onPick: (cardId: string) => void }) {
  const pending = useSlice(() => matchStore.pending);
  if (!pending.show) return null;
  return (
    <section className="overlay pick">
      <h2>Escolhe uma carta <small>{Math.ceil(pending.timer)}s</small></h2>
      <div className="cards">
        {pending.cards.map((card, index) => (
          <button key={card.id} tabIndex={-1} className={`card rarity-${card.rarity}`} onClick={() => onPick(card.id)}>
            <em>{index + 1} · {card.rarity}</em>
            <strong>{card.nome}</strong>
            <span>{card.descricao}</span>
          </button>
        ))}
      </div>
    </section>
  );
});
