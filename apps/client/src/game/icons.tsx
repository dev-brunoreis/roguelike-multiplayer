const GLYPHS: Record<string, string[]> = {
  golpe_rapido: [
    "..............",
    "......hh......",
    "......bb......",
    "......bb......",
    "......bb......",
    "......bb......",
    "....bbbbbb....",
    "......bb......",
    "......bb......",
    "......ss......",
    "......ss......",
    "......hs......",
    "..............",
    "..............",
  ],
  raio_encadeado: [
    "..............",
    ".......hh.....",
    "......bbb.....",
    ".....bbb......",
    "....bbbbb.....",
    ".......bb.....",
    "......bbb.....",
    ".....bbb......",
    "....bbb.......",
    "...bbb........",
    "...ss.........",
    "..............",
    "..............",
    "..............",
  ],
  explosao: [
    "..............",
    "......hh......",
    ".s....bb....s.",
    "..s...bb...s..",
    "......bb......",
    "hbbbbbbbbbbbbh",
    "......bb......",
    "..s...bb...s..",
    ".s....ss....s.",
    "..............",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
  flecha: [
    "..............",
    "..............",
    "..............",
    "..........h...",
    "..........b...",
    "hhhhbbbbbbbbh.",
    "..........b...",
    "..........s...",
    "..............",
    "..............",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
  sopro: [
    "..............",
    ".......h......",
    "......bbh.....",
    ".....bbbbh....",
    "....bbbbbbh...",
    "hhhhbbbbbbbb..",
    "....bbbbbbs...",
    ".....bbbbs....",
    "......bbs.....",
    ".......s......",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
  lamina: [
    "..............",
    "....hhhhhh....",
    "..hhbbbbbbhh..",
    ".hb........bh.",
    ".hb...bb...bh.",
    "hb....bb....bh",
    "hbbbbbbbbbbbbh",
    "hb....bb....bh",
    ".hb...bb...bh.",
    ".hb........bh.",
    "..ssbbbbbbss..",
    "....ssssss....",
    "..............",
    "..............",
  ],
  martelo: [
    "..............",
    "hhhhhhhhhhhh..",
    "bbbbbbbbbbbb..",
    "bbbbbbbbbbbb..",
    "bbssssssssbb..",
    "....bbbb......",
    "....bbbb......",
    "....bbbb......",
    "....bbbb......",
    "....ssss......",
    ".....hh.......",
    "..............",
    "..............",
    "..............",
  ],
  lanca: [
    ".............h",
    "............bb",
    "...........bb.",
    "..........bb..",
    ".........bb...",
    "........bb....",
    ".......bb.....",
    "......bb......",
    ".....ss.......",
    "....ss........",
    "...ss.........",
    "..............",
    "..............",
    "..............",
  ],
  gelo: [
    "..............",
    "......hh......",
    "......bb......",
    ".h....bb....h.",
    "..b..bbbb..b..",
    "...bbbbbbbb...",
    "hbbbbbbbbbbbbh",
    "...bbbbbbbb...",
    "..s..bbbb..s..",
    ".s....bb....s.",
    "......bb......",
    "......ss......",
    "..............",
    "..............",
  ],
  dardo: [
    "..............",
    "..............",
    ".............h",
    "............b.",
    "...........b..",
    "..........b...",
    ".........b....",
    "........b.....",
    ".......s......",
    "..............",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
};

const cache = new Map<string, string>();

function channel(hex: string, index: number) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  return Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
}

function mix(hex: string, toward: string, amount: number) {
  const parts = [0, 1, 2].map((index) => {
    const from = channel(hex, index);
    const to = channel(toward, index);
    return Math.round(from + (to - from) * amount);
  });
  return `rgb(${parts.join(",")})`;
}

function iconUrl(id: string, color: string) {
  const key = `${id}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, 16, 16);
  const ink: Record<string, string> = {
    b: color,
    h: mix(color, "#fff6d8", 0.62),
    s: mix(color, "#1a1612", 0.5),
  };
  const rows = GLYPHS[id] ?? ["......bbbb....", "......bbbb....", "......bbbb....", "......bbbb...."];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const pixel = ink[row[x] ?? ""];
      if (!pixel) continue;
      ctx.fillStyle = pixel;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  });
  ctx.fillStyle = "#3a3228";
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  ctx.fillRect(15, 0, 1, 16);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export function SkillGlyph({ id, color, title }: { id: string; color: string; title?: string }) {
  return <img className="skill-glyph" src={iconUrl(id, color)} alt={title ?? ""} title={title} />;
}
