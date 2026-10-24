import { describe, expect, it } from "vitest";
import { chatCommand, chatText, RoomChat } from "./chat.js";

describe("chat", () => {
  it("corta texto vazio e caractere de controle", () => {
    expect(chatText("   ")).toBeNull();
    expect(chatText({ text: "oi\u0000 time" })).toBe("oi time");
    expect(chatText("x".repeat(200))?.length).toBe(160);
  });

  it("guarda o histórico e ignora rajada", () => {
    const chat = new RoomChat();
    expect(chat.push("a", "Ana", "#fff", { text: "primeiro" }, 1000)?.text).toBe("primeiro");
    expect(chat.push("a", "Ana", "#fff", { text: "cedo" }, 1100)).toBeNull();
    expect(chat.push("a", "Ana", "#fff", { text: "depois" }, 1400)?.text).toBe("depois");
    expect(chat.lines().map((line) => line.text)).toEqual(["primeiro", "depois"]);
  });

  it("reconhece godmode com e sem barra", () => {
    expect(chatCommand("/godmode")).toEqual({ name: "godmode" });
    expect(chatCommand("godmode")).toEqual({ name: "godmode" });
    expect(chatCommand("/Godmode ligar")).toEqual({ name: "godmode", on: true });
    expect(chatCommand("godmode off")).toEqual({ name: "godmode", on: false });
    expect(chatCommand("godmode agora")).toBeNull();
    expect(chatCommand("/skipduelo")).toEqual({ name: "skipduel" });
    expect(chatCommand("pular duelo")).toEqual({ name: "skipduel" });
    expect(chatCommand("/duelos")).toEqual({ name: "duels" });
    expect(chatCommand("duelos desligar")).toEqual({ name: "duels", on: false });
    expect(chatCommand("/onda 12")).toEqual({ name: "wave", round: 12 });
    expect(chatCommand("onda")).toBeNull();
    expect(chatCommand("/bots ligar")).toEqual({ name: "bots", on: true });
    expect(chatCommand("oi")).toBeNull();
  });
});
