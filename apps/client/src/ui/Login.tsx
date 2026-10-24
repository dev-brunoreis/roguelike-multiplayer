import { useState, type FormEvent } from "react";
import { api } from "../net.js";
import { SoundMix } from "./SoundMix.js";

export interface User {
  id: string;
  username: string;
}

export function Login({ onAuth }: { onAuth: (token: string, user: User) => void }) {
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
