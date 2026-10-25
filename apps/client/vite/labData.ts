import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

interface ZodParse {
  parse: (data: unknown) => unknown;
}

interface Validators {
  buildGameData: (raw: {
    match: unknown;
    heroes: unknown;
    abilities: unknown;
    cards: unknown;
    creeps: unknown;
    waves: unknown;
    bosses: unknown;
    synergies: unknown;
    dungeon: unknown;
  }) => unknown;
  vfx: ZodParse;
  actors: ZodParse;
  lab: ZodParse;
}

let validators: Validators | null = null;

async function loadValidators(server: ViteDevServer) {
  if (validators) return validators;
  const shared = await server.ssrLoadModule("@game/shared") as {
    vfxVisualSchema: ZodParse;
    actorsVisualSchema: ZodParse;
    labVisualSchema: ZodParse;
  };
  const game = await server.ssrLoadModule("@game/game-data/build") as { buildGameData: Validators["buildGameData"] };
  validators = {
    buildGameData: game.buildGameData,
    vfx: shared.vfxVisualSchema,
    actors: shared.actorsVisualSchema,
    lab: shared.labVisualSchema,
  };
  return validators;
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const dataRoot = resolve(repo, "packages/game-data/data");
const shotRoot = resolve(repo, ".lab/shots");

const CORE = [
  "match.json",
  "heroes.json",
  "abilities.json",
  "cards.json",
  "creeps.json",
  "waves.json",
  "bosses.json",
  "synergies.json",
  "dungeon.json",
];

const VISUAL = {
  "visual/vfx.json": "vfx",
  "visual/actors.json": "actors",
  "visual/lab.json": "lab",
} as const;

function inside(root: string, file: string) {
  const rel = relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !resolve(rel).startsWith("..");
}

function readBody(req: import("node:http").IncomingMessage) {
  return new Promise<string>((done, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: import("node:http").ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(body);
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function validate(rel: string, content: unknown, tools: Validators) {
  const visual = VISUAL[rel as keyof typeof VISUAL];
  if (visual) {
    tools[visual].parse(content);
    return;
  }
  if (!CORE.includes(rel)) throw new Error("Arquivo fora da lista");
  const raw = Object.fromEntries(CORE.map((file) => [file, readJson(join(dataRoot, file))]));
  raw[rel] = content;
  tools.buildGameData({
    match: raw["match.json"],
    heroes: raw["heroes.json"],
    abilities: raw["abilities.json"],
    cards: raw["cards.json"],
    creeps: raw["creeps.json"],
    waves: raw["waves.json"],
    bosses: raw["bosses.json"],
    synergies: raw["synergies.json"],
    dungeon: raw["dungeon.json"],
  });
}

export function labDataPlugin(): Plugin {
  return {
    name: "caos-lab-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/__lab/")) return next();
        try {
          const body = JSON.parse(await readBody(req)) as { file?: string; content?: unknown; name?: string; png?: string };
          const tools = await loadValidators(server);
          if (url === "/__lab/save") {
            const rel = (body.file ?? "").replaceAll("\\", "/");
            const dest = resolve(dataRoot, rel);
            if (!rel.endsWith(".json") || !inside(dataRoot, dest)) {
              send(res, 400, JSON.stringify({ error: "arquivo recusado" }));
              return;
            }
            validate(rel, body.content, tools);
            writeFileSync(dest, `${JSON.stringify(body.content, null, 2)}\n`);
            send(res, 200, JSON.stringify({ ok: true }));
            return;
          }
          if (url === "/__lab/shot") {
            const name = body.name ?? "";
            if (!/^[a-z0-9_-]+$/i.test(name)) {
              send(res, 400, JSON.stringify({ error: "nome recusado" }));
              return;
            }
            const png = body.png ?? "";
            const base = png.includes(",") ? png.slice(png.indexOf(",") + 1) : png;
            mkdirSync(shotRoot, { recursive: true });
            writeFileSync(join(shotRoot, `${name}.png`), Buffer.from(base, "base64"));
            send(res, 200, JSON.stringify({ ok: true, file: `.lab/shots/${name}.png` }));
            return;
          }
          send(res, 404, JSON.stringify({ error: "rota" }));
        } catch (err) {
          send(res, 400, JSON.stringify({ error: err instanceof Error ? err.message : "falhou" }));
        }
      });
    },
  };
}
