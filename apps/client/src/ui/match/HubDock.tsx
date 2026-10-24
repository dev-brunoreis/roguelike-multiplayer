import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const HubDock = memo(function HubDock({ onReady }: { onReady: () => void }) {
  const phase = useSlice(() => matchStore.phase);
  const pending = useSlice(() => matchStore.pending);
  const me = useSlice(() => matchStore.me);
  if (!phase || phase.phase !== "hub" || phase.duelAnnounce > 0 || !me || me.eliminated || pending.show) return null;
  return (
    <section className="overlay dock shop">
      <h2>Salão <small>{Math.ceil(phase.phaseTime)}s</small></h2>
      <p className="muted">{phase.duelCount > 0 ? "Um duelo vem aí. Espaço para seguir." : "Espaço para seguir."}</p>
      <button className="btn primary" tabIndex={-1} onClick={onReady}>{me.ready ? "Pronto" : "Seguir"}</button>
    </section>
  );
});
