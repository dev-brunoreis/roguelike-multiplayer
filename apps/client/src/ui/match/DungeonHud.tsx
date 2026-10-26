import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const DungeonHud = memo(function DungeonHud() {
  const phase = useSlice(() => matchStore.phase?.phase);
  const dungeon = useSlice(() => matchStore.snap?.dungeon ?? null);
  if (phase !== "dungeon" || !dungeon) return null;
  return (
    <section className="hud dungeon">
      <strong>{dungeon.objective}</strong>
      <span>Roda o mouse para aproximar</span>
    </section>
  );
});
