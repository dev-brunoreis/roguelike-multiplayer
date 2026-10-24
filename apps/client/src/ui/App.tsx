import { Client, type Room } from "colyseus.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AnnounceSnap, LobbyState, Snapshot } from "@game/shared/protocol";
import { SkillGlyph } from "../game/icons.js";
import { Scene } from "../game/Scene.js";
import { loadIdle } from "../game/sprites.js";
import { cameraMove, isTypingTarget, worldAim } from "../game/input.js";
import { api, ServerDown, serverReachable, wsBase } from "../net.js";
import {
  hearWorld,
  readMix,
  resetHear,
  setMood,
  setMusicVolume,
  setSfxVolume,
  sfxCrit,
  sfxHurt,
  sfxPick,
  sfxUi,
  unlockAudio,
  type Mood,
} from "../audio.js";

interface User {
  id: string;
  username: string;
}

const TOKEN = "caos.token";
const SHADOW_KEY = "caos.shadow";
const SERVER_DOWN = "O servidor caiu. Você foi desconectado.";
const CONSENTED = 4000;

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN));
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seat, setSeat] = useState<null | { roomId?: string }>(null);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [shadowColors, setShadowColors] = useState<string[]>([]);
  const [shadowColor, setShadowColor] = useState(() => localStorage.getItem(SHADOW_KEY) ?? "");
  const leaveMatch = useCallback(() => { setRoomId(null); setSeat(null); }, []);
  const enterMatch = useCallback((id: string) => { setSeat(null); setRoomId(id); }, []);
  const clearNotice = useCallback(() => setNotice(""), []);
  const rememberPalette = useCallback((colors: string[]) => {
    setShadowColors((current) => current.join() === colors.join() ? current : colors);
    setShadowColor((current) => {
      const next = colors.includes(current) ? current : colors[0] ?? current;
      if (next) localStorage.setItem(SHADOW_KEY, next);
      return next;
    });
  }, []);
  const pickShadow = useCallback((color: string) => {
    setShadowColor(color);
    localStorage.setItem(SHADOW_KEY, color);
  }, []);
  const loseServer = useCallback(() => {
    setRoomId(null);
    setSeat(null);
    setNotice(SERVER_DOWN);
  }, []);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const wake = () => unlockAudio();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api<{ user: User }>("/api/me", {}, token)
      .then((data) => {
        setUser(data.user);
        setNotice("");
      })
      .catch((err: unknown) => {
        if (err instanceof ServerDown) {
          setNotice(SERVER_DOWN);
          return;
        }
        localStorage.removeItem(TOKEN);
        setToken(null);
      })
      .finally(() => setBooting(false));
  }, [token, retry]);

  if (booting) return <main className="screen"><p>Entrando...</p></main>;
  if (token && !user) {
    return (
      <main className="screen">
        <section className="panel login">
          <h1>Caos</h1>
          <p className="error">{notice || SERVER_DOWN}</p>
          <button className="btn primary" onClick={() => { setNotice(""); setBooting(true); setRetry((count) => count + 1); }}>Tentar de novo</button>
        </section>
      </main>
    );
  }
  if (!token || !user) {
    return <Login onAuth={(next, account) => { localStorage.setItem(TOKEN, next); setToken(next); setUser(account); }} />;
  }
  if (roomId) {
    return <Match token={token} roomId={roomId} onLeave={leaveMatch} onDown={loseServer} />;
  }
  if (seat) {
    return (
      <WaitRoom
        token={token}
        roomId={seat.roomId}
        onLeave={() => setSeat(null)}
        onStart={enterMatch}
        onDown={loseServer}
        colors={shadowColors}
        shadowColor={shadowColor}
        onPick={pickShadow}
      />
    );
  }
  return (
    <Home
      token={token}
      notice={notice}
      onPalette={rememberPalette}
      onClearNotice={clearNotice}
      onLogout={() => { localStorage.removeItem(TOKEN); setToken(null); setUser(null); setNotice(""); }}
      onCreate={() => setSeat({})}
      onJoin={(id) => setSeat({ roomId: id })}
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
        <SoundMix />
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

interface OpenRoom {
  roomId: string;
  clients: number;
  maxClients: number;
  host: string;
  names: string[];
  slots: number;
}

function HeroSprite({ view, shadow }: { view: string; shadow?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false;
    let timer = 0;
    void loadIdle(view).then((sheet) => {
      if (stop) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = 3;
      canvas.width = Math.max(1, Math.round(sheet.frameW * scale));
      canvas.height = Math.max(1, Math.round(sheet.frameH * scale));
      ctx.imageSmoothingEnabled = false;
      let frame = 0;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          sheet.image,
          (sheet.start + frame) * sheet.frameW,
          0,
          sheet.frameW,
          sheet.frameH,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        frame = (frame + 1) % Math.max(1, sheet.count);
      };
      draw();
      timer = window.setInterval(draw, 180);
    });
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [view]);
  return (
    <span className="hero-preview">
      {shadow ? <i className="hero-shadow" style={{ background: shadow }} /> : null}
      <canvas ref={ref} className="hero-sprite" />
    </span>
  );
}

function ShadowPick({ colors, value, onPick }: { colors: string[]; value: string; onPick: (color: string) => void }) {
  if (colors.length === 0) return null;
  return (
    <div>
      <p className="eyebrow">sombra</p>
      <div className="swatches">
        {colors.map((color) => (
          <button key={color} type="button" className={color === value ? "on" : ""} style={{ background: color }} aria-label={`Sombra ${color}`} onClick={() => onPick(color)} />
        ))}
      </div>
    </div>
  );
}

function Home({
  token,
  notice,
  onPalette,
  onClearNotice,
  onLogout,
  onCreate,
  onJoin,
}: {
  token: string;
  notice: string;
  onPalette: (colors: string[]) => void;
  onClearNotice: () => void;
  onLogout: () => void;
  onCreate: () => void;
  onJoin: (roomId: string) => void;
}) {
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () => {
      api<{ rooms: OpenRoom[]; shadowColors?: string[] }>("/api/rooms", {}, token).then((data) => {
        if (stop) return;
        setRooms(data.rooms);
        setError("");
        onClearNotice();
        onPalette((data.shadowColors ?? []).filter((color) => typeof color === "string"));
      }).catch((err: unknown) => {
        if (stop) return;
        setRooms((current) => current.length === 0 ? current : []);
        setError(err instanceof ServerDown ? SERVER_DOWN : "Não achei as salas.");
      });
    };
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [token, onClearNotice, onPalette]);

  return (
    <main className="screen">
      <section className="panel lobby">
        <header className="row">
          <div>
            <p className="eyebrow">entrada</p>
            <h1>Caos</h1>
          </div>
          <button className="btn ghost" onClick={onLogout}>Sair</button>
        </header>
        <p className="muted">Cria uma sala e espera o pessoal, ou entra numa que já está aberta.</p>
        <SoundMix />
        <button className="btn primary" onClick={onCreate}>Criar sala</button>
        {error || notice ? <p className="error">{error || notice}</p> : null}
        <div className="rooms">
          {rooms.length === 0 && !error && !notice ? <p className="muted">Nenhuma sala aberta.</p> : null}
          {rooms.map((room) => {
            const names = room.names;
            const slots = room.slots || room.maxClients;
            const full = room.clients >= slots;
            return (
              <article key={room.roomId} className="room">
                <div>
                  <strong>{room.host || "Sala"}</strong>
                  <small>{room.clients}/{slots} · {names.join(", ") || "vazia"}</small>
                </div>
                <button className="btn" disabled={full} onClick={() => onJoin(room.roomId)}>{full ? "Cheia" : "Entrar"}</button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function WaitRoom({
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
        <SoundMix />
      </section>
    </main>
  );
}

function SoundMix() {
  const [music, setMusic] = useState(() => Math.round(readMix().music * 100));
  const [sfx, setSfx] = useState(() => Math.round(readMix().sfx * 100));
  return (
    <div className="mix">
      <label>Música
        <input type="range" min={0} max={100} value={music} onChange={(event) => {
          const next = Number(event.target.value);
          setMusic(next);
          setMusicVolume(next / 100);
          unlockAudio();
        }} />
      </label>
      <label>Efeitos
        <small>Ataques, dano e interface. A música fica à parte.</small>
        <input type="range" min={0} max={100} value={sfx} onChange={(event) => {
          const next = Number(event.target.value);
          setSfx(next);
          setSfxVolume(next / 100);
          unlockAudio();
        }} />
      </label>
    </div>
  );
}

function moodOf(phase: string, fighting: boolean): Mood {
  if (phase === "duel" && fighting) return "duel";
  if (phase === "pve") return "wild";
  if (phase === "ended") return "end";
  return "calm";
}

function stillIn(player: { eliminated: boolean; lives: number }) {
  return !player.eliminated && player.lives > 0;
}

function cycleWatch(players: { id: string; eliminated: boolean; lives: number }[], youId: string, current: string | null) {
  const live = players.filter(stillIn);
  if (live.length === 0) return null;
  const id = current ?? youId;
  const index = live.findIndex((player) => player.id === id);
  const next = live[(index + 1) % live.length];
  if (!next || next.id === youId) return null;
  return next.id;
}

function nextWatch(snap: Snapshot, fromId: string) {
  const start = Math.max(0, snap.players.findIndex((player) => player.id === fromId));
  for (let step = 1; step <= snap.players.length; step += 1) {
    const player = snap.players[(start + step) % snap.players.length];
    if (!player || player.eliminated) continue;
    if (snap.entities.some((entity) => entity.playerId === player.id)) return player.id;
  }
  return fromId;
}

const PHASE: Record<string, string> = {
  hub: "Salão",
  pve: "Onda",
  betting: "Apostas",
  duel: "Duelo",
  shop: "Loja",
  ended: "Fim",
};

function Match({ token, roomId, onLeave, onDown }: { token: string; roomId: string; onLeave: () => void; onDown: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const hpRef = useRef<number | null>(null);
  const phaseRef = useRef<string | null>(null);
  const mePlace = useRef<{ x: number; y: number } | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const shakeRef = useRef(0);
  const netRef = useRef({ ping: -1, arrivals: [] as number[] });
  const pendingRef = useRef(0);
  const pauseRef = useRef(false);
  const menuRef = useRef(false);
  const askRef = useRef<null | "leave" | "giveup">(null);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState<null | "leave" | "giveup">(null);
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
      joined.onMessage("snapshot", (next: Snapshot) => {
        netRef.current.arrivals.push(performance.now());
        setSnap(next);
      });
      joined.onMessage("pong", (sent: number) => {
        if (typeof sent !== "number") return;
        netRef.current.ping = performance.now() - sent;
      });
      joined.onLeave((code) => {
        if (closed || code === CONSENTED) return;
        closed = true;
        onDown();
      });
    }).catch(() => {
      if (closed) return;
      closed = true;
      onDown();
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
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      closed = true;
      window.clearInterval(beat);
      window.removeEventListener("beforeunload", beforeUnload);
      resetHear();
      setMood("calm");
      void room?.leave();
    };
  }, [roomId, token, onDown]);

  useEffect(() => {
    const sendMove = (x: number, y: number) => {
      const aim = worldAim();
      roomRef.current?.send("input", aim ? { x, y, aimX: aim.x, aimY: aim.y } : { x, y });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape" && event.type === "keydown" && !event.repeat) {
        event.preventDefault();
        if (askRef.current) {
          askRef.current = null;
          setAsk(null);
          return;
        }
        const next = !menuRef.current;
        menuRef.current = next;
        askRef.current = null;
        setMenu(next);
        setAsk(null);
        if (next) {
          sendMove(0, 0);
          sfxUi();
        }
        return;
      }
      if (menuRef.current) {
        if (event.code === "Tab" || event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
        return;
      }
      if (event.code === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        if (event.type !== "keydown" || event.repeat || isTypingTarget(event.target)) return;
        const current = snapRef.current;
        if (!current) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setWatchId((watch) => cycleWatch(current.players, current.youId, watch));
        return;
      }
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
      const move = cameraMove();
      sendMove(move.x, move.y);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    const pulse = setInterval(() => {
      if (menuRef.current) sendMove(0, 0);
      else {
        const move = cameraMove();
        sendMove(move.x, move.y);
      }
    }, 50);
    const ping = setInterval(() => roomRef.current?.send("ping", performance.now()), 1000);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      clearInterval(pulse);
      clearInterval(ping);
    };
  }, []);

  useEffect(() => {
    if (!snap) return;
    const me = snap.players.find((player) => player.id === snap.youId);
    setMood(moodOf(snap.phase, me?.inDuel === true));
    if (!me) return;
    const body = snap.entities.find((entity) => entity.playerId === snap.youId);
    hearWorld(snap.fx, snap.projectiles, body ? { x: body.x, y: body.y } : null);
    if (pendingRef.current > 0 && me.pending.length === 0) sfxPick();
    pendingRef.current = me.pending.length;
    if (phaseRef.current !== null && pauseRef.current !== snap.paused && snap.paused) sfxUi();
    pauseRef.current = snap.paused;
    if (hpRef.current !== null && me.hp < hpRef.current) {
      sfxHurt();
      shakeRef.current = 1;
    }
    if (snap.floats.some((item) => item.crit && (item.sourcePlayerId === snap.youId || item.targetPlayerId === snap.youId))) sfxCrit();
    hpRef.current = me.hp;
    const mine = snap.entities.find((entity) => entity.playerId === snap.youId);
    const phaseChanged = phaseRef.current !== null && phaseRef.current !== snap.phase;
    const jumped = mine && mePlace.current
      ? Math.hypot(mine.x - mePlace.current.x, mine.y - mePlace.current.y) > 14
      : false;
    const cameBack = mine !== undefined && mePlace.current === null && phaseRef.current !== null;
    if (!me.eliminated && (phaseChanged || jumped || cameBack)) setWatchId(null);
    const followId = (!me.eliminated && (phaseChanged || jumped || cameBack) ? null : watchId) ?? snap.youId;
    const followAlive = snap.entities.some((entity) => entity.playerId === followId);
    if (me.lives <= 0) {
      if (!followAlive) {
        const next = nextWatch(snap, followId);
        if (next !== followId) setWatchId(next === snap.youId ? null : next);
      }
    } else if (watchId && watchId !== snap.youId && !followAlive) {
      setWatchId(null);
    }
    phaseRef.current = snap.phase;
    mePlace.current = mine ? { x: mine.x, y: mine.y } : null;
  }, [snap]);

  if (!snap) return <main className="screen"><p>Abrindo a arena...</p></main>;
  const me = snap.players.find((player) => player.id === snap.youId);
  const send = (type: string, payload?: unknown) => roomRef.current?.send(type, payload);
  const humans = snap.players.filter((player) => !player.isBot && !player.eliminated);
  const asking = humans.filter((player) => player.pauseWant);
  const closeMenu = () => {
    menuRef.current = false;
    askRef.current = null;
    setMenu(false);
    setAsk(null);
  };

  return (
    <main className="match" onPointerDown={unlockAudio}>
      <Scene snapRef={snapRef} watchId={watchId} shakeRef={shakeRef} />
      <NetStat netRef={netRef} />
      <header className="hud top">
        <div>
          <strong>{PHASE[snap.phase] ?? snap.phase} {snap.round}</strong>
          {me ? <span className="xp"><i style={{ width: `${Math.min(100, (me.xp / me.xpNext) * 100)}%` }} /></span> : null}
          {snap.paused ? <em className="flag">pausado</em> : null}
          {!snap.paused && asking.length > 0 ? <em className="flag">{asking.length}/{humans.length} pausa</em> : null}
        </div>
      </header>
      <aside className="hud side">
        <div className="board">
          {[...snap.players].sort((a, b) => Number(!stillIn(a)) - Number(!stillIn(b))).map((player) => {
            const mine = player.id === snap.youId;
            const followed = (watchId ?? snap.youId) === player.id;
            return (
            <button key={player.id} tabIndex={-1} className={[player.eliminated ? "out" : "", mine ? "me" : "", player.inDuel ? "duel" : "", followed ? "on" : ""].filter(Boolean).join(" ")} onClick={() => setWatchId(player.id === snap.youId ? null : player.id)}>
              <b style={{ color: player.color }}>{player.name}</b>
              <span className="life" title={`${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`}>
                <i style={{ width: `${Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100))}%` }} />
              </span>
              <small>{"♥".repeat(Math.max(0, player.lives))}{player.respawnIn > 0 && player.lives > 0 ? ` · ${Math.ceil(player.respawnIn)}s` : ""}{player.eliminated ? " fora" : ""}{player.inDuel ? " · duelo" : ""}{player.pauseWant ? " · pausa" : ""}{player.waveClear && snap.phase === "pve" ? " · limpo" : ""}{followed ? " · vendo" : ""}</small>
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
            );
          })}
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
          <div className="cards">
            {me.pending.map((card, index) => (
              <button key={card.id} tabIndex={-1} className={`card rarity-${card.rarity}`} onClick={() => send("pick", { cardId: card.id })}>
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
          <button className="btn primary" tabIndex={-1} onClick={() => send("shop", { kind: "ready" })}>{me.ready ? "Pronto" : "Seguir"}</button>
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
          <button className="btn primary" tabIndex={-1} onClick={onLeave}>Voltar ao lobby</button>
        </section>
      ) : null}
      {me && me.respawnIn > 0 && me.lives > 0 && !me.eliminated ? (
        <p className="respawn">Renasce em <strong>{Math.ceil(me.respawnIn)}s</strong></p>
      ) : null}
      {me?.eliminated && snap.phase !== "ended" ? <p className="spectate">Você caiu. Clica num nome pra assistir.</p> : (
        <p className="hint">W sobe na tela. Esc abre o menu. Tab olha o próximo. 1–6 escolhe carta. Espaço segue no salão.</p>
      )}
      {snap.paused && !menu ? <p className="paused-flag">Pausado</p> : null}
      {menu ? (
        <div className="menu-back">
          <section className="menu" role="dialog" aria-label="Menu">
            <p className="eyebrow">esc</p>
            <h2>Menu</h2>
            {ask === "giveup" ? (
              <>
                <p>Desistir elimina você agora.</p>
                <button className="btn danger" type="button" onClick={() => send("surrender")}>Confirmar desistência</button>
                <button className="btn ghost" type="button" onClick={() => { askRef.current = null; setAsk(null); }}>Voltar</button>
              </>
            ) : null}
            {ask === "leave" ? (
              <>
                <p>Se você não voltar em 8 segundos, a saída conta como desistência.</p>
                <button className="btn danger" type="button" onClick={onLeave}>Sair agora</button>
                <button className="btn ghost" type="button" onClick={() => { askRef.current = null; setAsk(null); }}>Voltar</button>
              </>
            ) : null}
            {ask == null ? (
              <>
                <button className="btn primary" type="button" onClick={closeMenu}>Continuar</button>
                <button className="btn" type="button" disabled={!me || me.eliminated || snap.phase === "ended"} onClick={() => send("pause", { want: !me?.pauseWant })}>
                  {me?.pauseWant ? (snap.paused ? "Retomar" : "Cancelar pedido") : "Pedir pausa"}
                </button>
                <p className="muted">A partida congela quando todo humano vivo pede. Bots não votam.</p>
                {asking.length > 0 ? <p className="muted">{asking.map((player) => player.name).join(", ")} {asking.length === 1 ? "pediu" : "pediram"} pausa.</p> : null}
                <SoundMix />
                <button className="btn danger" type="button" disabled={!me || me.eliminated || snap.phase === "ended"} onClick={() => { askRef.current = "giveup"; setAsk("giveup"); }}>Desistir</button>
                <button className="btn ghost" type="button" onClick={() => { askRef.current = "leave"; setAsk("leave"); }}>Sair da partida</button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
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

function NetStat({ netRef }: { netRef: { current: { ping: number; arrivals: number[] } } }) {
  const [text, setText] = useState("fps — · ping — · lat — · loss —");
  useEffect(() => {
    let frames = 0;
    let then = performance.now();
    let timer = 0;
    const loop = () => {
      frames += 1;
      timer = requestAnimationFrame(loop);
    };
    timer = requestAnimationFrame(loop);
    const report = window.setInterval(() => {
      const now = performance.now();
      const fps = Math.round(frames * 1000 / Math.max(1, now - then));
      frames = 0;
      then = now;
      const windowMs = 2000;
      const arrivals = netRef.current.arrivals.filter((at) => now - at <= windowMs);
      netRef.current.arrivals = arrivals;
      const expected = windowMs / 100;
      const loss = arrivals.length < 8 ? 0 : Math.max(0, Math.round((1 - arrivals.length / expected) * 100));
      const ping = netRef.current.ping;
      const pingText = ping < 0 ? "—" : `${Math.round(ping)}`;
      const latText = ping < 0 ? "—" : `${Math.round(ping / 2)}`;
      setText(`fps ${fps} · ping ${pingText} · lat ${latText} · loss ${loss}%`);
    }, 500);
    return () => {
      cancelAnimationFrame(timer);
      window.clearInterval(report);
    };
  }, [netRef]);
  return <p className="netstat">{text}</p>;
}

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

