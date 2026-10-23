import { loadGameData } from "@game/game-data";
import { describe, expect, it } from "vitest";
import { createMatch, grantXp, pickCard, quietMatch, runTicks, surrender, tick } from "./index.js";
import { arenaCenter } from "./world.js";

const data = loadGameData();

describe("game data", () => {
  it("carrega e valida os json", () => {
    expect(data.heroes.length).toBeGreaterThan(0);
    expect(data.match.cardsPerLevelUp).toBe(5);
    expect(data.version).toBe(data.match.version);
  });
});

describe("simulação", () => {
  it("raio encadeado aplica falloff no segundo alvo", () => {
    const match = createMatch({
      players: [{ id: "mago", name: "Mago", isBot: false, heroId: "mago" }],
      seed: 3,
      data,
    });
    quietMatch(match);
    const player = match.players[0]!;
    const ability = data.abilities.find((item) => item.id === "raio_encadeado")!;
    const level = ability.levels[1]!;
    player.abilities[0]!.level = 2;
    player.abilities[0]!.cooldown = 0;
    player.stats.critChance = 0;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas[0]!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const creepDef = data.creeps.find((creep) => creep.id === "slime")!;
    const make = (x: number, y: number) => {
      const id = match.nextId++;
      match.entities.push({
        id,
        kind: "creep",
        defId: "slime",
        arenaId: arena.id,
        x,
        y,
        radius: creepDef.radius,
        hp: 1000,
        maxHp: 1000,
        speed: 0,
        damage: 0,
        attackCooldown: 10,
        attackTimer: 10,
        attackRange: 0.2,
        armor: 0,
        xp: 0,
        gold: 0,
        color: "#f00",
        team: "enemy",
        alive: true,
        invuln: 0,
        flash: 0,
        facing: 0,
        behavior: "chase",
      });
      return id;
    };
    const first = make(center.x + 1.4, center.y);
    const second = make(center.x + 1.4, center.y + 1.1);
    tick(match);
    const a = match.entities.find((entity) => entity.id === first)!;
    const b = match.entities.find((entity) => entity.id === second)!;
    expect(a.hp).toBeCloseTo(1000 - level.damage * level.falloff![0]!, 5);
    expect(b.hp).toBeCloseTo(1000 - level.damage * level.falloff![1]!, 5);
  });

  it("oferece a quantidade configurada de cartas ao subir de nível", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 2,
      config: { cardsPerLevelUp: 5 },
      data,
    });
    quietMatch(match);
    const player = match.players[0]!;
    grantXp(match, player, match.config.xpBase);
    expect(player.level).toBe(2);
    expect(player.pendingCards).toHaveLength(5);
    expect(new Set(player.pendingCards).size).toBe(5);
  });

  it("continua andando enquanto escolhe carta", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 2,
      data,
    });
    quietMatch(match);
    const player = match.players[0]!;
    match.spawns.push({ arenaId: player.arenaId, creepId: "slime", left: 4, interval: 9, acc: 0 });
    grantXp(match, player, match.config.xpBase);
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const before = hero.x;
    player.inputX = 1;
    tick(match);
    expect(hero.x).toBeGreaterThan(before);
    expect(player.pendingCards.length).toBeGreaterThan(0);
  });

  it("armadura reduz o dano do creep", () => {
    const hit = (armor: number) => {
      const match = createMatch({
        players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
        seed: 1,
        data,
      });
      quietMatch(match);
      const player = match.players[0]!;
      player.stats.armor = armor;
      const hero = match.entities.find((entity) => entity.kind === "hero")!;
      hero.hp = hero.maxHp;
      match.entities.push({
        id: match.nextId++,
        kind: "creep",
        defId: "slime",
        arenaId: hero.arenaId,
        x: hero.x + 0.2,
        y: hero.y,
        radius: 0.3,
        hp: 500,
        maxHp: 500,
        speed: 0,
        damage: 10,
        attackCooldown: 0.01,
        attackTimer: 0,
        attackRange: 2,
        armor: 0,
        xp: 0,
        gold: 0,
        color: "#f00",
        team: "enemy",
        alive: true,
        invuln: 0,
        flash: 0,
        facing: 0,
        behavior: "chase",
      });
      const before = hero.hp;
      tick(match);
      return before - hero.hp;
    };
    const open = hit(0);
    const tank = hit(50);
    expect(open).toBeGreaterThan(tank);
    expect(tank).toBeCloseTo(open * 0.5, 5);
  });

  it("carta de dano aumenta o golpe", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 4,
      data,
    });
    quietMatch(match);
    const player = match.players[0]!;
    player.pendingCards = ["furia"];
    pickCard(match, "p", "furia");
    expect(player.stats.damagePct).toBeCloseTo(0.15);
    expect(player.cards).toContain("furia");
  });

  it("desistir deixa o outro como vencedor", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false },
        { id: "b", name: "Bia", isBot: false },
      ],
      seed: 5,
      data,
    });
    surrender(match, "b");
    expect(match.phase).toBe("ended");
    expect(match.winnerId).toBe("a");
    expect(match.players.find((player) => player.id === "b")?.eliminated).toBe(true);
  });

  it("bots atravessam fases sem quebrar", () => {
    const match = createMatch({
      players: [
        { id: "b1", name: "Bram", isBot: true },
        { id: "b2", name: "Lira", isBot: true },
        { id: "b3", name: "Kas", isBot: true },
        { id: "b4", name: "Nox", isBot: true },
      ],
      seed: 9,
      config: {
        pveSeconds: 1,
        bettingSeconds: 0.2,
        duelSeconds: 0.4,
        shopSeconds: 0.25,
        cardPickSeconds: 0.2,
        lives: 5,
      },
      data,
    });
    const events = runTicks(match, 500);
    expect(events.length + match.tick).toBeGreaterThan(0);
    expect(match.round).toBeGreaterThan(1);
    expect(["pve", "betting", "duel", "shop", "ended"]).toContain(match.phase);
  });
});
