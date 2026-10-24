import { memo, useEffect, useRef, useState } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const BossBar = memo(function BossBar() {
  const boss = useSlice(() => matchStore.boss);
  const [shake, setShake] = useState(false);
  const phase = useRef(0);
  useEffect(() => {
    if (!boss) {
      phase.current = 0;
      return;
    }
    if (phase.current && phase.current !== boss.phase) {
      setShake(true);
      const timer = window.setTimeout(() => setShake(false), 360);
      phase.current = boss.phase;
      return () => window.clearTimeout(timer);
    }
    phase.current = boss.phase;
  }, [boss]);
  if (!boss || boss.maxHp <= 0) return null;
  const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  return (
    <section className={shake ? "boss-bar shake" : "boss-bar"}>
      <strong>{boss.nome}</strong>
      <div className="boss-track">
        <i style={{ width: `${ratio * 100}%` }} />
        {boss.marks.map((mark) => <em key={mark} style={{ left: `${mark * 100}%` }} />)}
      </div>
    </section>
  );
});
