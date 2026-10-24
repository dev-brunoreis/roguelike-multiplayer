import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChatLine } from "@game/shared/protocol";
import { clearMove } from "../game/input.js";

export function mergeChat(current: ChatLine[], incoming: ChatLine | ChatLine[]) {
  const list = Array.isArray(incoming) ? incoming : [incoming];
  const seen = new Set(current.map((line) => line.id));
  const next = [...current];
  for (const line of list) {
    if (!line || typeof line.text !== "string" || typeof line.id !== "number" || seen.has(line.id)) continue;
    seen.add(line.id);
    next.push(line);
  }
  return next.slice(-40);
}

export function TextChat({
  lines,
  youId,
  onSend,
  inputRef,
}: {
  lines: ChatLine[];
  youId: string;
  onSend: (text: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);
  return (
    <form className="chat-box" onSubmit={(event) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      onSend(text);
      setDraft("");
    }}>
      <div className="chat-lines" ref={box}>
        {lines.length === 0 ? <p className="muted">Enter para falar.</p> : lines.map((line) => (
          <p key={line.id} className={line.playerId === youId ? "mine" : undefined}><b style={{ color: line.color }}>{line.name}</b> {line.text}</p>
        ))}
      </div>
      <input
        ref={inputRef}
        type="text"
        maxLength={160}
        placeholder="Mensagem"
        aria-label="Chat"
        value={draft}
        onFocus={clearMove}
        onChange={(event) => setDraft(event.target.value)}
      />
    </form>
  );
}
