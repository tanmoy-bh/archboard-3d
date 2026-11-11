import { ICON_NAMES } from "../glyphs/catalog";
import {
  DocData, EdgeData, NODE_MIN_GAP, NodeData, TextData, TextSize, ZONE_COLORS, ZONE_LABEL_MAX, ZoneData, emptyDoc, isHexColor, snap,
} from "../model/types";
import { mapIcon } from "./iconMap";
import { XmlNode, decodeEntities, parseXml } from "./xml";

export const MAX_TILES = 400;
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;

export interface ImportReport {
  page: string;
  pages: number;
  tiles: number;
  zones: number;
  texts: number;
  arrows: number;
  /** Arrows left out because an end was missing or was not a component. */
  skippedArrows: number;
  /** Components that matched nothing and became a plain Service. */
  guessed: number;
}

export interface ImportResult { doc: DocData; report: ImportReport }

// ------------------------------------------------------------------ reading

interface Page { name: string; model: XmlNode | null; encoded: string }

function pagesOf(root: XmlNode): Page[] {
  if (root.tag === "mxGraphModel") return [{ name: "Page 1", model: root, encoded: "" }];
  if (root.tag !== "mxfile") throw new Error("This does not look like a draw.io file. Use File, Save as in draw.io and pick the .drawio format.");
  const pages: Page[] = [];
  root.children.filter((c) => c.tag === "diagram").forEach((d, i) => {
    pages.push({ name: d.attrs.name?.trim() || `Page ${i + 1}`, model: d.children.find((c) => c.tag === "mxGraphModel") ?? null, encoded: d.text.trim() });
  });
  if (pages.length === 0) throw new Error("This draw.io file has no pages.");
  return pages;
}

/** draw.io stores a compressed page as base64 of raw deflate of the URL encoded XML. */
async function inflatePage(encoded: string): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot open compressed draw.io files. In draw.io choose File, Export as, XML, untick Compressed, and import that file.");
  }
  let bytes: Uint8Array;
  try {
    const bin = atob(encoded.replace(/\s+/g, ""));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The compressed page in this file is damaged.");
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_INFLATED_BYTES) { await reader.cancel(); throw new Error("This draw.io page is too large to import."); }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("too large")) throw e;
    throw new Error("The compressed page in this file is damaged.");
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  const xml = new TextDecoder().decode(all);
  try { return decodeURIComponent(xml); } catch { return xml; }
}

async function modelOf(page: Page): Promise<XmlNode> {
  if (page.model) return page.model;
  if (!page.encoded) throw new Error(`Page "${page.name}" is empty.`);
  const xml = page.encoded.startsWith("<") ? page.encoded : await inflatePage(page.encoded);
  const node = parseXml(xml);
  if (node.tag !== "mxGraphModel") throw new Error(`Page "${page.name}" could not be read.`);
  return node;
}

/** Names of the pages in a draw.io file, so the UI can ask which one to import. */
export async function listPages(text: string): Promise<string[]> {
  return pagesOf(parseXml(text)).map((p) => p.name);
}

// ------------------------------------------------------------------- cells

interface Cell {
  id: string;
  value: string;
  style: Record<string, string>;
  tokens: string[];
  parent: string;
  vertex: boolean;
  edge: boolean;
  source: string;
  target: string;
  geo: { x: number; y: number; w: number; h: number } | null;
  visible: boolean;
}

function parseStyle(raw: string): { map: Record<string, string>; tokens: string[] } {
  const map: Record<string, string> = {}, tokens: string[] = [];
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq === -1) tokens.push(p.toLowerCase());
    else map[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
  }
  return { map, tokens };
}

/** Plain text from a label. draw.io HTML labels use <br> and block tags for line breaks. */
export function cleanLabel(value: string): string {
  let t = value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|h[1-6]|tr)>/gi, "\n").replace(/<[^>]*>/g, "");
  t = decodeEntities(t).replace(/ /g, " ");
  return t.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

function readCells(model: XmlNode): Cell[] {
  const root = model.children.find((c) => c.tag === "root");
  if (!root) throw new Error("This draw.io page has no content.");
  const cells: Cell[] = [];
  for (const el of root.children) {
    let inner = el, value = el.attrs.value ?? "", id = el.attrs.id ?? "";
    if (el.tag !== "mxCell") {
      // <object> and <UserObject> wrap a cell and carry its label and id
      const c = el.children.find((x) => x.tag === "mxCell");
      if (!c) continue;
      inner = c;
      value = el.attrs.label ?? el.attrs.value ?? "";
      id = el.attrs.id ?? c.attrs.id ?? "";
    }
    const a = inner.attrs;
    if (!id) continue;
    const g = inner.children.find((x) => x.tag === "mxGeometry");
    const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const { map, tokens } = parseStyle(a.style ?? "");
    cells.push({
      id, value, style: map, tokens,
      parent: a.parent ?? "", vertex: a.vertex === "1", edge: a.edge === "1",
      source: a.source ?? "", target: a.target ?? "",
      geo: g ? { x: num(g.attrs.x), y: num(g.attrs.y), w: num(g.attrs.width), h: num(g.attrs.height) } : null,
      visible: (a.visible ?? "1") !== "0",
    });
  }
  return cells;
}

/** Stencil words from a style: shape, icon and image names plus the bare tokens, not colours or fonts. */
function shapeNames(c: Cell): string {
  const s = c.style;
  const img = s.image && !s.image.startsWith("data:") ? s.image : "";
  return [s.shape, s.resicon, s.pricon, s.gricon, img, ...c.tokens].filter(Boolean).join(" ").toLowerCase();
}

const hex = (v: string | undefined): string | null => {
  if (!v) return null;
  const t = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) return ("#" + t.slice(1).split("").map((ch) => ch + ch).join("")).toLowerCase();
  return isHexColor(t) ? t.toLowerCase() : null;
};

const ICON_LIKE = /mxgraph\.|cylinder|\bcloud\b|actor|rhombus|hexagon|document|ellipse|triangle|parallelogram|flowchart|\bstep\b|\bimage\b|\bnote\b/;

// ----------------------------------------------------------------- converting

interface Box { x: number; y: number; w: number; h: number }
const centreOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (b: Box, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const area = (b: Box) => b.w * b.h;

function convert(model: XmlNode, pageName: string, pages: number): ImportResult {
  const cells = readCells(model);
  const byId = new Map(cells.map((c) => [c.id, c]));

  // absolute position: a child's geometry is relative to a parent vertex (container or group)
  const memo = new Map<string, { x: number; y: number }>();
  const absPos = (c: Cell, depth = 0): { x: number; y: number } => {
    const hit = memo.get(c.id);
    if (hit) return hit;
    let p = { x: c.geo?.x ?? 0, y: c.geo?.y ?? 0 };
    const par = byId.get(c.parent);
    if (par && par.vertex && par.geo && depth < 50) { const pa = absPos(par, depth + 1); p = { x: p.x + pa.x, y: p.y + pa.y }; }
    memo.set(c.id, p);
    return p;
  };

  // labels that sit on arrows are separate cells whose parent is the arrow
  const edgeLabelOf = new Map<string, string>();
  const vertices: { cell: Cell; box: Box; label: string }[] = [];
  for (const c of cells) {
    if (!c.vertex || !c.geo || !c.visible) continue;
    const parent = byId.get(c.parent);
    if (parent?.edge) {
      const t = cleanLabel(c.value).replace(/\n/g, " ");
      if (t && !edgeLabelOf.has(parent.id)) edgeLabelOf.set(parent.id, t);
      continue;
    }
    if (c.geo.w <= 0 || c.geo.h <= 0) continue;
    const p = absPos(c);
    vertices.push({ cell: c, box: { x: p.x, y: p.y, w: c.geo.w, h: c.geo.h }, label: cleanLabel(c.value) });
  }

  const isText = (v: (typeof vertices)[number]): boolean => {
    const s = v.cell.style;
    if (v.cell.tokens.includes("text") || s.shape === "text") return true;
    // draw.io draws a default white fill and a default outline unless the style says "none" explicitly
    const noFill = s.fillcolor === "none", noStroke = s.strokecolor === "none";
    return noFill && noStroke && !!v.label && !s.shape && !s.image && !v.cell.tokens.some((t) => ICON_LIKE.test(t));
  };

  const textLike = new Set(vertices.filter(isText).map((v) => v.cell.id));
  const others = vertices.filter((v) => !textLike.has(v.cell.id));

  // zones: containers, and big plain boxes with components inside them
  const zoneIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const v of others) {
    const c = v.cell;
    if (c.tokens.includes("group")) { groupIds.add(c.id); continue; } // an invisible group: its children stay, it draws nothing
    const containerStyle = c.tokens.includes("swimlane") || c.style.container === "1" || /swimlane|pool|lane/.test(c.style.shape ?? "");
    if (containerStyle) { zoneIds.add(c.id); continue; }
    if (ICON_LIKE.test(shapeNames(c)) || c.style.image) continue;
    const content = others.filter((o) => o.cell.id !== c.id && inside(v.box, centreOf(o.box)) && !groupIds.has(o.cell.id));
    // Two or more components inside a clearly bigger box make a zone. A single one needs a much bigger box,
    // so a card with a small badge inside it stays a component.
    const biggest = content.length ? Math.max(...content.map((o) => area(o.box))) : 0;
    if ((content.length >= 2 && area(v.box) > 2 * biggest) || (content.length === 1 && area(v.box) > 9 * biggest)) zoneIds.add(c.id);
  }

  const zoneCells = others.filter((v) => zoneIds.has(v.cell.id));
  const tileCells = others.filter((v) => !zoneIds.has(v.cell.id) && !groupIds.has(v.cell.id));
  if (tileCells.length > MAX_TILES) throw new Error(`This diagram has ${tileCells.length} shapes, more than the ${MAX_TILES} an Archboard can show. Import a smaller page or split it up.`);

  // free standing text under an icon without a label becomes that icon's label
  const consumedText = new Set<string>();
  const labelOf = new Map<string, string>();
  const textCells = vertices.filter((v) => textLike.has(v.cell.id) && v.label);
  for (const t of tileCells) {
    if (t.label) continue;
    const tc = centreOf(t.box);
    let best: (typeof textCells)[number] | null = null, bestD = Infinity;
    for (const x of textCells) {
      if (consumedText.has(x.cell.id)) continue;
      const c = centreOf(x.box);
      const below = c.y - (t.box.y + t.box.h);
      if (Math.abs(c.x - tc.x) <= t.box.w / 2 + 30 && below >= -x.box.h && below <= 60 + x.box.h / 2) {
        const d = Math.hypot(c.x - tc.x, below);
        if (d < bestD) { best = x; bestD = d; }
      }
    }
    if (best) { consumedText.add(best.cell.id); labelOf.set(t.cell.id, best.label); }
  }

  // icons and labels
  let guessed = 0;
  const tiles = tileCells.map((v, i) => {
    const label = (labelOf.get(v.cell.id) ?? v.label).replace(/\n/g, " ");
    const g = mapIcon(shapeNames(v.cell), label);
    if (g.guessed) guessed++;
    return { id: `n${i + 1}`, cellId: v.cell.id, box: v.box, c: centreOf(v.box), icon: g.icon, label: label || ICON_NAMES[g.icon] };
  });
  const texts = textCells.filter((t) => !consumedText.has(t.cell.id));
  const zones = zoneCells;

  if (tiles.length === 0 && zones.length === 0 && texts.length === 0) throw new Error(`Page "${pageName}" has nothing to import.`);

  // scale: the median distance from a tile to its nearest neighbour becomes 1.5 cells
  let cellPx = 130;
  if (tiles.length > 1) {
    const nn = tiles.map((a) => Math.min(...tiles.filter((b) => b !== a).map((b) => Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y)))).sort((p, q) => p - q);
    cellPx = Math.min(400, Math.max(40, nn[Math.floor(nn.length / 2)] / 1.5));
  }
  const xs: number[] = [], ys: number[] = [];
  for (const t of tiles) { xs.push(t.c.x); ys.push(t.c.y); }
  for (const t of texts) { const c = centreOf(t.box); xs.push(c.x); ys.push(c.y); }
  for (const z of zones) { xs.push(z.box.x, z.box.x + z.box.w); ys.push(z.box.y, z.box.y + z.box.h); }
  const ox = Math.min(...xs), oy = Math.min(...ys);
  const toCell = (px: number, origin: number) => (px - origin) / cellPx;

  // place tiles, nudging any that would overlap
  const placed: { gx: number; gy: number }[] = [];
  const free = (gx: number, gy: number) => !placed.some((p) => Math.abs(p.gx - gx) < NODE_MIN_GAP && Math.abs(p.gy - gy) < NODE_MIN_GAP);
  const nodes: NodeData[] = [];
  const members = new Map<string, { gx: number; gy: number }[]>(); // zone cell id -> member tiles, for sizing
  for (const t of [...tiles].sort((a, b) => a.c.y - b.c.y || a.c.x - b.c.x)) {
    let gx = snap(toCell(t.c.x, ox)), gy = snap(toCell(t.c.y, oy));
    if (!free(gx, gy)) {
      search: for (let r = 1; r <= 60; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (free(gx + dx * 0.5, gy + dy * 0.5)) { gx += dx * 0.5; gy += dy * 0.5; break search; }
        }
      }
    }
    placed.push({ gx, gy });
    nodes.push({ id: t.id, gx, gy, icon: t.icon, label: t.label });
    for (const z of zones) if (inside(z.box, t.c)) (members.get(z.cell.id) ?? members.set(z.cell.id, []).get(z.cell.id)!).push({ gx, gy });
  }
  nodes.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  // zones: the scaled box rounded outwards, grown to still cover every member after nudging
  const outZones: ZoneData[] = zones.map((z, i) => {
    let x0 = toCell(z.box.x, ox), y0 = toCell(z.box.y, oy), x1 = toCell(z.box.x + z.box.w, ox), y1 = toCell(z.box.y + z.box.h, oy);
    for (const m of members.get(z.cell.id) ?? []) { x0 = Math.min(x0, m.gx - 0.6); y0 = Math.min(y0, m.gy - 0.6); x1 = Math.max(x1, m.gx + 0.6); y1 = Math.max(y1, m.gy + 0.6); }
    const gx = Math.floor(x0 * 2) / 2, gy = Math.floor(y0 * 2) / 2;
    const stroke = hex(z.cell.style.strokecolor), fill = hex(z.cell.style.fillcolor);
    return {
      id: `z${i + 1}`, gx, gy,
      w: Math.max(2, Math.ceil(x1 * 2) / 2 - gx), h: Math.max(2, Math.ceil(y1 * 2) / 2 - gy),
      label: z.label.replace(/\n/g, " ").slice(0, ZONE_LABEL_MAX),
      color: stroke ?? fill ?? ZONE_COLORS[7],
    };
  });

  const outTexts: TextData[] = texts.map((t, i) => {
    const c = centreOf(t.box);
    const fs = Number(t.cell.style.fontsize) || 12;
    const size: TextSize = fs <= 11 ? "s" : fs >= 20 ? "l" : "m";
    const stroke = t.cell.style.strokecolor;
    const box: TextData = { id: `t${i + 1}`, gx: snap(toCell(c.x, ox)), gy: snap(toCell(c.y, oy)), text: t.label, size };
    if (stroke && stroke !== "none") box.boxed = true;
    return box;
  });

  // arrows
  const tileByCell = new Map(tiles.map((t) => [t.cellId, t.id]));
  const edges: EdgeData[] = [];
  let skipped = 0;
  for (const c of cells) {
    if (!c.edge || !c.visible) continue;
    let from = tileByCell.get(c.source), to = tileByCell.get(c.target);
    if (!from || !to || from === to) { skipped++; continue; }
    const endNone = c.style.endarrow === "none";
    const startNone = !c.style.startarrow || c.style.startarrow === "none";
    const both = !endNone && !startNone;
    if (endNone && !startNone) [from, to] = [to, from];
    const label = (cleanLabel(c.value).replace(/\n/g, " ") || edgeLabelOf.get(c.id) || "").slice(0, 60);
    if (edges.some((e) => e.from === from && e.to === to)) { skipped++; continue; }
    const rev = edges.find((e) => e.from === to && e.to === from);
    if (rev && (rev.label ?? "") === label && !rev.both) { rev.both = true; continue; } // two opposite arrows with the same label
    const edge: EdgeData = { id: `e${edges.length + 1}`, from: from!, to: to! };
    if (label) edge.label = label;
    if (c.style.dashed === "1") edge.dash = true;
    if (both) edge.both = true;
    edges.push(edge);
  }

  const doc: DocData = { ...emptyDoc(), title: pageName, nodes, edges, texts: outTexts, zones: outZones, steps: [] };
  return {
    doc,
    report: { page: pageName, pages, tiles: nodes.length, zones: outZones.length, texts: outTexts.length, arrows: edges.length, skippedArrows: skipped, guessed },
  };
}

/** Turn one page of a draw.io file into a board. `pageIndex` is the page to read, 0 for the first. */
export async function importDrawio(text: string, pageIndex = 0): Promise<ImportResult> {
  const pages = pagesOf(parseXml(text));
  const page = pages[pageIndex];
  if (!page) throw new Error("That page is not in the file.");
  return convert(await modelOf(page), page.name, pages.length);
}

/** One sentence for a toast. */
export function describeReport(r: ImportReport): string {
  const parts = [`${r.tiles} components`, `${r.zones} zones`, `${r.arrows} arrows`];
  if (r.texts) parts.push(`${r.texts} text boxes`);
  let s = `Imported "${r.page}": ${parts.join(", ")}.`;
  if (r.guessed) s += ` ${r.guessed} shown as a plain Service because nothing matched.`;
  if (r.skippedArrows) s += ` ${r.skippedArrows} arrows skipped (no component at one end).`;
  return s;
}
