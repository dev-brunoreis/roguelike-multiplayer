import { Client, type Room } from "colyseus.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AnnounceSnap, LobbyState, Snapshot } from "@game/shared/protocol";
import { SkillGlyph } from "../game/icons.js";
import { Scene } from "../game/Scene.js";
import { cameraMove, isTypingTarget } from "../game/input.js";
import { api, wsBase } from "../net.js";
import { blip, unlockAudio } from "../audio.js";

interface User {
  id: string;
  username: string;
}

const TOKEN = "caos.token";

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN));
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const leaveMatch = useCallback(() => setRoomId(null), []);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api<{ user: User }>("/api/me", {}, token)
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN);
        setToken(null);
      })
      .finally(() => setBooting(false));
  }, [token]);

  if (booting) return <main className="screen"><p>Entrando...</p></main>;
  if (!token || !user) {
    return <Login onAuth={(next, account) => { localStorage.setItem(TOKEN, next); setToken(next); setUser(account); }} />;
  }
  if (roomId) {
    return <Match token={token} roomId={roomId} onLeave={leaveMatch} />;
  }
  return (
    <Lobby
      token={token}
      onLogout={() => { localStorage.removeItem(TOKEN); setToken(null); setUser(null); }}
      onStart={setRoomId}
    />
  );
}

function Login({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ token: string; user: User }>(`/api/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falhou");
    }
  }

  return (
    <main className="screen">
      <form className="panel login" onSubmit={submit}>
        <p className="eyebrow">último vivo vence</p>
        <h1>Caos</h1>
        <p className="muted">Ondas, cartas e duelos com os amigos. Fecha o jogo e a partida fica pra trás.</p>
        <label>Nome<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn primary" type="submit">{mode === "login" ? "Entrar" : "Criar conta"}</button>
        <button className="btn ghost" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}

function Lobby({ token, onLogout, onStart }: { token: string; onLogout: () => void; onStart: (roomId: string) => void }) {
  const [state, setState] = useState<LobbyState | null>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    const client = new Client(wsBase());
    let room: Room | null = null;
    let closed = false;
    client.joinOrCreate("lobby", { token }).then((joined) => {
      if (closed) {
        void joined.leave();
        return;
      }
      room = joined;
      roomRef.current = joined;
      joined.onMessage("lobby", (next: LobbyState) => setState(next));
      joined.onMessage("go", (message: { roomId: string }) => onStart(message.roomId));
    }).catch((error: unknown) => {
      console.error(error);
    });
    return () => {
      closed = true;
      void room?.leave();
    };
  }, [token, onStart]);

  const host = state?.hostId === state?.youId;
  function sendConfig(patch: Partial<LobbyState["config"]>) {
    if (!state) return;
    roomRef.current?.send("config", { ...state.config, ...patch });
  }

  return (
    <main className="screen">
      <section className="panel lobby">
        <header className="row">
          <div>
            <p className="eyebrow">sala</p>
            <h1>Quem entra no caos</h1>
          </div>
          <button className="btn ghost" onClick={onLogout}>Sair</button>
        </header>
        <ul className="roster">
          {(state?.players ?? []).map((player) => (
            <li key={player.id}>{player.name}{player.id === state?.hostId ? " · host" : ""}</li>
          ))}
        </ul>
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
        <button className="btn primary" disabled={!host} onClick={() => roomRef.current?.send("start")}>Começar</button>
        {!host ? <p className="muted">Esperando o host começar.</p> : null}
      </section>
    </main>
  );
}

const PHASE: Record<string, string> = {
  hub: "Salão",
  pve: "Onda",
  betting: "Apostas",
  duel: "Duelo",
  shop: "Loja",
  ended: "Fim",
};

function Match({ token, roomId, onLeave }: { token: string; roomId: string; onLeave: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const hpRef = useRef<number | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const shakeRef = useRef(0);
  snapRef.current = snap;

  useEffect(() => {
    const client = new Client(wsBase());
    let room: Room | null = null;
    let closed = false;
    client.joinById(roomId, { token }).then((joined) => {
      if (closed) {
        void joined.leave();
        return;
      }
      room = joined;
      roomRef.current = joined;
      joined.onMessage("snapshot", (next: Snapshot) => setSnap(next));
    }).catch((error: unknown) => {
      console.error(error);
      onLeave();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      closed = true;
      window.removeEventListener("beforeunload", beforeUnload);
      void room?.leave();
    };
  }, [roomId, token, onLeave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
      if (isTypingTarget(event.target)) return;
      const snap = snapRef.current;
      const you = snap?.players.find((player) => player.id === snap.youId);
      if (event.code === "Space" && event.type === "keydown") {
        if (snap?.phase === "hub" && you && !you.eliminated && you.pending.length === 0 && !you.ready) {
          roomRef.current?.send("shop", { kind: "ready" });
        }
        return;
      }
      const digit = event.code.startsWith("Digit") ? Number(event.code.slice(5)) : 0;
      if (you && digit >= 1 && digit <= 6 && you.pending[digit - 1]) {
        roomRef.current?.send("pick", { cardId: you.pending[digit - 1]!.id });
      }
      roomRef.current?.send("input", cameraMove());
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const pulse = setInterval(() => roomRef.current?.send("input", cameraMove()), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      clearInterval(pulse);
    };
  }, []);

  useEffect(() => {
    if (!snap) return;
    const me = snap.players.find((player) => player.id === snap.youId);
    if (!me) return;
    if (hpRef.current !== null && me.hp < hpRef.current) {
      blip(140, 0.08, "sawtooth", 0.04);
      shakeRef.current = 1;
    }
    if (snap.floats.some((item) => item.crit)) blip(620, 0.05, "square", 0.025);
    hpRef.current = me.hp;
  }, [snap]);

  if (!snap) return <main className="screen"><p>Abrindo a arena...</p></main>;
  const me = snap.players.find((player) => player.id === snap.youId);
  const send = (type: string, payload?: unknown) => roomRef.current?.send(type, payload);

  return (
    <main className="match" onPointerDown={unlockAudio}>
      <Scene snapRef={snapRef} watchId={watchId} shakeRef={shakeRef} />
      <header className="hud top">
        <div>
          <strong>{PHASE[snap.phase] ?? snap.phase} {snap.round}</strong>
          <span>{Math.ceil(snap.announce?.kind === "duel" ? snap.announce.left : snap.phaseTime)}s</span>
          {me ? <span className="xp"><i style={{ width: `${Math.min(100, (me.xp / me.xpNext) * 100)}%` }} /></span> : null}
        </div>
        <button className="btn danger" disabled={!me || me.eliminated || snap.phase === "ended"} onClick={() => {
          if (confirm("Desistir elimina você agora.")) send("surrender");
        }}>Desistir</button>
      </header>
      <aside className="hud side">
        <div className="board">
          {snap.players.map((player) => (
            <button key={player.id} className={player.eliminated ? "out" : ""} onClick={() => setWatchId(player.id)}>
              <b style={{ color: player.color }}>{player.name}</b>
              <small>{"♥".repeat(Math.max(0, player.lives))}{player.eliminated ? " fora" : ""}{player.waveClear && snap.phase === "pve" ? " · limpo" : ""}</small>
              <span className="pips">
                {player.abilities.map((ability) => {
                  const ratio = ability.cooldownMax > 0 ? Math.max(0, ability.cooldown) / ability.cooldownMax : 0;
                  return (
                    <span key={ability.id} style={{ opacity: 0.4 + (1 - ratio) * 0.6 }}>
                      <SkillGlyph id={ability.id} color={ability.color} title={`${ability.nome} nv ${ability.level}`} />
                    </span>
                  );
                })}
              </span>
            </button>
          ))}
        </div>
      </aside>
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
      <div className="log">
        {snap.log.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
      </div>
      {me && me.pending.length > 0 ? (
        <section className="overlay pick">
          <h2>Escolhe uma carta <small>{Math.ceil(me.cardTimer)}s</small></h2>
          {me.luck > 0 ? <p className="muted">Sorte {(me.luck * 100).toFixed(0)}% — cartas melhores aparecem mais.</p> : null}
          <div className="cards">
            {me.pending.map((card, index) => (
              <button key={card.id} className={`card rarity-${card.rarity}`} onClick={() => send("pick", { cardId: card.id })}>
                <em>{index + 1} · {card.rarity}</em>
                <strong>{card.nome}</strong>
                <span>{card.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {snap.announce ? <Banner announce={snap.announce} /> : null}
      {snap.phase === "hub" && snap.duelAnnounce <= 0 && me && !me.eliminated && me.pending.length === 0 ? (
        <section className="overlay dock shop">
          <h2>Salão <small>{Math.ceil(snap.phaseTime)}s</small></h2>
          {snap.duel.length > 0 ? <p className="muted">Um duelo vem aí. Espaço para seguir.</p> : <p className="muted">Espaço para seguir.</p>}
          <button className="btn primary" onClick={() => send("shop", { kind: "ready" })}>{me.ready ? "Pronto" : "Seguir"}</button>
        </section>
      ) : null}
      {snap.phase === "pve" && me?.waveClear && !me.eliminated ? (
        <p className="hint wait">Você limpou. Esperando o resto terminar.</p>
      ) : null}
      {snap.phase === "ended" ? (
        <section className="overlay end">
          <h2>{snap.winnerId ? `${snap.players.find((player) => player.id === snap.winnerId)?.name} venceu` : "Sem vencedor"}</h2>
          <table>
            <thead><tr><th>#</th><th>Nome</th><th>Dano</th><th>Abates</th><th>Build</th></tr></thead>
            <tbody>
              {[...snap.players].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99)).map((player) => (
                <tr key={player.id}>
                  <td>{player.placement}</td>
                  <td>{player.name}</td>
                  <td>{player.damageDealt}</td>
                  <td>{player.kills}</td>
                  <td>{player.cards.map((card) => card.nome).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn primary" onClick={onLeave}>Voltar ao lobby</button>
        </section>
      ) : null}
      {me?.eliminated && snap.phase !== "ended" ? <p className="spectate">Você caiu. Clica num nome pra assistir.</p> : (
        <p className="hint">W sobe na tela. 1–6 escolhe carta. Espaço segue no salão.</p>
      )}
    </main>
  );
}

const BANNER_KIND: Record<string, string> = {
  duel: "Duelo",
  duel_result: "Duelo",
  death: "Queda",
  surrender: "Desistência",
  eliminate: "Fora",
  info: "Aviso",
};

function Banner({ announce }: { announce: AnnounceSnap }) {
  return (
    <section className={`banner kind-${announce.kind}`}>
      <em>{BANNER_KIND[announce.kind] ?? "Aviso"}</em>
      <h2>{announce.title}</h2>
      {announce.detail ? <p>{announce.detail}</p> : null}
      {announce.kind === "duel" ? <span>{Math.ceil(announce.left)}</span> : null}
    </section>
  );
}

