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
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
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
    expect(match.fx.some((item) => item.kind === "bolt")).toBe(true);
    const a = match.entities.find((entity) => entity.id === first)!;
    const b = match.entities.find((entity) => entity.id === second)!;
    expect(a.hp).toBeCloseTo(1000 - level.damage * level.falloff![0]!, 5);
    expect(b.hp).toBeCloseTo(1000 - level.damage * level.falloff![1]!, 5);
    expect(match.floats.filter((item) => item.sourcePlayerId === "mago" && !item.targetPlayerId).length).toBe(2);
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
    expect(player.unspentPicks).toBe(1);
    expect(player.pendingCards).toHaveLength(0);
    tick(match);
    expect(match.phase).toBe("hub");
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
    grantXp(match, player, match.config.xpBase);
    tick(match);
    expect(match.phase).toBe("hub");
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const before = hero.x;
    player.inputX = 1;
    tick(match);
    expect(hero.x).toBeGreaterThan(before);
    expect(player.pendingCards.length).toBeGreaterThan(0);
  });

  it("espera o último limpar antes de ir ao salão", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
      ],
      seed: 6,
      data,
    });
    quietMatch(match);
    const ana = match.players[0]!;
    const bia = match.players[1]!;
    const creepDef = data.creeps.find((creep) => creep.id === "slime")!;
    match.entities.push({
      id: match.nextId++,
      kind: "creep",
      defId: "slime",
      arenaId: bia.arenaId,
      x: 0,
      y: 0,
      radius: creepDef.radius,
      hp: 40,
      maxHp: 40,
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
    tick(match);
    expect(match.phase).toBe("pve");
    expect(ana.waveClear).toBe(true);
    expect(bia.waveClear).toBe(false);
    const leftover = match.entities.find((entity) => entity.kind === "creep")!;
    leftover.alive = false;
    leftover.hp = 0;
    tick(match);
    expect(match.phase).toBe("hub");
    expect(match.entities.every((entity) => entity.arenaId === "hub" || entity.kind !== "hero")).toBe(true);
  });

  it("no salão os heróis não se batem", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
      ],
      seed: 7,
      data,
    });
    quietMatch(match);
    tick(match);
    expect(match.phase).toBe("hub");
    const ana = match.entities.find((entity) => entity.playerId === "a")!;
    const bia = match.entities.find((entity) => entity.playerId === "b")!;
    ana.x = bia.x;
    ana.y = bia.y;
    const before = bia.hp;
    tick(match);
    expect(bia.hp).toBe(before);
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
    expect(match.banner?.kind).toBe("surrender");
    expect(match.banner?.title).toContain("Bia");
  });

  it("bot de perto entra no golpe em vez de orbitar", () => {
    const match = createMatch({
      players: [{ id: "b", name: "Nox", isBot: true, heroId: "guerreiro" }],
      seed: 4,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    for (const slot of player.abilities) slot.cooldown = 0;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const creepDef = data.creeps.find((creep) => creep.id === "slime")!;
    const spawn = (x: number, y: number) => {
      match.entities.push({
        id: match.nextId++,
        kind: "creep",
        defId: "slime",
        arenaId: arena.id,
        x,
        y,
        radius: creepDef.radius,
        hp: 500,
        maxHp: 500,
        speed: creepDef.speed,
        damage: creepDef.damage,
        attackCooldown: creepDef.attackCooldown,
        attackTimer: creepDef.attackCooldown,
        attackRange: creepDef.attackRange,
        armor: 0,
        xp: 0,
        gold: 0,
        color: creepDef.color,
        team: "enemy",
        alive: true,
        invuln: 0,
        flash: 0,
        facing: 0,
        behavior: "chase",
      });
    };
    spawn(center.x + 3.2, center.y);
    spawn(center.x + 3.5, center.y + 0.7);
    runTicks(match, 70);
    const creeps = match.entities.filter((entity) => entity.defId === "slime" && entity.alive);
    const nearest = Math.min(...creeps.map((creep) => Math.hypot(creep.x - hero.x, creep.y - hero.y)));
    const hurt = creeps.reduce((sum, creep) => sum + (500 - creep.hp), 0);
    expect(nearest).toBeLessThan(1.9 + creepDef.radius);
    expect(hurt).toBeGreaterThan(20);
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
        hubSeconds: 0.25,
        duelAnnounceSeconds: 0.05,
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
    expect(["hub", "pve", "betting", "duel", "shop", "ended"]).toContain(match.phase);
  });

  it("só marca um duelo e anuncia antes de começar", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
        { id: "c", name: "Caio", isBot: false, heroId: "arqueiro" },
        { id: "d", name: "Dora", isBot: false, heroId: "piromante" },
      ],
      seed: 11,
      config: { duelStartRound: 1, duelAnnounceSeconds: 10 },
      data,
    });
    quietMatch(match);
    tick(match);
    expect(match.phase).toBe("hub");
    expect(match.duel).toHaveLength(1);
    expect(match.duelPending).toBe(true);
    expect(match.duelAnnounce).toBe(0);
    for (const player of match.players) player.ready = true;
    tick(match);
    expect(match.phase).toBe("hub");
    expect(match.duelAnnounce).toBeGreaterThan(9);
    expect(match.banner?.kind).toBe("duel");
    expect(match.banner?.title).toMatch(/ vs /);
  });
});
