import { describe, expect, it } from "vitest";
import { chatText, RoomChat } from "./chat.js";

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
});
