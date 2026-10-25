export type LabSel =
  | { kind: "hero"; id: string }
  | { kind: "creep"; id: string }
  | { kind: "boss"; id: string }
  | { kind: "ability"; id: string }
  | { kind: "vfx"; id: string }
  | { kind: "file"; file: string };

const KINDS = new Set(["hero", "creep", "boss", "ability", "vfx"]);

export function parseSel(raw: string | null): LabSel {
  if (!raw) return { kind: "ability", id: "golpe_rapido" };
  const cut = raw.indexOf(":");
  if (cut < 0) return { kind: "ability", id: "golpe_rapido" };
  const kind = raw.slice(0, cut);
  const id = raw.slice(cut + 1);
  if (kind === "file" && id) return { kind: "file", file: id };
  if (KINDS.has(kind) && id) return { kind: kind as "hero", id };
  return { kind: "ability", id: "golpe_rapido" };
}

export function formatSel(sel: LabSel) {
  if (sel.kind === "file") return `file:${sel.file}`;
  return `${sel.kind}:${sel.id}`;
}

export function selectionFile(sel: LabSel) {
  if (sel.kind === "file") return sel.file;
  if (sel.kind === "hero") return "heroes.json";
  if (sel.kind === "creep" || sel.kind === "boss") return "creeps.json";
  if (sel.kind === "ability") return "abilities.json";
  return "visual/vfx.json";
}

export function sameSel(a: LabSel, b: LabSel) {
  return formatSel(a) === formatSel(b);
}
