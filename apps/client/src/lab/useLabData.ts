import { buildGameData, type GameData, type RawGameFiles } from "@game/game-data/build";
import {
  abilitySchema,
  actorsVisualSchema,
  bossSchema,
  cardSchema,
  creepSchema,
  dungeonSchema,
  heroSchema,
  labVisualSchema,
  matchConfigSchema,
  synergySchema,
  vfxDefSchema,
  vfxVisualSchema,
  waveSchema,
  type ActorsVisual,
  type LabVisual,
  type VfxVisual,
} from "@game/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diffJson, memory, readDisk, rememberSave, restoreChange, syncDisk, type FieldChange, type SaveRecord } from "./files.js";

const FILE_SCHEMA = {
  "heroes.json": heroSchema.array(),
  "abilities.json": abilitySchema.array(),
  "creeps.json": creepSchema.array(),
  "bosses.json": bossSchema.array(),
  "waves.json": waveSchema.array(),
  "cards.json": cardSchema.array(),
  "synergies.json": synergySchema.array(),
  "match.json": matchConfigSchema,
  "dungeon.json": dungeonSchema,
  "visual/vfx.json": vfxVisualSchema,
  "visual/actors.json": actorsVisualSchema,
  "visual/lab.json": labVisualSchema,
} as const;

function toRaw(files: Record<string, unknown>): RawGameFiles {
  return {
    match: files["match.json"],
    heroes: files["heroes.json"],
    abilities: files["abilities.json"],
    cards: files["cards.json"],
    creeps: files["creeps.json"],
    waves: files["waves.json"],
    bosses: files["bosses.json"],
    synergies: files["synergies.json"],
    dungeon: files["dungeon.json"],
  };
}

export interface FieldIssue {
  path: string;
  message: string;
}

function issuesOf(file: string, content: unknown): FieldIssue[] {
  const schema = FILE_SCHEMA[file as keyof typeof FILE_SCHEMA];
  if (!schema) return [];
  const parsed = schema.safeParse(content);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function useLabData() {
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((value) => value + 1), []);
  const disk = useMemo(() => readDisk(), [rev]);

  useEffect(() => {
    syncDisk(readDisk());
    bump();
  }, [bump]);

  const drafts = memory.drafts;
  const merged = drafts;

  const built = useMemo(() => {
    try {
      return { game: buildGameData(toRaw(merged)), error: "" };
    } catch (err) {
      return { game: null as GameData | null, error: err instanceof Error ? err.message : "JSON inválido" };
    }
  }, [merged, rev]);
  const lastGame = useRef<GameData | null>(null);
  if (built.game) lastGame.current = built.game;

  const visual = useMemo(() => {
    const vfx = vfxVisualSchema.safeParse(merged["visual/vfx.json"]);
    const actors = actorsVisualSchema.safeParse(merged["visual/actors.json"]);
    const lab = labVisualSchema.safeParse(merged["visual/lab.json"]);
    return {
      vfx: vfx.success ? vfx.data : null,
      actors: actors.success ? actors.data : null,
      lab: lab.success ? lab.data : null,
      vfxError: vfx.success ? "" : vfx.error.issues.map((issue) => issue.message).join("; "),
      actorsError: actors.success ? "" : actors.error.issues.map((issue) => issue.message).join("; "),
      labError: lab.success ? "" : lab.error.issues.map((issue) => issue.message).join("; "),
    };
  }, [merged, rev]);

  const update = useCallback((file: string, content: unknown) => {
    memory.drafts[file] = content;
    const clean = JSON.stringify(memory.disk[file]) === JSON.stringify(content);
    memory.dirty = memory.dirty.filter((item) => item !== file);
    if (!clean) memory.dirty.push(file);
    bump();
  }, [bump]);

  const revert = useCallback((file: string) => {
    if (memory.disk[file] !== undefined) memory.drafts[file] = structuredClone(memory.disk[file]);
    memory.dirty = memory.dirty.filter((item) => item !== file);
    memory.conflicts = memory.conflicts.filter((item) => item !== file);
    bump();
  }, [bump]);

  const markClean = useCallback((file: string) => {
    memory.dirty = memory.dirty.filter((item) => item !== file);
    memory.conflicts = memory.conflicts.filter((item) => item !== file);
    memory.disk[file] = structuredClone(memory.drafts[file]);
    bump();
  }, [bump]);

  const revertChange = useCallback((file: string, change: FieldChange) => {
    update(file, restoreChange(memory.drafts[file], change));
  }, [update]);

  const save = useCallback(async (files?: string[]) => {
    const list = files ?? [...memory.dirty];
    const errors: string[] = [];
    for (const file of list) {
      const changes = diffJson(memory.disk[file], memory.drafts[file]);
      const res = await fetch("/__lab/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, content: memory.drafts[file] }),
      });
      if (!res.ok) {
        errors.push(`${file}: ${await res.text()}`);
        continue;
      }
      rememberSave(file, changes);
      markClean(file);
    }
    return errors;
  }, [markClean]);

  const pending = useMemo(() => {
    return memory.dirty.flatMap((file) => diffJson(memory.disk[file], memory.drafts[file]).map((change) => ({ file, change })));
  }, [rev]);

  const fileIssues = useCallback((file: string) => issuesOf(file, memory.drafts[file]), [rev]);

  return {
    drafts,
    dirty: memory.dirty,
    conflicts: memory.conflicts,
    game: built.game ?? lastGame.current,
    error: built.error,
    visual,
    disk,
    update,
    revert,
    revertChange,
    save,
    pending,
    history: memory.history,
    fileIssues,
    entrySchema: FILE_SCHEMA,
    vfxEntry: vfxDefSchema,
  };
}

export type { ActorsVisual, FieldChange, LabVisual, SaveRecord, VfxVisual };
