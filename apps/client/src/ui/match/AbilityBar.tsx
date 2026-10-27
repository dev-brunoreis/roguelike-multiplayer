import { memo } from "react";
import { SkillGlyph } from "../../game/icons.js";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

export const AbilityBar = memo(function AbilityBar() {
  const me = useSlice(() => matchStore.me);
  const explore = useSlice(() => matchStore.snap?.mode === "abismo");
  if (explore) return null;
  return (
    <footer className="hud abilities">
      {me?.abilities.map((ability, index) => {
        const ratio = ability.cooldownMax > 0 ? Math.max(0, ability.cooldown) / ability.cooldownMax : 0;
        return (
          <div key={ability.id} className="ability" title={ability.descricao} style={{ ["--cd" as string]: `${ratio * 100}%`, borderColor: ability.color }}>
            <SkillGlyph id={ability.id} color={ability.color} />
            <em>{index + 1}</em>
            <strong>{ability.nome}</strong>
            <small>nv {ability.level}/{ability.max}</small>
          </div>
        );
      })}
    </footer>
  );
});
