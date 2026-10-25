export const modules = import.meta.glob("../../../../packages/game-data/data/**/*.json", {
  eager: true,
  import: "default",
});

const MARK = "packages/game-data/data/";

export function fileName(key: string) {
  const slash = key.replaceAll("\\", "/");
  const at = slash.indexOf(MARK);
  return at >= 0 ? slash.slice(at + MARK.length) : slash;
}

export function readDisk(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(modules)) out[fileName(key)] = value;
  return out;
}

export function setIn(root: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = root.slice();
    const index = typeof head === "number" ? head : Number(head);
    copy[index] = setIn(root[index], rest, value);
    return copy;
  }
  const record = root && typeof root === "object" ? { ...(root as Record<string, unknown>) } : {};
  const key = String(head);
  record[key] = setIn(record[key], rest, value);
  return record;
}

export function getIn(root: unknown, path: (string | number)[]): unknown {
  let cur = root;
  for (const part of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[String(part)];
  }
  return cur;
}

export function entryPath(sel: { kind: string; id?: string; file?: string }, fileData: unknown): (string | number)[] | null {
  if (sel.kind === "file") return [];
  if (sel.kind === "vfx") {
    const defs = (fileData as { defs?: { id: string }[] } | null)?.defs ?? [];
    const index = defs.findIndex((item) => item.id === sel.id);
    return index < 0 ? null : ["defs", index];
  }
  if (sel.kind === "hero" || sel.kind === "creep" || sel.kind === "boss" || sel.kind === "ability") {
    if (!Array.isArray(fileData)) return null;
    const index = fileData.findIndex((item) => item && typeof item === "object" && (item as { id?: string }).id === sel.id);
    return index < 0 ? null : [index];
  }
  return null;
}

interface Memory {
  drafts: Record<string, unknown>;
  dirty: string[];
  conflicts: string[];
  disk: Record<string, unknown>;
}

const holder = globalThis as { __labMemory?: Memory };
holder.__labMemory ??= { drafts: {}, dirty: [], conflicts: [], disk: {} };
export const memory = holder.__labMemory;

export function syncDisk(disk: Record<string, unknown>) {
  if (Object.keys(memory.drafts).length === 0) {
    memory.drafts = structuredClone(disk);
    memory.disk = structuredClone(disk);
    return;
  }
  for (const [file, value] of Object.entries(disk)) {
    const changed = JSON.stringify(memory.disk[file]) !== JSON.stringify(value);
    if (!changed) continue;
    if (memory.dirty.includes(file)) {
      if (!memory.conflicts.includes(file)) memory.conflicts.push(file);
    } else {
      memory.drafts[file] = structuredClone(value);
    }
  }
  memory.disk = structuredClone(disk);
}
