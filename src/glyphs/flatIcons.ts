/**
 * The flat (2D) glyph set of the "architecture board" style: one icon per component type, drawn in a
 * 48x48 box centred on (x, y). Used only by the 2D view mode; the 3D view uses models.ts instead.
 */
import type { IconKey } from "../model/types";

type IconFn = (x: number, y: number) => string;

const st = (f: string, s: string, w?: number) => `fill="${f}" stroke="${s}" stroke-width="${w || 1.6}"`;

function cyl(x: number, y: number, w: number, h: number, f: string, s: string): string {
  const ry = w * 0.22;
  return (
    `<path d="M${x} ${y + ry} v${h - 2 * ry} a${w / 2} ${ry} 0 0 0 ${w} 0 v${-(h - 2 * ry)}" ${st(f, s)}/>` +
    `<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" ${st(f, s)}/>` +
    `<path d="M${x} ${y + h * 0.5} a${w / 2} ${ry} 0 0 0 ${w} 0" fill="none" stroke="${s}" stroke-width="1.2" opacity=".55"/>`
  );
}

function stack3(cx: number, cy: number, w: number, h: number, f: string[], s: string, dx: number, dy: number): string {
  let o = "";
  ([[-dx, -dy], [0, 0], [dx, dy]] as const).forEach(([ox, oy], i) => {
    o += `<rect x="${cx - w / 2 + ox}" y="${cy - h / 2 + oy}" width="${w}" height="${h}" rx="5" ${st(f[i], s)}/>`;
  });
  return o;
}

const dbCluster = (x: number, y: number, top: string, bottom: string, line: string) =>
  cyl(x - 22, y - 18, 18, 22, top, line) + cyl(x + 4, y - 18, 18, 22, top, line) + cyl(x - 9, y - 4, 18, 22, bottom, line);

export const ICONS: Record<IconKey, IconFn> = {
  svc: (x, y) => stack3(x, y, 30, 24, ["#4caf50", "#3b9442", "#2e7d32"], "#1b4d1f", 7, 6),
  redis: (x, y) => {
    const rhombus = (cy: number) => `M${x - 21} ${cy} L${x} ${cy - 9} L${x + 21} ${cy} L${x} ${cy + 9} z`;
    const layers = (
      [[10, "#b8321f"], [2, "#cf3f2c"], [-6, "#e8453a"]] as const
    ).map(([o, c]) => `<path d="${rhombus(y + o + 4)}" ${st("#8f1b10", "#5a0f08", 1.3)} stroke-linejoin="round"/><path d="${rhombus(y + o)}" ${st(c, "#5a0f08", 1.3)} stroke-linejoin="round"/>`);
    return layers.join("") +
      `<ellipse cx="${x - 7}" cy="${y - 6}" rx="6" ry="2.6" fill="#fff"/><path d="M${x + 1} ${y - 6.5} L${x + 14} ${y - 8.5} L${x + 8} ${y - 3} z" fill="#fff" stroke-linejoin="round"/>`;
  },
  db: (x, y) => dbCluster(x, y, "#5aa2ff", "#3d8bf0", "#1d4f9e"),
  es: (x, y) =>
    dbCluster(x, y, "#f6c24c", "#f0b232", "#93630a") +
    `<circle cx="${x}" cy="${y + 6}" r="5" fill="none" stroke="#7a4f00" stroke-width="2"/><path d="M${x + 3.5} ${y + 9.5} l5 5" stroke="#7a4f00" stroke-width="2.4" stroke-linecap="round"/>`,
  vector: (x, y) =>
    dbCluster(x, y, "#a58cf5", "#8f72ee", "#4b2fa3") +
    [[-3, 8], [3, 12], [0, 15], [4, 5]].map(([a, b]) => `<circle cx="${x + a}" cy="${y + b}" r="1.6" fill="#fff"/>`).join(""),
  queue: (x, y) =>
    `<rect x="${x - 26}" y="${y - 13}" width="52" height="26" rx="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2" opacity=".75"/>` +
    [-12, 12].map((o) =>
      `<rect x="${x + o - 10}" y="${y - 7}" width="20" height="14" rx="2" ${st("#35b8a6", "#136b5f", 1.2)}/><path d="M${x + o - 10} ${y - 7} l10 7 l10 -7" fill="none" stroke="#136b5f" stroke-width="1.2"/>`,
    ).join(""),
  cdn: (x, y) => `<path d="M${x - 18} ${y + 10} h36 a9 9 0 0 0 0 -18 a12 12 0 0 0 -22 -4 a9 9 0 0 0 -14 22 z" ${st("#ec6fae", "#8e2a63", 1.8)}/>`,
  phone: (x, y) =>
    `<rect x="${x - 11}" y="${y - 19}" width="22" height="38" rx="4" ${st("#9aa0a8", "#4b5058")}/><rect x="${x - 8}" y="${y - 14}" width="16" height="27" rx="1.5" fill="#eceef1"/><rect x="${x - 3}" y="${y - 17}" width="6" height="1.6" rx=".8" fill="#4b5058"/>`,
  laptop: (x, y) =>
    `<rect x="${x - 17}" y="${y - 16}" width="34" height="23" rx="2.5" ${st("#9aa0a8", "#4b5058")}/><rect x="${x - 14}" y="${y - 13}" width="28" height="17" fill="#eceef1"/><path d="M${x - 22} ${y + 8} h44 l-3 5 h-38 z" ${st("#b9bec6", "#4b5058", 1.4)}/>`,
  person: (x, y) =>
    `<circle cx="${x}" cy="${y - 9}" r="8" ${st("#7fa6dd", "#2e5590")}/><path d="M${x - 15} ${y + 17} a15 13 0 0 1 30 0 z" ${st("#7fa6dd", "#2e5590")}/>`,
  gateway: (x, y) =>
    `<rect x="${x - 16}" y="${y - 22}" width="32" height="44" rx="6" ${st("#3fb0a2", "#16685e", 1.8)}/><path d="M${x - 9} ${y - 12} v24 M${x + 9} ${y - 12} v24" stroke="#16685e" stroke-width="1.4"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#0d3d37" font-family="monospace">&lt;/&gt;</text>`,
  blob: (x, y) =>
    `<path d="M${x - 17} ${y - 13} l4 28 a13 5 0 0 0 26 0 l4 -28" ${st("#ef7d45", "#8a3a12")}/><ellipse cx="${x}" cy="${y - 13}" rx="17" ry="6" ${st("#f39a68", "#8a3a12")}/>`,
  card: (x, y) =>
    `<rect x="${x - 20}" y="${y - 13}" width="40" height="27" rx="4" ${st("#6d78ff", "#2b33a8")}/><rect x="${x - 20}" y="${y - 7}" width="40" height="5" fill="#2b33a8"/><rect x="${x - 15}" y="${y + 4}" width="12" height="4" rx="1" fill="#dfe3ff"/>`,
  bell: (x, y) =>
    `<path d="M${x - 13} ${y + 9} c3 -3 3 -8 3 -12 a10 10 0 0 1 20 0 c0 4 0 9 3 12 z" ${st("#f6c24c", "#8a5a00")}/><circle cx="${x}" cy="${y + 13}" r="3.2" ${st("#f6c24c", "#8a5a00")}/>`,
  mail: (x, y) =>
    `<rect x="${x - 18}" y="${y - 12}" width="36" height="24" rx="3" ${st("#5aa2ff", "#1d4f9e")}/><path d="M${x - 18} ${y - 12} l18 13 l18 -13" fill="none" stroke="#1d4f9e" stroke-width="1.6"/>`,
  sms: (x, y) =>
    `<path d="M${x - 18} ${y - 13} h36 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-22 l-8 7 v-7 h-6 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4 z" ${st("#4caf50", "#1b4d1f")}/>` +
    [-9, 0, 9].map((o) => `<circle cx="${x + o + 2}" cy="${y - 1}" r="2" fill="#fff"/>`).join(""),
  ai: (x, y) => {
    let o = `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="5" ${st("#f0845c", "#8a2f12", 1.8)}/>`;
    [-8, 0, 8].forEach((p) => {
      o += `<path d="M${x + p} ${y - 15} v-5 M${x + p} ${y + 15} v5 M${x - 15} ${y + p} h-5 M${x + 15} ${y + p} h5" stroke="#8a2f12" stroke-width="1.8" stroke-linecap="round"/>`;
    });
    return o + `<path d="M${x} ${y - 8} l2.4 5.6 l5.6 2.4 l-5.6 2.4 l-2.4 5.6 l-2.4 -5.6 l-5.6 -2.4 l5.6 -2.4 z" fill="#fff"/>`;
  },
  doc: (x, y) =>
    ([[-8, -6], [-3, -2], [2, 2]] as const).map(([a, b], i) =>
      `<path d="M${x + a - 10} ${y + b - 14} h14 l6 6 v22 h-20 z" ${st(["#c9d2df", "#b5c0d0", "#e8edf4"][i], "#4b5a70", 1.4)}/>`,
    ).join("") +
    [6, 11, 16].map((d) => `<path d="M${x - 5} ${y + d - 8} h12" stroke="#4b5a70" stroke-width="1.3"/>`).join(""),
  graph: (x, y) => {
    const p = [[-14, -10], [12, -12], [0, 4], [-12, 14], [14, 12]];
    const e = [[0, 2], [1, 2], [2, 3], [2, 4], [0, 1]];
    return (
      e.map(([a, b]) => `<path d="M${x + p[a][0]} ${y + p[a][1]} L${x + p[b][0]} ${y + p[b][1]}" stroke="#7b5cd6" stroke-width="2"/>`).join("") +
      p.map(([a, b], i) => `<circle cx="${x + a}" cy="${y + b}" r="${i === 2 ? 6 : 5}" ${st(i === 2 ? "#a58cf5" : "#c9b8ff", "#4b2fa3", 1.4)}/>`).join("")
    );
  },
  lock: (x, y) =>
    `<path d="M${x - 9} ${y - 3} v-6 a9 9 0 0 1 18 0 v6" fill="none" stroke="#8a1f12" stroke-width="3"/><rect x="${x - 15}" y="${y - 4}" width="30" height="22" rx="4" ${st("#e05a47", "#8a1f12")}/><circle cx="${x}" cy="${y + 5}" r="3" fill="#6e1a10"/>`,
  chart: (x, y) =>
    `<rect x="${x - 20}" y="${y - 16}" width="40" height="32" rx="4" ${st("#e9edf3", "#4b5a70", 1.4)}/>` +
    ([[-13, 6, "#5aa2ff"], [-4, 12, "#4caf50"], [5, 18, "#f6c24c"]] as const)
      .map(([a, h, c]) => `<rect x="${x + a}" y="${y + 11 - h}" width="7" height="${h}" fill="${c}"/>`).join(""),
  ring: (x, y) =>
    `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#7b5cd6" stroke-width="3"/>` +
    ([[0, -16, "#4caf50"], [14, 8, "#5aa2ff"], [-14, 8, "#f6c24c"], [11, -11.5, "#e05a47"]] as const)
      .map(([a, b, c]) => `<circle cx="${x + a}" cy="${y + b}" r="5" fill="${c}" stroke="#222" stroke-width="1"/>`).join(""),
  filter: (x, y) => `<path d="M${x - 19} ${y - 15} h38 l-14 16 v13 l-10 5 v-18 z" ${st("#35b8a6", "#136b5f", 1.8)}/>`,
  server: (x, y) =>
    [-14, -2, 10].map((o) =>
      `<rect x="${x - 18}" y="${y + o - 4}" width="36" height="10" rx="2" ${st("#9aa0a8", "#4b5058", 1.3)}/><circle cx="${x + 12}" cy="${y + o + 1}" r="1.8" fill="#4caf50"/>`,
    ).join(""),
  apps: (x, y) =>
    ([[-12, -12, "#e05a47"], [2, -12, "#5aa2ff"], [-12, 2, "#4caf50"], [2, 2, "#f6c24c"]] as const)
      .map(([a, b, c]) => `<rect x="${x + a - 1}" y="${y + b - 1}" width="13" height="13" rx="3" fill="${c}" stroke="#222" stroke-width="1"/>`).join(""),
  box: (x, y) =>
    `<path d="M${x} ${y - 18} l17 9 v19 l-17 9 l-17 -9 v-19 z" ${st("#f6c24c", "#8a5a00")}/><path d="M${x - 17} ${y - 9} l17 9 l17 -9 M${x} ${y} v18" fill="none" stroke="#8a5a00" stroke-width="1.6"/>`,
  decision: (x, y) =>
    `<path d="M${x} ${y - 20} L${x + 22} ${y} L${x} ${y + 20} L${x - 22} ${y} z" ${st("#f6c24c", "#8a5a00", 1.8)}/>` +
    `<text x="${x}" y="${y + 7}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="21" fill="#5c3b00">?</text>`,
  startend: (x, y) =>
    `<rect x="${x - 22}" y="${y - 12}" width="44" height="24" rx="12" ${st("#4caf50", "#1f6b24", 1.8)}/><circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="${x}" cy="${y}" r="2.4" fill="#fff"/>`,
  process: (x, y) =>
    `<rect x="${x - 21}" y="${y - 14}" width="42" height="28" rx="3" ${st("#5aa2ff", "#1d4f9e", 1.8)}/><path d="M${x - 14} ${y - 14} v28 M${x + 14} ${y - 14} v28" stroke="#1d4f9e" stroke-width="1.8"/><path d="M${x - 8} ${y - 6} h16 M${x - 8} ${y} h11 M${x - 8} ${y + 6} h14" stroke="#dbe9ff" stroke-width="2" stroke-linecap="round"/>`,
  loop: (x, y) =>
    `<path d="M${x + 9} ${y - 10.7} A14 14 0 1 0 ${x + 10.7} ${y + 9}" fill="none" stroke="#7b5cd6" stroke-width="4.2" stroke-linecap="round"/><path d="M${x + 17.5} ${y + 1} L${x + 16} ${y + 14} L${x + 5.5} ${y + 8} z" fill="#7b5cd6" stroke="#7b5cd6" stroke-width="1" stroke-linejoin="round"/>`,
  fork: (x, y) =>
    `<rect x="${x - 19}" y="${y - 3}" width="38" height="6" rx="2" ${st("#3d4350", "#1d2128", 1.2)}/>` +
    `<path d="M${x} ${y - 20} V${y - 7} M${x - 12} ${y + 4} V${y + 14} M${x + 12} ${y + 4} V${y + 14}" stroke="#ef7d45" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M${x - 5} ${y - 9} h10 l-5 6 z M${x - 17} ${y + 12} h10 l-5 7 z M${x + 7} ${y + 12} h10 l-5 7 z" fill="#ef7d45"/>`,
  timer: (x, y) =>
    `<circle cx="${x}" cy="${y + 2}" r="16" ${st("#f1f3f6", "#4b5a70", 2.4)}/><rect x="${x - 3}" y="${y - 18}" width="6" height="4" rx="1" fill="#4b5a70"/><path d="M${x} ${y + 2} V${y - 9} M${x} ${y + 2} l7 4" stroke="#222831" stroke-width="2.4" stroke-linecap="round"/><circle cx="${x}" cy="${y + 2}" r="2" fill="#e05a47"/>`,
  trigger: (x, y) =>
    `<path d="M${x + 4} ${y - 21} L${x - 13} ${y + 3} L${x - 2} ${y + 3} L${x - 6} ${y + 21} L${x + 14} ${y - 5} L${x + 3} ${y - 5} L${x + 10} ${y - 21} z" ${st("#f6c24c", "#8a5a00", 1.7)} stroke-linejoin="round"/>`,
  http: (x, y) =>
    `<rect x="${x - 22}" y="${y - 16}" width="44" height="32" rx="4" ${st("#4a90f0", "#1d4f9e", 1.7)}/><path d="M${x - 22} ${y - 8} h44" stroke="#1d4f9e" stroke-width="1.5"/><circle cx="${x - 16}" cy="${y - 12}" r="1.6" fill="#e05a47"/><circle cx="${x - 11}" cy="${y - 12}" r="1.6" fill="#f6c24c"/><circle cx="${x - 6}" cy="${y - 12}" r="1.6" fill="#4caf50"/>` +
    `<text x="${x}" y="${y + 9}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="12" fill="#fff">HTTP</text>`,
  rest: (x, y) =>
    `<rect x="${x - 22}" y="${y - 16}" width="44" height="32" rx="4" ${st("#2f9e6e", "#1c6b49", 1.7)}/>` +
    `<text x="${x}" y="${y + 4.5}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="11.5" fill="#fff">{REST}</text>`,
  websocket: (x, y) =>
    `<rect x="${x - 22}" y="${y - 17}" width="44" height="34" rx="5" ${st("#7b5cd6", "#4b3a8f", 1.7)}/>` +
    `<path d="M${x - 14} ${y - 6} H${x + 14} M${x - 14} ${y - 6} l6 -5 M${x - 14} ${y - 6} l6 5 M${x + 14} ${y - 6} l-6 -5 M${x + 14} ${y - 6} l-6 5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${x}" y="${y + 11}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="11" fill="#fff">WS</text>`,
  sse: (x, y) =>
    `<rect x="${x - 22}" y="${y - 17}" width="44" height="34" rx="5" ${st("#ef7d45", "#8a3a12", 1.7)}/>` +
    `<path d="M${x - 15} ${y - 10} H${x + 14} M${x + 14} ${y - 10} l-5 -4 M${x + 14} ${y - 10} l-5 4 M${x - 15} ${y - 3} H${x + 6} M${x + 6} ${y - 3} l-5 -4 M${x + 6} ${y - 3} l-5 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${x}" y="${y + 12}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="11" fill="#fff">SSE</text>`,
  webhook: (x, y) =>
    `<path d="M${x + 8} ${y - 12} V${y + 2} a10 10 0 0 1 -20 0" fill="none" stroke="#d6457a" stroke-width="4.4" stroke-linecap="round"/><circle cx="${x + 8}" cy="${y - 15}" r="5" ${st("#d6457a", "#8a2250", 1.4)}/><circle cx="${x - 12}" cy="${y + 2}" r="4" ${st("#f2a0bd", "#8a2250", 1.4)}/><path d="M${x - 19} ${y + 17} h30" stroke="#8a2250" stroke-width="3" stroke-linecap="round"/>`,
  llm: (x, y) =>
    `<path d="M${x - 17} ${y - 18} H${x + 17} a5 5 0 0 1 5 5 V${y + 5} a5 5 0 0 1 -5 5 H${x - 3} L${x - 12} ${y + 19} V${y + 10} H${x - 17} a5 5 0 0 1 -5 -5 V${y - 13} a5 5 0 0 1 5 -5 z" ${st("#5865f2", "#2a3190", 1.7)} stroke-linejoin="round"/>` +
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="12" fill="#fff">LLM</text>`,
  agent: (x, y) =>
    `<path d="M${x} ${y - 9} V${y - 16}" stroke="#0d3d46" stroke-width="1.8" stroke-linecap="round"/><circle cx="${x}" cy="${y - 19}" r="3.2" ${st("#ffb020", "#8a5a00", 1.4)}/>` +
    `<rect x="${x - 22}" y="${y - 1}" width="4" height="10" rx="2" ${st("#168a9b", "#0d3d46", 1.4)}/><rect x="${x + 18}" y="${y - 1}" width="4" height="10" rx="2" ${st("#168a9b", "#0d3d46", 1.4)}/>` +
    `<rect x="${x - 18}" y="${y - 9}" width="36" height="26" rx="7" ${st("#1fb6c9", "#0d5a66", 1.8)}/>` +
    [-7, 7].map((o) => `<circle cx="${x + o}" cy="${y + 2}" r="4" fill="#fff"/><circle cx="${x + o}" cy="${y + 2.6}" r="1.7" fill="#0d3d46"/>`).join("") +
    `<path d="M${x - 6} ${y + 11} h12" stroke="#0d3d46" stroke-width="2" stroke-linecap="round"/>`,
  rag: (x, y) =>
    `<rect x="${x - 21}" y="${y - 19}" width="28" height="36" rx="3" ${st("#fff", "#7a2a8a", 1.6)}/>` +
    `<text x="${x - 7}" y="${y - 8}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="9" fill="#c13fd6">RAG</text>` +
    `<path d="M${x - 17} ${y - 2} h20 M${x - 17} ${y + 4} h16 M${x - 17} ${y + 10} h12" stroke="#b9a0c8" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="${x + 8}" cy="${y + 4}" r="11" fill="#d9f2ff" fill-opacity=".55" stroke="#c13fd6" stroke-width="3.4"/><path d="M${x + 16} ${y + 12} l8 8" stroke="#8a2a9c" stroke-width="4.4" stroke-linecap="round"/>`,
  embed: (x, y) =>
    `<path d="M${x - 17} ${y + 15} V${y - 19} M${x - 17} ${y + 15} H${x + 21} M${x - 17} ${y + 15} L${x - 4} ${y + 23}" fill="none" stroke="#c77a12" stroke-width="2" stroke-linecap="round"/>` +
    [[-2, -9], [8, -1], [-7, 2], [10, -13]].map(([a, b]) => `<path d="M${x - 17} ${y + 15} L${x + a} ${y + b}" stroke="#e3b25c" stroke-width="1" stroke-dasharray="2 2"/><circle cx="${x + a}" cy="${y + b}" r="3.6" ${st("#fbbf24", "#8a5200", 1.3)}/>`).join(""),
  retriever: (x, y) =>
    [[30, "#f43f5e"], [23, "#f2627a"], [16, "#f48ca0"], [10, "#f7b3c0"]].map(([h, c], i) => `<rect x="${x - 21 + i * 11}" y="${y + 17 - (h as number)}" width="9" height="${h}" rx="2" ${st(c as string, "#9c2543", 1.3)}/>`).join("") +
    `<path d="M${x - 24} ${y + 18} h48" stroke="#9c2543" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M${x - 16.5} ${y - 21} l1.7 3.6 l3.9 .5 l-2.9 2.7 l.8 3.9 l-3.5 -2 l-3.5 2 l.8 -3.9 l-2.9 -2.7 l3.9 -.5 z" fill="#ffd24d" stroke="#a87900" stroke-width="1"/>`,
  prompt: (x, y) =>
    `<rect x="${x - 20}" y="${y - 19}" width="40" height="38" rx="5" ${st("#20b486", "#0d6b4d", 1.8)}/><rect x="${x - 20}" y="${y - 19}" width="40" height="8" rx="4" fill="#0f7f5c"/>` +
    `<path d="M${x - 13} ${y - 4} h26 M${x - 13} ${y + 3} h18" stroke="#d8fff0" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M${x - 13} ${y + 8} l5 3.5 l-5 3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x - 5} ${y + 15} h7" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  guard: (x, y) =>
    `<path d="M${x} ${y - 21} L${x + 18} ${y - 14} V${y + 2} C${x + 18} ${y + 13} ${x + 8} ${y + 19} ${x} ${y + 22} C${x - 8} ${y + 19} ${x - 18} ${y + 13} ${x - 18} ${y + 2} V${y - 14} z" ${st("#3a6fd8", "#1c3f8f", 1.8)} stroke-linejoin="round"/>` +
    `<path d="M${x - 8} ${y + 1} L${x - 2} ${y + 8} L${x + 9} ${y - 7}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  tools: (x, y) =>
    `<g transform="rotate(-35 ${x} ${y})"><path d="M${x} ${y - 2} V${y + 20}" stroke="#64748b" stroke-width="9" stroke-linecap="round"/><path d="M${x} ${y - 2} V${y + 20}" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M${x - 5.5} ${y - 22} A11 11 0 1 0 ${x + 5.5} ${y - 22}" fill="none" stroke="#64748b" stroke-width="8" stroke-linecap="round"/><path d="M${x - 5.5} ${y - 22} A11 11 0 1 0 ${x + 5.5} ${y - 22}" fill="none" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/></g>` +
    `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => `${x + 14 + 8 * Math.cos((i * Math.PI) / 3)},${y + 13 + 8 * Math.sin((i * Math.PI) / 3)}`).join(" ")}" ${st("#f59e0b", "#8a5a00", 1.5)}/><circle cx="${x + 14}" cy="${y + 13}" r="2.6" fill="#8a5a00"/>`,
  memory: (x, y) =>
    `<rect x="${x - 23}" y="${y - 6}" width="46" height="21" rx="2.5" ${st("#1f9d6a", "#0f5c3e", 1.6)}/>` +
    [-15, -5, 5, 15].map((o) => `<rect x="${x + o - 4.5}" y="${y - 2}" width="9" height="10" rx="1.5" fill="#1b1f27"/>`).join("") +
    Array.from({ length: 11 }, (_, i) => `<rect x="${x - 21 + i * 4.2}" y="${y + 15}" width="2.6" height="4.5" fill="#e6c04a"/>`).join("") +
    [[8, -12, 2.2], [14, -17, 3], [21, -22, 4]].map(([a, b, r]) => `<circle cx="${x + a}" cy="${y + b}" r="${r}" ${st("#9bf0c9", "#1f9d6a", 1.2)}/>`).join(""),
  mcp: (x, y) =>
    `<rect x="${x - 17}" y="${y - 5}" width="34" height="26" rx="4" ${st("#475569", "#1e293b", 1.7)}/>` +
    `<circle cx="${x - 10}" cy="${y + 1}" r="1.8" fill="#7dff9a"/><circle cx="${x - 5}" cy="${y + 1}" r="1.8" fill="#38bdf8"/>` +
    `<text x="${x}" y="${y + 15}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="10" fill="#fff">MCP</text>` +
    `<path d="M${x} ${y - 5} v-4" stroke="#1e293b" stroke-width="3"/><rect x="${x - 10}" y="${y - 18}" width="20" height="9" rx="2.5" ${st("#334155", "#1e293b", 1.5)}/><rect x="${x - 6}" y="${y - 25}" width="3.4" height="7.5" fill="#e6c04a"/><rect x="${x + 2.6}" y="${y - 25}" width="3.4" height="7.5" fill="#e6c04a"/>`,
  globe: (x, y) =>
    `<circle cx="${x}" cy="${y}" r="17" ${st("#5aa2ff", "#1d4f9e")}/><ellipse cx="${x}" cy="${y}" rx="7" ry="17" fill="none" stroke="#1d4f9e" stroke-width="1.4"/><path d="M${x - 17} ${y} h34 M${x - 14} ${y - 9} h28 M${x - 14} ${y + 9} h28" stroke="#1d4f9e" stroke-width="1.2"/>`,
};

/** Full standalone SVG markup for an icon, used for rasterising and for DOM previews. */
export function iconSvg(icon: IconKey, color: string, px: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-26 -26 52 52" width="${px}" height="${px}" color="${color}">` +
    ICONS[icon](0, 0) +
    `</svg>`
  );
}
