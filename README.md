# Caos

Roguelike multiplayer para jogar no navegador com amigos. O servidor roda na sua máquina. Ninguém paga, ninguém guarda a partida: fechou, começa do zero na próxima.

Cada um luta na própria arena, sobe de nível, escolhe cartas e, a partir da segunda rodada, duela 1v1 enquanto o resto aposta ouro. O último com vida vence.

## Rodar

Precisa de Node 22+ e pnpm 10.

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:5173`. O servidor fica na porta `2567`.

Para os amigos entrarem na mesma máquina ou na rede, gera o cliente e sobe um processo só:

```bash
pnpm start
```

Aí o endereço é `http://IP-DA-MAQUINA:2567`. O log mostra os IPs locais.

Se o `pnpm` não estiver no PATH:

```bash
npm exec --yes --package pnpm@10.18.0 -- pnpm install
npm exec --package pnpm@10.18.0 -- pnpm dev
```

## Testes

```bash
pnpm test
pnpm lint
```

## Onde mexer

- Números, nomes e cartas: `packages/game-data/data`
- Regras da partida: `packages/sim`
- Conta, salas e banco: `apps/server`
- Tela e 3D: `apps/client`

Detalhes em `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md` e `docs/ADDING_CONTENT.md`.

O banco SQLite fica em `data/game.sqlite`. `GET /api/matches` devolve o histórico para balancear depois.

## Docker

```bash
docker compose up --build
```

A porta publicada é `2567`. O arquivo do banco fica em `./data`.
