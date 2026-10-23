import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";
import { dbFile, findUserByName, insertUser, recentMatches } from "./db.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/register", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    res.status(400).json({ error: "Nome: 3 a 16 letras, números ou _." });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: "Senha com pelo menos 4 caracteres." });
    return;
  }
  if (findUserByName(username)) {
    res.status(409).json({ error: "Esse nome já existe." });
    return;
  }
  const user = { id: randomUUID(), username, passwordHash: await hashPassword(password), createdAt: Date.now() };
  insertUser(user);
  res.json({ token: signToken(user), user: { id: user.id, username } });
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const user = findUserByName(username);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Nome ou senha errados." });
    return;
  }
  res.json({ token: signToken(user), user: { id: user.id, username: user.username } });
});

app.get("/api/me", (req, res) => {
  const header = req.header("authorization") ?? "";
  const user = verifyToken(header.replace(/^Bearer\s+/i, ""));
  if (!user) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }
  res.json({ user });
});

app.get("/api/matches", (_req, res) => {
  res.json({ matches: recentMatches() });
});

const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/matchmake")) {
      next();
      return;
    }
    res.sendFile(join(clientDist, "index.html"));
  });
}

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("lobby", LobbyRoom);
gameServer.define("match", MatchRoom);

httpServer.listen(port, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item!.address);
  console.log(`Caos ouvindo na porta ${port}`);
  console.log(`Banco: ${dbFile}`);
  for (const ip of ips) console.log(`Amigos na rede: http://${ip}:${port}`);
});
