import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const MatchLog = memo(function MatchLog() {
  const log = useSlice(() => matchStore.log);
  return (
    <div className="log">
      {log.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
    </div>
  );
});

export const WaveWait = memo(function WaveWait() {
  const wait = useSlice(() => matchStore.waveWait);
  if (!wait) return null;
  return <p className="hint wait">Você limpou. Esperando o resto terminar.</p>;
});

export const StatusHints = memo(function StatusHints({ menuOpen }: { menuOpen: boolean }) {
  const me = useSlice(() => matchStore.me);
  const spectate = useSlice(() => matchStore.spectate);
  const phase = useSlice(() => matchStore.phase);
  return (
    <>
      {me && me.respawnIn > 0 && me.lives > 0 && !me.eliminated ? (
        <p className="respawn">Renasce em <strong>{Math.ceil(me.respawnIn)}s</strong></p>
      ) : null}
      {spectate ? <p className="spectate">Você caiu. Clica num nome pra assistir.</p> : (
        <p className="hint">W sobe na tela. Enter fala. Esc abre o menu. Tab olha o próximo. 1–6 escolhe carta. Espaço segue no salão.</p>
      )}
      {phase?.paused && !menuOpen ? <p className="paused-flag">Pausado</p> : null}
    </>
  );
});
