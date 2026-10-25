import { useCallback, useEffect, useState, type ComponentType } from "react";
import { api, ServerDown } from "../net.js";
import { unlockAudio } from "../audio.js";
import { Home } from "./Home.js";
import { Login, type User } from "./Login.js";
import { MatchScreen } from "./match/MatchScreen.js";
import { WaitRoom } from "./WaitRoom.js";

const TOKEN = "caos.token";
const SHADOW_KEY = "caos.shadow";
const SERVER_DOWN = "O servidor caiu. Você foi desconectado.";

function LabGate() {
  const [Screen, setScreen] = useState<ComponentType | null>(null);
  useEffect(() => {
    let live = true;
    void import("../lab/LabScreen.js").then((mod) => {
      if (live) setScreen(() => mod.LabScreen);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!Screen) return <main className="screen"><p>Abrindo o lab...</p></main>;
  return <Screen />;
}

export function App() {
  if (import.meta.env.DEV && window.location.pathname === "/lab") return <LabGate />;
  return <GameApp />;
}

function GameApp() {
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
  if (roomId) return <MatchScreen token={token} roomId={roomId} onLeave={leaveMatch} onDown={loseServer} />;
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
