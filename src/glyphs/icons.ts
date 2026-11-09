/**
 * Glyph set of the "architecture board" style: one icon per component type, drawn in a 48x48 box
 * centred on (x, y). Icons are SVG fragments so they stay crisp at any size and are rasterised
 * into textures for the 3D scene (and reused as-is in the palette and legend).
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
  redis: (x, y) => stack3(x, y, 24, 24, ["#e05a47", "#cf3f2c", "#b8321f"], "#6e1a10", 6, 6),
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
  globe: (x, y) =>
    `<circle cx="${x}" cy="${y}" r="17" ${st("#5aa2ff", "#1d4f9e")}/><ellipse cx="${x}" cy="${y}" rx="7" ry="17" fill="none" stroke="#1d4f9e" stroke-width="1.4"/><path d="M${x - 17} ${y} h34 M${x - 14} ${y - 9} h28 M${x - 14} ${y + 9} h28" stroke="#1d4f9e" stroke-width="1.2"/>`,
};

/** Human names, used in the palette, the legend and the type selector. */
export const ICON_NAMES: Record<IconKey, string> = {
  svc: "Service", redis: "Redis / cache", db: "Database", es: "Search index", vector: "Vector DB",
  queue: "Queue / stream", cdn: "CDN", phone: "Mobile client", laptop: "Web client", person: "Person",
  gateway: "LB / gateway", blob: "Object storage", card: "Payment provider", bell: "Notifications",
  mail: "Email", sms: "SMS", ai: "AI model / agent", doc: "Documents / logs", graph: "Graph",
  lock: "Lock / lease", chart: "Dashboard", ring: "Hash ring", filter: "Filter", server: "Servers",
  apps: "SaaS apps", box: "Sandbox", globe: "External site",
};

/** Palette grouping. Every icon appears exactly once. */
export const PALETTE_GROUPS: { title: string; icons: IconKey[] }[] = [
  { title: "Clients", icons: ["phone", "laptop", "person", "globe", "apps"] },
  { title: "Edge", icons: ["cdn", "gateway", "filter", "lock"] },
  { title: "Compute", icons: ["svc", "server", "box", "ai"] },
  { title: "Data", icons: ["db", "redis", "es", "vector", "blob", "graph", "ring", "doc"] },
  { title: "Messaging", icons: ["queue", "bell", "mail", "sms"] },
  { title: "Other", icons: ["card", "chart"] },
];

/** Full standalone SVG markup for an icon, used for rasterising and for DOM previews. */
export function iconSvg(icon: IconKey, color: string, px: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-26 -26 52 52" width="${px}" height="${px}" color="${color}">` +
    ICONS[icon](0, 0) +
    `</svg>`
  );
}
