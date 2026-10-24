import { memo, useSyncExternalStore } from "react";
import { matchStore } from "./store.js";

function subscribe(listener: () => void) {
  return matchStore.subscribe(listener);
}

export function useSlice<T>(pick: () => T) {
  return useSyncExternalStore(subscribe, pick, pick);
}

export const PhaseBar = memo(function PhaseBar() {
  const phase = useSlice(() => matchStore.phase);
  const me = useSlice(() => matchStore.me);
  if (!phase) return null;
  return (
    <header className="hud top">
      <div>
        <strong>{phase.phase === "dungeon" ? phase.label : `${phase.label} ${phase.round}`}</strong>
        {me ? <span className="xp"><i style={{ width: `${Math.min(100, (me.xp / me.xpNext) * 100)}%` }} /></span> : null}
        {phase.paused ? <em className="flag">pausado</em> : null}
        {!phase.paused && phase.asking > 0 ? <em className="flag">{phase.asking}/{phase.humans} pausa</em> : null}
      </div>
    </header>
  );
});
