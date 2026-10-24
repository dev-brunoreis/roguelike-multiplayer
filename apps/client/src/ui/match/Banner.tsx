import { memo } from "react";
import { matchStore } from "./store.js";
import { useSlice } from "./PhaseBar.js";

const BANNER_KIND: Record<string, string> = {
  duel: "Duelo",
  duel_result: "Duelo",
  death: "Queda",
  surrender: "Desistência",
  eliminate: "Fora",
  info: "Aviso",
  boss: "Chefe",
};

export const Banner = memo(function Banner() {
  const announce = useSlice(() => matchStore.announce);
  if (!announce) return null;
  return (
    <section className={`banner kind-${announce.kind}`}>
      <em>{BANNER_KIND[announce.kind] ?? "Aviso"}</em>
      <h2>{announce.title}</h2>
      {announce.detail ? <p>{announce.detail}</p> : null}
      {announce.kind === "duel" ? <span>{Math.ceil(announce.left)}</span> : null}
    </section>
  );
});
