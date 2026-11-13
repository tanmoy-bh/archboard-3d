import { DocData, EdgeData, NodeData, TEXT_MAX_LENGTH, TextData, ZONE_COLORS, ZONE_LABEL_MAX, ZONE_MIN, ZoneData, genId, isHexColor, isBoardId, isIconKey, isTextSize, snap } from "./types";

export function stringifyDoc(doc: DocData): string {
  return JSON.stringify(doc, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parse and validate a saved board. Throws an Error with a readable message on bad input.
 * Unknown icons fall back to a service glyph; edges that point at missing nodes are dropped.
 */
export function parseDoc(text: string): DocData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isObj(raw)) throw new Error("Expected a JSON object at the top level.");
  if (raw.version !== 1) throw new Error(`Unsupported board version: ${String(raw.version)}.`);
  if (!Array.isArray(raw.nodes)) throw new Error('Missing "nodes" array.');

  const seen = new Set<string>();
  const nodes: NodeData[] = [];
  for (const n of raw.nodes) {
    if (!isObj(n)) continue;
    const gx = Number(n.gx), gy = Number(n.gy);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) throw new Error("A node has a position that is not a number.");
    let id = typeof n.id === "string" && n.id ? n.id : genId("n");
    while (seen.has(id)) id = genId("n");
    seen.add(id);
    nodes.push({
      id,
      gx: snap(gx),
      gy: snap(gy),
      icon: isIconKey(n.icon) ? n.icon : "svc",
      label: typeof n.label === "string" ? n.label : "",
    });
  }

  const edges: EdgeData[] = [];
  const edgeIds = new Set<string>();
  if (Array.isArray(raw.edges)) {
    for (const e of raw.edges) {
      if (!isObj(e) || typeof e.from !== "string" || typeof e.to !== "string") continue;
      if (!seen.has(e.from) || !seen.has(e.to) || e.from === e.to) continue;
      let id = typeof e.id === "string" && e.id ? e.id : genId("e");
      while (edgeIds.has(id) || seen.has(id)) id = genId("e");
      edgeIds.add(id);
      const edge: EdgeData = { id, from: e.from, to: e.to };
      if (typeof e.label === "string" && e.label) edge.label = e.label;
      if (typeof e.step === "number" && Number.isInteger(e.step) && e.step > 0) edge.step = e.step;
      if (e.hot === true) edge.hot = true;
      if (e.dash === true) edge.dash = true;
      if (e.both === true) edge.both = true;
      edges.push(edge);
    }
  }

  const texts: TextData[] = [];
  if (Array.isArray(raw.texts)) {
    const used = new Set<string>([...seen, ...edgeIds]);
    for (const t of raw.texts) {
      if (!isObj(t)) continue;
      const gx = Number(t.gx), gy = Number(t.gy);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
      let id = typeof t.id === "string" && t.id ? t.id : genId("t");
      while (used.has(id)) id = genId("t");
      used.add(id);
      const box: TextData = {
        id, gx: snap(gx), gy: snap(gy),
        text: typeof t.text === "string" ? t.text.slice(0, TEXT_MAX_LENGTH) : "",
        size: isTextSize(t.size) ? t.size : "m",
      };
      if (t.boxed === true) box.boxed = true;
      texts.push(box);
    }
  }

  const zones: ZoneData[] = [];
  if (Array.isArray(raw.zones)) {
    const used = new Set<string>([...seen, ...edgeIds, ...texts.map((t) => t.id)]);
    for (const z of raw.zones) {
      if (!isObj(z)) continue;
      const gx = Number(z.gx), gy = Number(z.gy), w = Number(z.w), h = Number(z.h);
      if (![gx, gy, w, h].every(Number.isFinite)) continue;
      let id = typeof z.id === "string" && z.id ? z.id : genId("z");
      while (used.has(id)) id = genId("z");
      used.add(id);
      zones.push({
        id, gx: snap(gx), gy: snap(gy),
        w: Math.max(ZONE_MIN, snap(w)), h: Math.max(ZONE_MIN, snap(h)),
        label: typeof z.label === "string" ? z.label.slice(0, ZONE_LABEL_MAX) : "",
        color: isHexColor(z.color) ? z.color.toLowerCase() : ZONE_COLORS[0],
      });
    }
  }

  const steps = Array.isArray(raw.steps) ? raw.steps.filter((s): s is string => typeof s === "string") : [];
  const title = typeof raw.title === "string" && raw.title ? raw.title : "Untitled architecture";
  const doc: DocData = { version: 1, title, nodes, edges, texts, zones, steps };
  const bid = raw.boardId ?? raw.shareId; // older files called it shareId
  if (isBoardId(bid)) doc.boardId = bid;
  return doc;
}
