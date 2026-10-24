import { memo } from "react";
import { SoundMix } from "../SoundMix.js";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const Menu = memo(function Menu({
  open,
  ask,
  onClose,
  onAsk,
  onLeave,
  onSend,
}: {
  open: boolean;
  ask: null | "leave" | "giveup";
  onClose: () => void;
  onAsk: (ask: null | "leave" | "giveup") => void;
  onLeave: () => void;
  onSend: (type: string, payload?: unknown) => void;
}) {
  const phase = useSlice(() => matchStore.phase);
  const me = useSlice(() => matchStore.me);
  const board = useSlice(() => matchStore.board);
  if (!open || !phase) return null;
  const asking = board.filter((player) => !player.isBot && !player.eliminated && player.pauseWant);
  return (
    <div className="menu-back">
      <section className="menu" role="dialog" aria-label="Menu">
        <p className="eyebrow">esc</p>
        <h2>Menu</h2>
        {ask === "giveup" ? (
          <>
            <p>Desistir elimina você agora.</p>
            <button className="btn danger" type="button" onClick={() => onSend("surrender")}>Confirmar desistência</button>
            <button className="btn ghost" type="button" onClick={() => onAsk(null)}>Voltar</button>
          </>
        ) : null}
        {ask === "leave" ? (
          <>
            <p>Se você não voltar em 8 segundos, a saída conta como desistência.</p>
            <button className="btn danger" type="button" onClick={onLeave}>Sair agora</button>
            <button className="btn ghost" type="button" onClick={() => onAsk(null)}>Voltar</button>
          </>
        ) : null}
        {ask == null ? (
          <>
            <button className="btn primary" type="button" onClick={onClose}>Continuar</button>
            <button className="btn" type="button" disabled={!me || me.eliminated || phase.phase === "ended"} onClick={() => onSend("pause", { want: !me?.pauseWant })}>
              {me?.pauseWant ? (phase.paused ? "Retomar" : "Cancelar pedido") : "Pedir pausa"}
            </button>
            <p className="muted">A partida congela quando todo humano vivo pede. Bots não votam.</p>
            {asking.length > 0 ? <p className="muted">{asking.map((player) => player.name).join(", ")} {asking.length === 1 ? "pediu" : "pediram"} pausa.</p> : null}
            <SoundMix />
            <button className="btn danger" type="button" disabled={!me || me.eliminated || phase.phase === "ended"} onClick={() => onAsk("giveup")}>Desistir</button>
            <button className="btn ghost" type="button" onClick={() => onAsk("leave")}>Sair da partida</button>
          </>
        ) : null}
      </section>
    </div>
  );
});
