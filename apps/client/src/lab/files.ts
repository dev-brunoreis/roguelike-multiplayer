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

export interface FieldChange {
  path: (string | number)[];
  label: string;
  before: unknown;
  after: unknown;
  kind: "edit" | "add" | "remove";
  insert: boolean;
}

export interface SaveRecord {
  at: number;
  file: string;
  total: number;
  changes: FieldChange[];
}

interface Memory {
  drafts: Record<string, unknown>;
  dirty: string[];
  conflicts: string[];
  disk: Record<string, unknown>;
  history: SaveRecord[];
}

const HISTORY_KEY = "caos-lab-history";

function loadHistory(): SaveRecord[] {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) as SaveRecord[] : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.file === "string" && Array.isArray(item.changes))
      .slice(0, 30);
  } catch {
    return [];
  }
}

const holder = globalThis as { __labMemory?: Memory };
holder.__labMemory ??= { drafts: {}, dirty: [], conflicts: [], disk: {}, history: loadHistory() };
holder.__labMemory.history ??= loadHistory();
export const memory = holder.__labMemory;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function idOf(value: unknown) {
  if (!isRecord(value)) return "";
  return typeof value.id === "string" ? value.id : "";
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function joinLabel(prefix: string, part: string) {
  return prefix ? `${prefix}.${part}` : part;
}

function diffArray(before: unknown[], after: unknown[], path: (string | number)[], label: string): FieldChange[] {
  const keyed = before.length + after.length > 0 && before.every((item) => idOf(item)) && after.every((item) => idOf(item));
  if (!keyed) {
    const count = Math.max(before.length, after.length);
    const out: FieldChange[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = String(index);
      if (index >= before.length) {
        out.push({ path: [...path, index], label: joinLabel(label, part), before: undefined, after: after[index], kind: "add", insert: false });
        continue;
      }
      if (index >= after.length) {
        out.push({ path: [...path, index], label: joinLabel(label, part), before: before[index], after: undefined, kind: "remove", insert: true });
        continue;
      }
      out.push(...diffJson(before[index], after[index], [...path, index], joinLabel(label, part)));
    }
    return out;
  }
  const afterAt = new Map(after.map((item, index) => [idOf(item), index]));
  const seen = new Set<string>();
  const out: FieldChange[] = [];
  before.forEach((item, beforeIndex) => {
    const id = idOf(item);
    seen.add(id);
    const index = afterAt.get(id);
    if (index === undefined) {
      out.push({ path: [...path, beforeIndex], label: joinLabel(label, id), before: item, after: undefined, kind: "remove", insert: true });
      return;
    }
    out.push(...diffJson(item, after[index], [...path, index], joinLabel(label, id)));
  });
  after.forEach((item, index) => {
    const id = idOf(item);
    if (seen.has(id)) return;
    out.push({ path: [...path, index], label: joinLabel(label, id), before: undefined, after: item, kind: "add", insert: false });
  });
  return out;
}

export function diffJson(before: unknown, after: unknown, path: (string | number)[] = [], label = ""): FieldChange[] {
  if (sameJson(before, after)) return [];
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) => {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      const next = joinLabel(label, key);
      if (!hasBefore) return [{ path: [...path, key], label: next, before: undefined, after: after[key], kind: "add" as const, insert: false }];
      if (!hasAfter) return [{ path: [...path, key], label: next, before: before[key], after: undefined, kind: "remove" as const, insert: false }];
      return diffJson(before[key], after[key], [...path, key], next);
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) return diffArray(before, after, path, label);
  return [{ path, label: label || "(arquivo)", before, after, kind: "edit", insert: false }];
}

export function removeIn(root: unknown, path: (string | number)[]): unknown {
  if (path.length === 0) return root;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = root.slice();
    const index = Number(head);
    if (rest.length === 0) {
      copy.splice(index, 1);
      return copy;
    }
    copy[index] = removeIn(copy[index], rest);
    return copy;
  }
  const record = root && typeof root === "object" ? { ...(root as Record<string, unknown>) } : {};
  const key = String(head);
  if (rest.length === 0) {
    delete record[key];
    return record;
  }
  record[key] = removeIn(record[key], rest);
  return record;
}

export function insertIn(root: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return structuredClone(value);
  const [head, ...rest] = path;
  if (rest.length === 0 && Array.isArray(root)) {
    const copy = root.slice();
    const index = Math.min(Math.max(0, Number(head)), copy.length);
    copy.splice(index, 0, structuredClone(value));
    return copy;
  }
  if (Array.isArray(root)) {
    const copy = root.slice();
    const index = Number(head);
    copy[index] = insertIn(copy[index], rest, value);
    return copy;
  }
  const record = root && typeof root === "object" ? { ...(root as Record<string, unknown>) } : {};
  const key = String(head);
  record[key] = insertIn(record[key], rest, value);
  return record;
}

export function restoreChange(root: unknown, change: FieldChange): unknown {
  if (change.path.length === 0) return structuredClone(change.before);
  if (change.kind === "add") return removeIn(root, change.path);
  if (change.kind === "remove" && change.insert) return insertIn(root, change.path, change.before);
  return setIn(root, change.path, structuredClone(change.before));
}

export function rememberSave(file: string, changes: FieldChange[]) {
  if (changes.length === 0) return;
  memory.history = [{ at: Date.now(), file, total: changes.length, changes: changes.slice(0, 40) }, ...memory.history].slice(0, 30);
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(memory.history));
  } catch {
    /* a sessão segue sem persistir o histórico */
  }
}

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
