import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatLine } from "@game/shared/protocol";
import { unlockAudio, sfxUi } from "../../audio.js";
import { Scene } from "../../game/Scene.js";
import { cameraMove, clearMove, isTypingTarget, worldAim } from "../../game/input.js";
import { mergeChat, TextChat } from "../TextChat.js";
import { AbilityBar } from "./AbilityBar.js";
import { Banner } from "./Banner.js";
import { DungeonHud } from "./DungeonHud.js";
import { Board } from "./Board.js";
import { CardPick } from "./CardPick.js";
import { EndScreen } from "./EndScreen.js";
import { HubDock } from "./HubDock.js";
import { MatchLog, StatusHints, WaveWait } from "./MatchLog.js";
import { Menu } from "./Menu.js";
import { NetStat } from "./NetStat.js";
import { PhaseBar } from "./PhaseBar.js";
import { matchStore } from "./store.js";
import { useMatchRoom } from "./useMatchRoom.js";

function stillIn(player: { eliminated: boolean; lives: number }) {
  return !player.eliminated && player.lives > 0;
}

function cycleWatch(players: { id: string; eliminated: boolean; lives: number }[], youId: string, current: string | null) {
  const live = players.filter(stillIn);
  if (live.length === 0) return null;
  const id = current ?? youId;
  const index = live.findIndex((player) => player.id === id);
  const next = live[(index + 1) % live.length];
  if (!next || next.id === youId) return null;
  return next.id;
}

export function MatchScreen({ token, roomId, onLeave, onDown }: { token: string; roomId: string; onLeave: () => void; onDown: () => void }) {
  const { roomRef, snapRef, indexRef, netRef, shakeRef, ready, watchId, watchRef, setWatch, onChat } = useMatchRoom(token, roomId, onDown);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState<null | "leave" | "giveup">(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const menuRef = useRef(false);
  const askRef = useRef<null | "leave" | "giveup">(null);
  const chatRef = useRef<HTMLInputElement>(null);
  onChat.current = (incoming) => setChat((current) => mergeChat(current, incoming));

  useEffect(() => {
    const sendMove = (x: number, y: number) => {
      const aim = worldAim();
      roomRef.current?.send("input", aim ? { x, y, aimX: aim.x, aimY: aim.y } : { x, y });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape" && event.type === "keydown" && !event.repeat) {
        event.preventDefault();
        if (isTypingTarget(event.target)) {
          if (event.target instanceof HTMLElement) event.target.blur();
          clearMove();
          sendMove(0, 0);
          return;
        }
        if (askRef.current) {
          askRef.current = null;
          setAsk(null);
          return;
        }
        const next = !menuRef.current;
        menuRef.current = next;
        askRef.current = null;
        setMenu(next);
        setAsk(null);
        if (next) {
          sendMove(0, 0);
          sfxUi();
        }
        return;
      }
      if (menuRef.current) {
        if (event.code === "Tab" || event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
        return;
      }
      if (event.code === "Enter" && event.type === "keydown" && !event.repeat && !isTypingTarget(event.target)) {
        event.preventDefault();
        clearMove();
        sendMove(0, 0);
        chatRef.current?.focus();
        return;
      }
      if (event.code === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        if (event.type !== "keydown" || event.repeat || isTypingTarget(event.target)) return;
        const current = snapRef.current;
        if (!current) return;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setWatch(cycleWatch(current.players, current.youId, watchRef.current));
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
      const snap = snapRef.current;
      const you = snap?.players.find((player) => player.id === snap.youId);
      if (event.code === "Space" && event.type === "keydown") {
        if (snap?.phase === "hub" && you && !you.eliminated && you.pending.length === 0 && !you.ready) {
          roomRef.current?.send("shop", { kind: "ready" });
        }
        return;
      }
      const digit = event.code.startsWith("Digit") ? Number(event.code.slice(5)) : 0;
      if (you && digit >= 1 && digit <= 6 && you.pending[digit - 1]) {
        roomRef.current?.send("pick", { cardId: you.pending[digit - 1]!.id });
      }
      const move = cameraMove();
      sendMove(move.x, move.y);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    const pulse = setInterval(() => {
      if (menuRef.current || isTypingTarget(document.activeElement)) sendMove(0, 0);
      else {
        const move = cameraMove();
        sendMove(move.x, move.y);
      }
    }, 50);
    const ping = setInterval(() => roomRef.current?.send("ping", performance.now()), 1000);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      clearInterval(pulse);
      clearInterval(ping);
    };
  }, [roomRef, snapRef, setWatch, watchRef]);

  const send = useCallback((type: string, payload?: unknown) => roomRef.current?.send(type, payload), [roomRef]);
  const pickCard = useCallback((cardId: string) => send("pick", { cardId }), [send]);
  const readyUp = useCallback(() => send("shop", { kind: "ready" }), [send]);
  const closeMenu = () => {
    menuRef.current = false;
    askRef.current = null;
    setMenu(false);
    setAsk(null);
  };
  if (!ready) return <main className="screen"><p>Abrindo a arena...</p></main>;
  return (
    <main className="match" onPointerDown={unlockAudio}>
      <Scene snapRef={snapRef} indexRef={indexRef} watchId={watchId} shakeRef={shakeRef} />
      <NetStat netRef={netRef} />
      <PhaseBar />
      <DungeonHud />
      <Board watchId={watchId} onWatch={setWatch} />
      <AbilityBar />
      <MatchLog />
      <TextChat inputRef={chatRef} lines={chat} youId={matchStore.youId} onSend={(text) => send("chat", { text })} />
      <CardPick onPick={pickCard} />
      <Banner />
      <HubDock onReady={readyUp} />
      <WaveWait />
      <EndScreen onLeave={onLeave} />
      <StatusHints menuOpen={menu} />
      <Menu
        open={menu}
        ask={ask}
        onClose={closeMenu}
        onAsk={(next) => { askRef.current = next; setAsk(next); }}
        onLeave={onLeave}
        onSend={send}
      />
    </main>
  );
}
