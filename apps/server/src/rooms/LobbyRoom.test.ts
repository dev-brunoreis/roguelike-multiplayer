import { describe, expect, it } from "vitest";
import { forgetSession } from "./LobbyRoom.js";

describe("assento do lobby", () => {
  it("mantém o personagem quando outra sessão da mesma conta ainda está na sala", () => {
    const ana = { id: "ana", name: "Ana" };
    const bia = { id: "bia", name: "Bia" };
    const sessions = new Map<string, { id: string; name: string }>([
      ["sess-host", ana],
      ["sess-extra", ana],
      ["sess-bia", bia],
    ]);
    const seats = [ana, bia];

    const next = forgetSession(sessions, seats, "sess-extra");

    expect(next.map((seat) => seat.id)).toEqual(["ana", "bia"]);
    expect(sessions.has("sess-extra")).toBe(false);
    expect(sessions.has("sess-host")).toBe(true);
  });

  it("tira o personagem quando a última sessão da conta sai", () => {
    const ana = { id: "ana", name: "Ana" };
    const bia = { id: "bia", name: "Bia" };
    const sessions = new Map<string, { id: string; name: string }>([
      ["sess-host", ana],
      ["sess-bia", bia],
    ]);

    const next = forgetSession(sessions, [ana, bia], "sess-bia");

    expect(next.map((seat) => seat.id)).toEqual(["ana"]);
    expect(sessions.has("sess-bia")).toBe(false);
  });
});
