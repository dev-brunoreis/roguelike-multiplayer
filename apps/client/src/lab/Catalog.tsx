import type { ReactNode } from "react";
import type { GameData } from "@game/game-data/build";
import type { LabSel } from "./select.js";
import { formatSel } from "./select.js";

const FILES = [
  "match.json",
  "dungeon.json",
  "abyss.json",
  "cards.json",
  "waves.json",
  "bosses.json",
  "synergies.json",
  "visual/vfx.json",
  "visual/actors.json",
  "visual/lab.json",
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lab-group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Catalog({
  game,
  vfxIds,
  sel,
  dirty,
  onPick,
}: {
  game: GameData | null;
  vfxIds: string[];
  sel: LabSel;
  dirty: string[];
  onPick: (sel: LabSel) => void;
}) {
  const current = formatSel(sel);
  const item = (next: LabSel, label: string) => (
    <button key={formatSel(next)} className={current === formatSel(next) ? "on" : ""} onClick={() => onPick(next)}>
      {label}
    </button>
  );
  const heroes = game?.heroes ?? [];
  const creeps = game?.creeps.filter((creep) => creep.kind !== "boss") ?? [];
  const bosses = game?.creeps.filter((creep) => creep.kind === "boss") ?? [];
  const abilities = game?.abilities ?? [];
  return (
    <aside className="lab-side">
      <p className="eyebrow">laboratório</p>
      <Group title="Heróis">
        {heroes.map((hero) => item({ kind: "hero", id: hero.id }, hero.nome))}
      </Group>
      <Group title="Bichos">
        {creeps.map((creep) => item({ kind: "creep", id: creep.id }, creep.nome))}
      </Group>
      <Group title="Chefes">
        {bosses.map((creep) => item({ kind: "boss", id: creep.id }, creep.nome))}
      </Group>
      <Group title="Skills">
        {abilities.map((ability) => item({ kind: "ability", id: ability.id }, ability.nome))}
      </Group>
      <Group title="VFX">
        {vfxIds.map((id) => item({ kind: "vfx", id }, id))}
      </Group>
      <Group title="Arquivos">
        {FILES.map((file) => item({ kind: "file", file }, `${dirty.includes(file) ? "• " : ""}${file}`))}
      </Group>
    </aside>
  );
}
