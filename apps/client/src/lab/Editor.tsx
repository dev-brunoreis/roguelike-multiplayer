import { useRef, useState } from "react";
import { entryPath, getIn, setIn } from "./files.js";
import type { FieldIssue } from "./useLabData.js";
import type { LabSel } from "./select.js";
import { selectionFile } from "./select.js";

const CHOICES: Record<string, string[]> = {
  targeting: ["nearest", "lowestHp", "random", "densest"],
  behavior: ["chase", "kite", "still"],
  kind: ["creep", "boss"],
  do: ["strike", "chain", "burst", "cone", "shoot", "pattern", "zone", "dash", "summon", "heal", "warn", "orbit"],
  follow: ["point", "caster", "trail"],
  at: ["caster", "aim"],
  shape: ["circle", "line", "ring", "cone"],
  source: ["pack", "drawn"],
  builtin: ["orb", "arrow", "spear", "dart"],
  type: ["stat", "grantAbility", "upgradeAbility", "onHit", "onKill"],
  stat: ["damagePct", "attackSpeedPct", "moveSpeedPct", "maxHpFlat", "armor", "critChance", "critMultiplier", "lifesteal", "areaPct", "xpPct", "cooldownPct"],
  status: ["stun", "slow", "root", "burn"],
  rarity: ["comum", "incomum", "raro", "epico", "lendario"],
};

const LIMITS: Record<string, { min: number; max: number; step: number }> = {
  x: { min: -16, max: 16, step: 0.1 },
  y: { min: -16, max: 16, step: 0.1 },
  zoom: { min: 8, max: 64, step: 1 },
  hp: { min: 1, max: 400, step: 1 },
  damage: { min: 0, max: 80, step: 1 },
  speed: { min: 0, max: 12, step: 0.05 },
  attackCooldown: { min: 0.05, max: 8, step: 0.05 },
  cooldown: { min: 0.05, max: 12, step: 0.05 },
  attackRange: { min: 0.2, max: 14, step: 0.05 },
  range: { min: 0.2, max: 16, step: 0.05 },
  attackWindup: { min: 0, max: 2, step: 0.01 },
  radius: { min: 0.05, max: 8, step: 0.05 },
  dropRadius: { min: 0.05, max: 6, step: 0.05 },
  armor: { min: 0, max: 40, step: 1 },
  xp: { min: 0, max: 40, step: 1 },
  gold: { min: 0, max: 40, step: 1 },
  projectileSpeed: { min: 1, max: 30, step: 0.5 },
  duration: { min: 0.05, max: 12, step: 0.05 },
  statusTime: { min: 0.05, max: 8, step: 0.05 },
  time: { min: 0, max: 8, step: 0.05 },
  previewSeconds: { min: 0.2, max: 8, step: 0.1 },
  every: { min: 0.05, max: 3, step: 0.01 },
  interval: { min: 0, max: 4, step: 0.05 },
  angle: { min: 5, max: 360, step: 1 },
  targets: { min: 1, max: 12, step: 1 },
  count: { min: 1, max: 16, step: 1 },
  pierce: { min: 0, max: 8, step: 1 },
  bursts: { min: 1, max: 8, step: 1 },
  drops: { min: 0, max: 8, step: 1 },
  frames: { min: 1, max: 24, step: 1 },
  fps: { min: 1, max: 24, step: 1 },
  idle: { min: 1, max: 24, step: 1 },
  run: { min: 1, max: 24, step: 1 },
  attack: { min: 1, max: 24, step: 1 },
  hit: { min: 1, max: 24, step: 1 },
  wide: { min: 0.1, max: 6, step: 0.05 },
  tall: { min: 0.1, max: 6, step: 0.05 },
  bodyMul: { min: 1, max: 12, step: 0.1 },
  shadowWide: { min: 0.05, max: 1.5, step: 0.01 },
  shadowTall: { min: 0.05, max: 1.5, step: 0.01 },
  attackSeconds: { min: 0.05, max: 1.5, step: 0.01 },
  hpBelow: { min: 0.05, max: 1, step: 0.01 },
  speedMul: { min: 0.25, max: 2.5, step: 0.05 },
  weight: { min: 0.1, max: 10, step: 0.1 },
  arenaSize: { min: 8, max: 40, step: 1 },
  value: { min: 0, max: 40, step: 0.01 },
};

function limitsFor(name: string) {
  return LIMITS[name] ?? { min: 0, max: 20, step: 0.05 };
}

function NumberField({
  name,
  value,
  issue,
  onChange,
}: {
  name: string;
  value: number;
  issue?: FieldIssue;
  onChange: (value: number) => void;
}) {
  const range = limitsFor(name);
  const cap = useRef({ min: Math.min(range.min, value), max: Math.max(range.max, value) });
  if (value < cap.current.min) cap.current.min = value;
  if (value > cap.current.max) cap.current.max = value;
  const min = cap.current.min;
  const max = cap.current.max;
  return (
    <label className={issue ? "bad" : ""}>
      {name}
      <span className="lab-num">
        <input
          type="range"
          min={min}
          max={max}
          step={range.step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input type="number" step={range.step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </span>
      {issue ? <small>{issue.message}</small> : null}
    </label>
  );
}

function Field({
  name,
  value,
  path,
  issues,
  lists,
  onChange,
}: {
  name: string;
  value: unknown;
  path: string;
  issues: FieldIssue[];
  lists: Record<string, string[]>;
  onChange: (value: unknown) => void;
}) {
  const issue = issues.find((item) => item.path === path || item.path.endsWith(`.${path}`));
  if (typeof value === "boolean") {
    return (
      <label className="lab-check">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        {name}
      </label>
    );
  }
  if (typeof value === "number") {
    return <NumberField name={name} value={value} issue={issue} onChange={(next) => onChange(next)} />;
  }
  if (typeof value === "string") {
    const found = CHOICES[name] ?? lists[name];
    const choices = found && found.length > 0 ? found : undefined;
    const color = name.toLowerCase().includes("color") || /^#[0-9a-fA-F]{3,8}$/.test(value);
    return (
      <label className={issue ? "bad" : ""}>
        {name}
        {choices ? (
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            {!choices.includes(value) ? <option value={value}>{value}</option> : null}
            {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
          </select>
        ) : (
          <span className="lab-num">
            <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
            {color ? <input type="color" value={toColor(value)} onChange={(event) => onChange(event.target.value)} /> : null}
          </span>
        )}
        {issue ? <small>{issue.message}</small> : null}
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <fieldset>
        <legend>{name}</legend>
        {value.map((item, index) => (
          <Field
            key={index}
            name={String(index)}
            value={item}
            path={path ? `${path}.${index}` : String(index)}
            issues={issues}
            lists={lists}
            onChange={(next) => {
              const copy = value.slice();
              copy[index] = next;
              onChange(copy);
            }}
          />
        ))}
      </fieldset>
    );
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      <fieldset>
        <legend>{name}</legend>
        {Object.entries(record).map(([key, item]) => (
          <Field
            key={key}
            name={key}
            value={item}
            path={path ? `${path}.${key}` : key}
            issues={issues}
            lists={lists}
            onChange={(next) => onChange({ ...record, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }
  return null;
}

function toColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
}

export function Editor({
  sel,
  files,
  issues,
  lists,
  dirty,
  onChange,
  onRevert,
}: {
  sel: LabSel;
  files: Record<string, unknown>;
  issues: FieldIssue[];
  lists: Record<string, string[]>;
  dirty: boolean;
  onChange: (file: string, content: unknown) => void;
  onRevert: (file: string) => void;
}) {
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState("");
  const file = selectionFile(sel);
  const data = files[file];
  const path = entryPath(sel, data);
  const entry = path ? getIn(data, path) : undefined;
  const actorFile = "visual/actors.json";
  const actorId = sel.kind === "hero" || sel.kind === "creep" || sel.kind === "boss" ? sel.id : "";
  const actors = files[actorFile] as { views?: Record<string, unknown> } | undefined;
  const actor = actorId ? actors?.views?.[actorId] ?? { source: "pack" } : null;

  const write = (next: unknown) => {
    if (!path) return;
    onChange(file, setIn(data, path, next));
  };

  return (
    <aside className="lab-editor">
      <header className="row">
        <strong>{dirty ? "• " : ""}{sel.kind === "file" ? sel.file : `${file}`}</strong>
        <button className="btn ghost" onClick={() => { setRaw((value) => !value); setRawText(JSON.stringify(entry, null, 2)); setRawError(""); }}>
          {raw ? "Campos" : "JSON"}
        </button>
      </header>
      {dirty ? <button className="btn ghost" onClick={() => onRevert(file)}>Desfazer arquivo</button> : null}
      {raw ? (
        <label>
          JSON
          <textarea
            className="lab-raw"
            value={rawText}
            onChange={(event) => {
              const text = event.target.value;
              setRawText(text);
              try {
                write(JSON.parse(text) as unknown);
                setRawError("");
              } catch (err) {
                setRawError(err instanceof Error ? err.message : "JSON inválido");
              }
            }}
          />
          {rawError ? <small>{rawError}</small> : null}
        </label>
      ) : entry && typeof entry === "object" ? (
        <Field name={sel.kind === "file" ? file : ("id" in sel ? sel.id : file)} value={entry} path="" issues={issues} lists={lists} onChange={write} />
      ) : (
        <p className="muted">Nada para editar nessa seleção.</p>
      )}
      {actor && actors ? (
        <Field
          name="visual"
          value={actor}
          path=""
          issues={[]}
          lists={lists}
          onChange={(next) => onChange(actorFile, setIn(actors, ["views", actorId], next))}
        />
      ) : null}
    </aside>
  );
}
