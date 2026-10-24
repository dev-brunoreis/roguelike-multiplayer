import { Client, type Room } from "colyseus.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { LobbyState, Snapshot } from "@game/shared/protocol";
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
  const [betAmount, setBetAmount] = useState(5);
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
      if (event.code.startsWith("Arrow")) event.preventDefault();
      if (isTypingTarget(event.target)) return;
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
          <span>{Math.ceil(snap.phaseTime)}s</span>
        </div>
        {me ? (
          <div className="you">
            <span style={{ color: me.color }}>{me.name}</span>
            <span>{"♥".repeat(Math.max(0, me.lives))}</span>
            <span>nível {me.level}</span>
            <span className="xp"><i style={{ width: `${Math.min(100, (me.xp / me.xpNext) * 100)}%` }} /></span>
            <span>{me.gold} ouro</span>
          </div>
        ) : null}
        <button className="btn danger" disabled={!me || me.eliminated || snap.phase === "ended"} onClick={() => {
          if (confirm("Desistir elimina você agora.")) send("surrender");
        }}>Desistir</button>
      </header>
      <aside className="hud roster-side">
        {snap.players.map((player) => (
          <button key={player.id} className={player.eliminated ? "out" : ""} onClick={() => setWatchId(player.id)}>
            <b style={{ color: player.color }}>{player.name}</b>
            <small>{player.eliminated ? "fora" : `${Math.ceil(player.hp)} hp · ${player.lives} vidas`}</small>
            {player.choosing ? <small>escolhendo carta</small> : null}
            {snap.phase === "pve" && player.waveClear && !player.eliminated ? <small>limpo</small> : null}
          </button>
        ))}
      </aside>
      <footer className="hud abilities">
        {me?.abilities.map((ability) => {
          const ratio = ability.cooldownMax > 0 ? Math.max(0, ability.cooldown) / ability.cooldownMax : 0;
          return (
            <div key={ability.id} className="ability" title={ability.descricao} style={{ ["--cd" as string]: `${ratio * 100}%`, borderColor: ability.color }}>
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
          <div className="cards">
            {me.pending.map((card) => (
              <button key={card.id} className={`card rarity-${card.rarity}`} onClick={() => send("pick", { cardId: card.id })}>
                <em>{card.rarity}</em>
                <strong>{card.nome}</strong>
                <span>{card.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {(snap.phase === "betting" || (snap.phase === "hub" && snap.duel.length > 0)) && me && !me.inDuel && !me.eliminated ? (
        <section className="overlay dock bet">
          <h2>Apostar em quem</h2>
          <input type="range" min={5} max={Math.max(5, Math.min(40, me.gold))} value={betAmount} onChange={(event) => setBetAmount(Number(event.target.value))} />
          <p>{betAmount} de ouro</p>
          <div className="row">
            {snap.duel.flatMap((pair) => [pair.a, pair.b]).map((id) => {
              const fighter = snap.players.find((player) => player.id === id);
              if (!fighter) return null;
              return <button key={id} className="btn" onClick={() => send("bet", { targetId: id, amount: betAmount })}>{fighter.name}</button>;
            })}
          </div>
          {me.bet ? <p>Aposta em {snap.players.find((player) => player.id === me.bet?.targetId)?.name}: {me.bet.amount}</p> : null}
        </section>
      ) : null}
      {(snap.phase === "shop" || snap.phase === "hub") && me && !me.eliminated && me.pending.length === 0 ? (
        <section className="overlay dock shop">
          {me.shop ? (
            <>
              <h2>{snap.phase === "hub" ? "Salão" : "Loja"} <small>{Math.ceil(snap.phaseTime)}s</small></h2>
              <div className="cards">
                {me.shop.offers.map((card) => (
                  <button key={card.id} className={`card rarity-${card.rarity}`} disabled={me.gold < card.price} onClick={() => send("shop", { kind: "buy", cardId: card.id })}>
                    <em>{card.rarity} · {card.price} ouro</em>
                    <strong>{card.nome}</strong>
                    <span>{card.descricao}</span>
                  </button>
                ))}
              </div>
              <div className="row">
                {me.shop.upgrades.map((upgrade) => (
                  <button key={upgrade.abilityId} className="btn" disabled={me.gold < upgrade.cost} onClick={() => send("shop", { kind: "upgrade", abilityId: upgrade.abilityId })}>
                    {upgrade.nome} nv{upgrade.level} → {upgrade.level + 1} · {upgrade.cost}
                  </button>
                ))}
                <button className="btn" disabled={me.gold < me.shop.rerollCost} onClick={() => send("shop", { kind: "reroll" })}>Trocar cartas · {me.shop.rerollCost}</button>
                <button className="btn primary" onClick={() => send("shop", { kind: "ready" })}>{me.ready ? "Pronto" : "Seguir"}</button>
              </div>
            </>
          ) : (
            <>
              <h2>Salão <small>{Math.ceil(snap.phaseTime)}s</small></h2>
              <button className="btn primary" onClick={() => send("shop", { kind: "ready" })}>{me.ready ? "Pronto" : "Seguir"}</button>
            </>
          )}
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
        <p className="hint">W sobe na tela. No salão ninguém se bate. A onda só acaba quando o último limpa.</p>
      )}
    </main>
  );
}

