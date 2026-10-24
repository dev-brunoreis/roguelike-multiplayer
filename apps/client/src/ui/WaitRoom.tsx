import { Client, type Room } from "colyseus.js";
import { useEffect, useRef, useState } from "react";
import type { ChatLine, LobbyState } from "@game/shared/protocol";
import { serverReachable, wsBase } from "../net.js";
import { HeroSprite, ShadowPick } from "./HeroSprite.js";
import { SoundMix } from "./SoundMix.js";
import { mergeChat, TextChat } from "./TextChat.js";

const CONSENTED = 4000;

export function WaitRoom({
  token,
  roomId,
  onLeave,
  onStart,
  onDown,
  colors,
  shadowColor,
  onPick,
}: {
  token: string;
  roomId?: string;
  onLeave: () => void;
  onStart: (roomId: string) => void;
  onDown: () => void;
  colors: string[];
  shadowColor: string;
  onPick: (color: string) => void;
}) {
  const [state, setState] = useState<LobbyState | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [error, setError] = useState("");
  const roomRef = useRef<Room | null>(null);
  const shadowRef = useRef(shadowColor);
  shadowRef.current = shadowColor;

  useEffect(() => {
    const client = new Client(wsBase());
    let room: Room | null = null;
    let closed = false;
    const joining = roomId
      ? client.joinById(roomId, { token, shadowColor: shadowRef.current })
      : client.create("lobby", { token, shadowColor: shadowRef.current });
    void joining.then((joined) => {
      if (closed) {
        void joined.leave();
        return;
      }
      room = joined;
      roomRef.current = joined;
      joined.onMessage("lobby", (next: LobbyState) => setState(next));
      joined.onMessage("chat", (incoming: ChatLine | ChatLine[]) => setChat((current) => mergeChat(current, incoming)));
      joined.onMessage("go", (message: { roomId: string }) => onStart(message.roomId));
      joined.onLeave((code) => {
        if (closed || code === CONSENTED) return;
        closed = true;
        onDown();
      });
    }).catch((err: unknown) => {
      if (closed) return;
      closed = true;
      if (err instanceof TypeError || (err instanceof Error && /fetch|network|websocket|offline|econn/i.test(err.message))) onDown();
      else setError(err instanceof Error ? err.message : "Não entrei na sala.");
    });
    let misses = 0;
    const beat = window.setInterval(() => {
      void serverReachable(token).then((up) => {
        if (closed) return;
        misses = up ? 0 : misses + 1;
        if (misses >= 2) {
          closed = true;
          onDown();
        }
      });
    }, 2000);
    return () => {
      closed = true;
      window.clearInterval(beat);
      void room?.leave();
    };
  }, [token, roomId, onStart, onDown]);

  const host = state?.hostId === state?.youId;
  const mine = state?.players.find((player) => player.id === state.youId);
  function sendConfig(patch: Partial<LobbyState["config"]>) {
    if (!state) return;
    roomRef.current?.send("config", { ...state.config, ...patch });
  }

  return (
    <main className="screen">
      <section className="panel lobby">
        <header className="row">
          <div>
            <p className="eyebrow">{host ? "sua sala" : "sala"}</p>
            <h1>{host ? "Esperando jogadores" : "Na sala"}</h1>
          </div>
          <button className="btn ghost" onClick={onLeave}>Voltar</button>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="lobby-split">
          <section className="block">
            <p className="eyebrow">na sala</p>
            <h2>Quem entrou</h2>
            <ul className="roster">
              {(state?.players ?? []).map((player) => {
                const hero = state?.heroes.find((item) => item.id === player.heroId);
                const same = player.id !== mine?.id && player.heroId === mine?.heroId;
                const sameShade = player.id !== mine?.id && !!player.shadowColor && player.shadowColor.toLowerCase() === (mine?.shadowColor ?? shadowColor).toLowerCase();
                return (
                  <li key={player.id}>
                    <HeroSprite view={player.heroId} shadow={player.shadowColor} />
                    <div>
                      <b style={{ color: player.shadowColor || "#f3ecdf" }}>{player.name}</b>
                      {player.id === state?.hostId ? " · host" : ""}
                      <small>{hero?.nome ?? "escolhendo"}{same ? " · igual ao seu" : ""}{sameShade ? " · sombra igual" : ""}</small>
                    </div>
                  </li>
                );
              })}
              {(state?.players.length ?? 0) === 0 ? <li className="muted">Entrando na sala...</li> : null}
            </ul>
          </section>
          <section className="block">
            <p className="eyebrow">você</p>
            <h2>Seu personagem</h2>
            <ShadowPick colors={colors} value={shadowColor} onPick={(color) => {
              onPick(color);
              roomRef.current?.send("shadow", { color });
            }} />
            <div className="heroes">
              {(state?.heroes ?? []).map((hero) => {
                const others = (state?.players ?? []).filter((player) => player.heroId === hero.id && player.id !== state?.youId);
                return (
                  <button
                    key={hero.id}
                    type="button"
                    className={mine?.heroId === hero.id ? "hero-card on" : "hero-card"}
                    style={{ ["--hero" as string]: hero.color }}
                    onClick={() => roomRef.current?.send("hero", { heroId: hero.id })}
                  >
                    <HeroSprite view={hero.id} shadow={shadowColor} />
                    <strong>{hero.nome}</strong>
                    <small>{hero.hp} de vida · velocidade {hero.speed}</small>
                    <span>{hero.descricao}</span>
                    {others.length > 0 ? <em className="taken">{others.map((player) => player.name).join(", ")}</em> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <section className="block">
          <p className="eyebrow">partida</p>
          <h2>Como vai ser</h2>
          {host ? null : <p className="muted">Só o host muda isso.</p>}
          <div className="settings">
            <label>Lugares
              <input disabled={!host} type="number" min={2} max={8} value={state?.config.slots ?? 4} onChange={(event) => sendConfig({ slots: Number(event.target.value) })} />
            </label>
            <label>Vidas
              <input disabled={!host} type="number" min={1} max={9} value={state?.config.lives ?? 3} onChange={(event) => sendConfig({ lives: Number(event.target.value) })} />
            </label>
            <label>Cartas por nível
              <input disabled={!host} type="number" min={2} max={8} value={state?.config.cardsPerLevelUp ?? 5} onChange={(event) => sendConfig({ cardsPerLevelUp: Number(event.target.value) })} />
            </label>
            <label className="check">
              <input disabled={!host} type="checkbox" checked={state?.config.fillWithBots ?? true} onChange={(event) => sendConfig({ fillWithBots: event.target.checked })} />
              Preencher com bots
            </label>
          </div>
          {state?.error ? <p className="error">{state.error}</p> : null}
          {host ? <button className="btn primary" onClick={() => roomRef.current?.send("start")}>Começar</button> : <p className="muted">Esperando o host começar.</p>}
        </section>
        <TextChat lines={chat} youId={state?.youId ?? ""} onSend={(text) => roomRef.current?.send("chat", { text })} />
        <SoundMix />
      </section>
    </main>
  );
}
