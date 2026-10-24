import { useEffect, useState } from "react";
import { api, ServerDown } from "../net.js";
import { SoundMix } from "./SoundMix.js";

interface OpenRoom {
  roomId: string;
  clients: number;
  maxClients: number;
  host: string;
  names: string[];
  slots: number;
}

const SERVER_DOWN = "O servidor caiu. Você foi desconectado.";

export function Home({
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
            const slots = room.slots || room.maxClients;
            const full = room.clients >= slots;
            return (
              <article key={room.roomId} className="room">
                <div>
                  <strong>{room.host || "Sala"}</strong>
                  <small>{room.clients}/{slots} · {room.names.join(", ") || "vazia"}</small>
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
