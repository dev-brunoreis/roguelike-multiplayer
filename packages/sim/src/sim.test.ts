import { loadGameData } from "@game/game-data";
import { describe, expect, it } from "vitest";
import { dealDamage } from "./damage.js";
import { jumpWave, revivePlayer, setBotsGodmode, setDuels, setGodmode, skipDuel } from "./debug.js";
import { buildSnapshot, createMatch, grantXp, pickCard, quietMatch, runTicks, setPauseWant, surrender, tick } from "./index.js";
import type { Match } from "./types.js";
import { arenaCenter } from "./world.js";

const data = loadGameData();

function stillCreep(match: Match, arenaId: string, x: number, y: number, hp = 1000) {
  const creepDef = data.creeps.find((creep) => creep.id === "slime")!;
  const id = match.nextId++;
  match.entities.push({
    id,
    kind: "creep",
    defId: "slime",
    arenaId,
    x,
    y,
    radius: creepDef.radius,
    hp,
    maxHp: hp,
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
}

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

  it("corpo a corpo avisa antes do golpe e erra se o alvo sair", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 2,
      data,
    });
    quietMatch(match);
    match.phaseTime = 90;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const creepId = match.nextId++;
    match.entities.push({
      id: creepId,
      kind: "creep",
      defId: "slime",
      arenaId: hero.arenaId,
      x: hero.x + 1.2,
      y: hero.y,
      radius: 0.32,
      hp: 500,
      maxHp: 500,
      speed: 0,
      damage: 10,
      attackCooldown: 1,
      attackTimer: 0.2,
      attackRange: 1.6,
      attackWindup: 0.2,
      winding: 0,
      armor: 0,
      xp: 0,
      gold: 0,
      color: "#e23d3d",
      team: "enemy",
      alive: true,
      invuln: 0,
      flash: 0,
      facing: 0,
      behavior: "chase",
    });
    const creep = match.entities.find((entity) => entity.id === creepId)!;
    const before = hero.hp;
    tick(match);
    expect(hero.hp).toBe(before);
    expect(creep.winding).toBeCloseTo(0.2);
    tick(match);
    expect(hero.hp).toBe(before);
    const strike = buildSnapshot(match, "p").entities.find((entity) => entity.id === creepId)?.strike ?? 0;
    expect(strike).toBeGreaterThan(0);
    expect(strike).toBeLessThan(1);
    runTicks(match, 5);
    expect(hero.hp).toBeLessThan(before);

    hero.hp = hero.maxHp;
    hero.x = creep.x - 1.2;
    hero.y = creep.y;
    creep.attackTimer = 0.2;
    creep.winding = 0;
    creep.swing = 0;
    tick(match);
    hero.x += 10;
    runTicks(match, 6);
    expect(hero.hp).toBe(hero.maxHp);
    expect(creep.swing).toBeGreaterThan(0);
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
    expect(nearest).toBeLessThan(creepDef.attackRange + 0.7);
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

  it("pular o duelo anunciado não tira vida e segue para a onda", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
      ],
      seed: 11,
      config: { duelStartRound: 1, duelAnnounceSeconds: 10 },
      data,
    });
    quietMatch(match);
    tick(match);
    const lives = match.players.map((player) => player.lives);
    expect(skipDuel(match)).toBe(true);
    expect(match.phase).toBe("hub");
    expect(match.duelPending).toBe(false);
    expect(match.players.map((player) => player.lives)).toEqual(lives);
    for (const player of match.players) player.ready = true;
    tick(match);
    expect(match.phase).toBe("pve");
    expect(skipDuel(match)).toBe(false);
  });

  it("pular o duelo em curso não escolhe vencedor", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
      ],
      seed: 11,
      config: { duelStartRound: 1, duelAnnounceSeconds: 0.05 },
      data,
    });
    quietMatch(match);
    tick(match);
    for (const player of match.players) player.ready = true;
    runTicks(match, 5);
    expect(match.phase).toBe("duel");
    const round = match.round;
    const lives = match.players.map((player) => player.lives);
    expect(skipDuel(match)).toBe(true);
    expect(match.phase).toBe("pve");
    expect(match.round).toBe(round + 1);
    expect(match.players.map((player) => player.lives)).toEqual(lives);
    expect(match.events.some((event) => event.type === "duel_result")).toBe(false);
  });

  it("desligar duelos tira o par anunciado e a próxima ida não marca outro", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: true, heroId: "mago" },
      ],
      seed: 11,
      config: { duelStartRound: 1, duelAnnounceSeconds: 10 },
      data,
    });
    quietMatch(match);
    tick(match);
    expect(match.duelPending).toBe(true);
    expect(setDuels(match, false)).toBe(false);
    expect(match.duel).toHaveLength(0);
    for (const player of match.players) player.ready = true;
    tick(match);
    expect(match.phase).toBe("pve");
    quietMatch(match);
    tick(match);
    expect(match.phase).toBe("hub");
    expect(match.duelPending).toBe(false);
    expect(setDuels(match)).toBe(true);
  });

  it("onda pedida começa na hora nessa rodada", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 3,
      data,
    });
    quietMatch(match);
    tick(match);
    expect(match.phase).toBe("hub");
    expect(jumpWave(match, 12)).toBe(12);
    expect(match.phase).toBe("pve");
    expect(match.round).toBe(12);
    expect(match.spawns.length).toBeGreaterThan(0);
    expect(match.spawns.every((job) => job.left > 0)).toBe(true);
    expect(jumpWave(match, 0)).toBeNull();
    expect(match.round).toBe(12);
  });

  it("bot imortal não perde vida", () => {
    const match = createMatch({
      players: [
        { id: "p", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "bot", name: "Bot", isBot: true, heroId: "mago" },
      ],
      seed: 4,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const bot = match.players.find((player) => player.isBot)!;
    const hero = match.entities.find((entity) => entity.kind === "hero" && entity.playerId === bot.id)!;
    const hp = hero.hp;
    const lives = bot.lives;
    expect(setBotsGodmode(match)).toBe(true);
    expect(dealDamage(match, { target: hero, amount: hero.hp + 40 })).toBe(0);
    expect(hero.hp).toBe(hp);
    expect(bot.lives).toBe(lives);
    expect(setBotsGodmode(match, false)).toBe(false);
    dealDamage(match, { target: hero, amount: 15 });
    expect(hero.hp).toBeLessThan(hp);
  });

  it("bot revivido herda a invulnerabilidade dos bots", () => {
    const match = createMatch({
      players: [
        { id: "p", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "bot", name: "Bot", isBot: true, heroId: "mago" },
        { id: "bot2", name: "Bot Dois", isBot: true, heroId: "arqueiro" },
      ],
      seed: 4,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const bot = match.players.find((player) => player.id === "bot")!;
    const hero = match.entities.find((entity) => entity.playerId === "bot")!;
    bot.eliminated = true;
    bot.lives = 0;
    hero.alive = false;
    expect(setBotsGodmode(match)).toBe(true);
    expect(bot.godmode).toBe(true);
    expect(revivePlayer(match, "p", "Bot")).toEqual({ status: "revived", name: "Bot" });
    expect(bot.godmode).toBe(true);
    hero.invuln = 0;
    expect(dealDamage(match, { target: hero, amount: hero.hp + 40 })).toBe(0);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it("godmode segura o dano e desliga de novo", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 8,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const hp = hero.hp;
    const lives = player.lives;
    expect(setGodmode(match, "p")).toBe(true);
    expect(dealDamage(match, { target: hero, amount: hero.hp + 50 })).toBe(0);
    expect(hero.hp).toBe(hp);
    expect(player.lives).toBe(lives);
    expect(buildSnapshot(match, "p").players[0]?.godmode).toBe(true);
    expect(setGodmode(match, "p", false)).toBe(false);
    dealDamage(match, { target: hero, amount: 20 });
    expect(hero.hp).toBeLessThan(hp);
    player.eliminated = true;
    hero.alive = false;
    expect(setGodmode(match, "p")).toBe(true);
    expect(revivePlayer(match, "p")).toEqual({ status: "revived", name: "Ana" });
    expect(player.godmode).toBe(true);
    hero.invuln = 0;
    expect(dealDamage(match, { target: hero, amount: hero.hp + 50 })).toBe(0);
    expect(hero.hp).toBe(hero.maxHp);
  });

  it("reviver pula a espera e devolve uma vida a quem foi eliminado", () => {
    const match = createMatch({
      players: [
        { id: "p", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
        { id: "c", name: "Caio", isBot: false, heroId: "arqueiro" },
      ],
      seed: 8,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.playerId === "p")!;
    const lives = player.lives;
    dealDamage(match, { target: hero, amount: hero.hp + 50 });
    expect(player.respawnIn).toBeGreaterThan(0);
    expect(revivePlayer(match, "p")).toEqual({ status: "revived", name: "Ana" });
    expect(player.respawnIn).toBe(0);
    expect(player.lives).toBe(lives - 1);
    expect(hero.alive).toBe(true);
    expect(hero.hp).toBe(hero.maxHp);
    expect(revivePlayer(match, "p")).toEqual({ status: "alive" });
    while (player.lives > 0) {
      hero.alive = true;
      hero.hp = hero.maxHp;
      hero.invuln = 0;
      player.respawnIn = 0;
      dealDamage(match, { target: hero, amount: hero.hp + 50 });
    }
    expect(player.eliminated).toBe(true);
    expect(match.phase).toBe("pve");
    expect(revivePlayer(match, "b", "Ana")).toEqual({ status: "revived", name: "Ana" });
    expect(player.eliminated).toBe(false);
    expect(player.lives).toBe(1);
    expect(hero.alive).toBe(true);
    expect(revivePlayer(match, "p", "ninguém")).toEqual({ status: "missing" });
  });

  it("reviver reabre a partida no salão depois do fim", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 8,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    while (player.lives > 0) {
      hero.alive = true;
      hero.hp = hero.maxHp;
      hero.invuln = 0;
      player.respawnIn = 0;
      dealDamage(match, { target: hero, amount: hero.hp + 50 });
    }
    tick(match);
    expect(player.eliminated).toBe(true);
    expect(revivePlayer(match, "p")?.status).toBe("revived");
    expect(match.phase).toBe("hub");
    expect(match.winnerId).toBeNull();
    expect(player.lives).toBe(1);
    expect(player.eliminated).toBe(false);
    expect(hero.alive).toBe(true);
  });

  it("morte na onda conta segundos até renascer enquanto sobra vida", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 8,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const lives = player.lives;
    dealDamage(match, { target: hero, amount: hero.hp + 50 });
    expect(player.lives).toBe(lives - 1);
    expect(player.lives).toBeGreaterThan(0);
    expect(player.respawnIn).toBe(match.config.respawnSeconds);
    const snap = buildSnapshot(match, "p");
    expect(snap.players[0]?.respawnIn).toBe(match.config.respawnSeconds);
    runTicks(match, 1);
    expect(snap.players[0] && buildSnapshot(match, "p").players[0]?.respawnIn).toBeLessThan(match.config.respawnSeconds);
  });

  it("só pausa quando todo humano vivo pede", () => {
    const match = createMatch({
      players: [
        { id: "a", name: "Ana", isBot: false, heroId: "guerreiro" },
        { id: "b", name: "Bia", isBot: false, heroId: "mago" },
        { id: "c", name: "Bot", isBot: true },
      ],
      seed: 4,
      data,
    });
    quietMatch(match);
    setPauseWant(match, "c", true);
    setPauseWant(match, "a", true);
    const moving = match.tick;
    tick(match);
    expect(match.paused).toBe(false);
    expect(match.tick).toBe(moving + 1);
    setPauseWant(match, "b", true);
    const frozen = match.tick;
    const frozenTime = match.time;
    tick(match);
    expect(match.paused).toBe(true);
    expect(match.tick).toBe(frozen);
    expect(match.time).toBe(frozenTime);
    setPauseWant(match, "a", false);
    tick(match);
    expect(match.paused).toBe(false);
    expect(match.tick).toBe(frozen + 1);
    const snap = buildSnapshot(match, "a");
    expect(snap.paused).toBe(false);
    expect(snap.players.find((player) => player.id === "b")?.pauseWant).toBe(true);
  });

  it("single acerta quem está na linha e ignora o mais perto fora dela", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 9,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    player.stats.critChance = 0;
    player.abilities[0]!.cooldown = 0;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const aside = stillCreep(match, arena.id, center.x + 0.5, center.y + 0.95);
    const lined = stillCreep(match, arena.id, center.x + 1.5, center.y);
    player.aimX = center.x + 10;
    player.aimY = center.y;
    tick(match);
    expect(match.entities.find((entity) => entity.id === aside)!.hp).toBe(1000);
    expect(match.entities.find((entity) => entity.id === lined)!.hp).toBeLessThan(1000);
    expect(player.abilities[0]!.cooldown).toBeGreaterThan(0);
  });

  it("aoe só acerta o raio do ponto da mira", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "piromante" }],
      seed: 9,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    player.stats.critChance = 0;
    player.abilities[0]!.cooldown = 0;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const near = stillCreep(match, arena.id, center.x - 3, center.y);
    const crowd = [
      stillCreep(match, arena.id, center.x + 4, center.y),
      stillCreep(match, arena.id, center.x + 4.4, center.y + 0.3),
      stillCreep(match, arena.id, center.x + 4.2, center.y - 0.35),
    ];
    player.aimX = center.x - 4.5;
    player.aimY = center.y;
    tick(match);
    expect(match.entities.find((entity) => entity.id === near)!.hp).toBeLessThan(1000);
    for (const id of crowd) expect(match.entities.find((entity) => entity.id === id)!.hp).toBe(1000);
    expect(player.abilities[0]!.cooldown).toBeGreaterThan(0);
    expect(match.fx.some((item) => item.kind === "ring")).toBe(true);
  });

  it("aoe no chão vazio não estoura nem gasta cooldown", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "piromante" }],
      seed: 9,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    player.abilities[0]!.cooldown = 0;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const far = stillCreep(match, arena.id, center.x + 4, center.y);
    player.aimX = center.x - 4;
    player.aimY = center.y;
    tick(match);
    expect(match.entities.find((entity) => entity.id === far)!.hp).toBe(1000);
    expect(player.abilities[0]!.cooldown).toBe(0);
    expect(match.fx.some((item) => item.kind === "ring")).toBe(false);
  });

  it("cone olha para a mira", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 9,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    player.stats.critChance = 0;
    player.abilities = [{ abilityId: "sopro", level: 1, cooldown: 0, cooldownMax: 1 }];
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const front = stillCreep(match, arena.id, center.x + 2, center.y);
    const back = stillCreep(match, arena.id, center.x - 2, center.y);
    player.aimX = center.x + 8;
    player.aimY = center.y;
    tick(match);
    expect(hero.facing).toBeCloseTo(0, 5);
    expect(match.entities.find((entity) => entity.id === front)!.hp).toBeLessThan(1000);
    expect(match.entities.find((entity) => entity.id === back)!.hp).toBe(1000);
  });

  it("bot parado grava a mira no alvo", () => {
    const match = createMatch({
      players: [{ id: "b", name: "Nox", isBot: true, heroId: "guerreiro" }],
      seed: 4,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const id = stillCreep(match, arena.id, center.x + 1.1, center.y);
    const creep = match.entities.find((entity) => entity.id === id)!;
    const x = creep.x;
    const y = creep.y;
    tick(match);
    expect(player.inputX).toBe(0);
    expect(player.inputY).toBe(0);
    expect(player.aimX).toBeCloseTo(x, 5);
    expect(player.aimY).toBeCloseTo(y, 5);
  });

  it("bicho grande usa a skill do json", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 5,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    match.phaseTime = 90;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === hero.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const before = hero.hp;

    const mascara = placeCreep(match, "mascara", hero.x + 4, hero.y);
    runTicks(match, 16);
    expect(hero.hp).toBeLessThan(before);
    expect(match.entities.find((entity) => entity.id === mascara)!.x).toBeLessThan(hero.x + 4);

    hero.hp = hero.maxHp;
    const burstBefore = hero.hp;
    placeCreep(match, "abobora", hero.x + 1.2, hero.y);
    runTicks(match, 16);
    expect(hero.hp).toBeLessThan(burstBefore);

    hero.hp = hero.maxHp;
    const boltBefore = hero.hp;
    placeCreep(match, "anjo", hero.x + 4, hero.y);
    tick(match);
    expect(hero.hp).toBeLessThan(boltBefore);
    expect(match.fx.some((item) => item.kind === "bolt")).toBe(true);

    const necromante = placeCreep(match, "necromante", hero.x - 6, hero.y);
    tick(match);
    const summoned = match.entities.find((entity) => entity.defId === "zumbi" && entity.summonedBy === necromante);
    expect(summoned?.alive).toBe(true);

    const ally = placeCreep(match, "zumbi", hero.x - 6, hero.y + 1.5);
    const wounded = match.entities.find((entity) => entity.id === ally)!;
    wounded.hp = 10;
    placeCreep(match, "medico", hero.x - 6, hero.y + 1.2);
    tick(match);
    expect(wounded.hp).toBeGreaterThan(10);
  });
});

describe("magias e chefes", () => {
  it("pisão atordoa e a imunidade segura o segundo stun", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 3,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    player.abilities = [{ abilityId: "pisao", level: 1, cooldown: 0, cooldownMax: 1 }];
    const creep = stillCreep(match, arena.id, center.x + 1, center.y, 500);
    tick(match);
    expect(match.statuses.get(creep)?.some((status) => status.kind === "stun")).toBe(true);
    player.abilities[0]!.cooldown = 99;
    const active = match.statuses.get(creep)![0]!;
    active.left = 0.01;
    tick(match);
    expect(match.statuses.get(creep)?.some((status) => status.kind === "stun")).toBeFalsy();
    expect(match.stunReady.get(creep) ?? 0).toBeGreaterThan(match.time);
    player.abilities[0]!.cooldown = 0;
    tick(match);
    expect(match.statuses.get(creep)?.some((status) => status.kind === "stun")).toBeFalsy();
  });

  it("chão em chamas fere de novo em outro tick", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 4,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const player = match.players[0]!;
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === player.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    player.aimX = center.x + 2;
    player.aimY = center.y;
    player.abilities = [{ abilityId: "chao_chamas", level: 1, cooldown: 0, cooldownMax: 1 }];
    const id = stillCreep(match, arena.id, center.x + 2, center.y, 500);
    tick(match);
    const creep = match.entities.find((entity) => entity.id === id)!;
    const once = creep.hp;
    expect(once).toBeLessThan(500);
    expect(match.zones.length).toBeGreaterThan(0);
    runTicks(match, 20);
    expect(creep.hp).toBeLessThan(once);
  });

  it("espiral do olho solta um anel de tiros e troca de fase", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 6,
      data,
    });
    quietMatch(match);
    match.phase = "pve";
    const hero = match.entities.find((entity) => entity.kind === "hero")!;
    const arena = match.arenas.find((item) => item.id === hero.arenaId)!;
    const center = arenaCenter(arena);
    hero.x = center.x;
    hero.y = center.y;
    const id = placeCreep(match, "boss_olho", center.x + 5, center.y);
    const boss = match.entities.find((entity) => entity.id === id)!;
    boss.kind = "boss";
    boss.speed = 2;
    tick(match);
    const shots = match.projectiles.filter((shot) => shot.abilityId === "olho_espiral");
    expect(shots.length).toBe(4);
    boss.hp = boss.maxHp * 0.4;
    const pace = boss.speed;
    tick(match);
    expect(match.skillState.get(id)?.phase).toBe(1);
    expect(boss.speed).toBeCloseTo(pace * 1.2, 5);
  });

  it("chefe da arena nasce só depois da onda limpa", () => {
    const match = createMatch({
      players: [{ id: "p", name: "Ana", isBot: false, heroId: "guerreiro" }],
      seed: 8,
      data,
    });
    quietMatch(match);
    jumpWave(match, 3);
    expect(match.entities.some((entity) => entity.kind === "boss")).toBe(false);
    match.spawns = [];
    match.entities = match.entities.filter((entity) => entity.kind === "hero");
    tick(match);
    const boss = match.entities.find((entity) => entity.kind === "boss");
    expect(boss?.alive).toBe(true);
    expect(match.players[0]?.waveClear).toBe(false);
    expect(match.banner?.kind).toBe("boss");
    boss!.alive = false;
    boss!.hp = 0;
    tick(match);
    expect(match.phase).toBe("hub");
  });
});

function placeCreep(match: Match, defId: string, x: number, y: number) {
  const def = data.creeps.find((creep) => creep.id === defId)!;
  const hero = match.entities.find((entity) => entity.kind === "hero")!;
  const id = match.nextId++;
  match.entities.push({
    id,
    kind: "creep",
    defId: def.id,
    arenaId: hero.arenaId,
    x,
    y,
    radius: def.radius,
    hp: def.hp,
    maxHp: def.hp,
    speed: 0,
    damage: def.damage,
    attackCooldown: def.attackCooldown,
    attackTimer: 99,
    attackRange: def.attackRange,
    attackWindup: def.attackWindup,
    winding: 0,
    armor: 0,
    xp: 0,
    gold: 0,
    color: def.color,
    team: "enemy",
    alive: true,
    invuln: 0,
    flash: 0,
    swing: 0,
    facing: 0,
    behavior: def.behavior,
  });
  return id;
}
