/**
 * Right-angle connector routing on the ground plane. Pure functions, no Three.js.
 * Points are [x, z] in world units. "t" is -z (north) and "b" is +z (south).
 *
 * Rules (from the architecture board style): arrows leave a tile from the side that faces the
 * target, share lanes when several arrows use the same side, and never pass through another tile.
 */

export type V = [number, number];
export type Side = "l" | "r" | "t" | "b";

export interface Rect { id: string; cx: number; cz: number; hw: number; hh: number }
export interface EdgeIn { id: string; from: string; to: string }
export interface Route { id: string; pts: V[]; fs: Side; ts: Side }

const PORT_GAP = 0.04;
/** Clearance kept around other tiles. Generous on purpose: it also keeps arrows off the labels under tiles. */
const MARGIN = 0.55;
const ELBOW_FRACTIONS = [0.5, 0.35, 0.65, 0.22, 0.78, 0.1, 0.9];
const LOOP_DISTANCES = [0.9, 1.5, 2.1];

const opposite: Record<Side, Side> = { l: "r", r: "l", t: "b", b: "t" };
const isH = (s: Side) => s === "l" || s === "r";

function portPos(r: Rect, side: Side, off: number): V {
  switch (side) {
    case "r": return [r.cx + r.hw + PORT_GAP, r.cz + off];
    case "l": return [r.cx - r.hw - PORT_GAP, r.cz + off];
    case "t": return [r.cx + off, r.cz - r.hh - PORT_GAP];
    default: return [r.cx + off, r.cz + r.hh + PORT_GAP];
  }
}

/** Pick the axis with more clear space between the two tiles (ties go horizontal). */
function chooseSides(a: Rect, b: Rect): [Side, Side] {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const clearX = Math.abs(dx) - (a.hw + b.hw);
  const clearZ = Math.abs(dz) - (a.hh + b.hh);
  if (clearX >= clearZ) return dx >= 0 ? ["r", "l"] : ["l", "r"];
  return dz >= 0 ? ["b", "t"] : ["t", "b"];
}

function dedupe(pts: V[]): V[] {
  const out: V[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) out.push(p);
  }
  // Drop collinear middle points.
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const sameX = Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - c[0]) < 1e-6;
    const sameZ = Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - c[1]) < 1e-6;
    if (sameX || sameZ) out.splice(i, 1);
  }
  return out;
}

/** Number of obstacle rectangles an orthogonal polyline crosses. Own endpoints are exempt on their own leg. */
function collisions(pts: V[], rects: Rect[], aId: string, bId: string): number {
  let hits = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
    for (const r of rects) {
      if (i === 0 && r.id === aId) continue;
      if (i === pts.length - 2 && r.id === bId) continue;
      const overlapX = maxX > r.cx - r.hw - MARGIN && minX < r.cx + r.hw + MARGIN;
      const overlapZ = maxZ > r.cz - r.hh - MARGIN && minZ < r.cz + r.hh + MARGIN;
      if (overlapX && overlapZ) hits++;
    }
  }
  return hits;
}

function length(pts: V[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

function zRoute(s: V, t: V, horizontal: boolean, frac: number): V[] {
  if (horizontal) {
    if (Math.abs(s[1] - t[1]) < 1e-6) return [s, t];
    const ex = s[0] + (t[0] - s[0]) * frac;
    return [s, [ex, s[1]], [ex, t[1]], t];
  }
  if (Math.abs(s[0] - t[0]) < 1e-6) return [s, t];
  const ez = s[1] + (t[1] - s[1]) * frac;
  return [s, [s[0], ez], [t[0], ez], t];
}

function loopRoute(a: Rect, b: Rect, side: Side, d: number): { pts: V[]; fs: Side; ts: Side } {
  const s = portPos(a, side, 0), t = portPos(b, side, 0);
  let pts: V[];
  if (side === "t") { const zl = Math.min(s[1], t[1]) - d; pts = [s, [s[0], zl], [t[0], zl], t]; }
  else if (side === "b") { const zl = Math.max(s[1], t[1]) + d; pts = [s, [s[0], zl], [t[0], zl], t]; }
  else if (side === "l") { const xl = Math.min(s[0], t[0]) - d; pts = [s, [xl, s[1]], [xl, t[1]], t]; }
  else { const xl = Math.max(s[0], t[0]) + d; pts = [s, [xl, s[1]], [xl, t[1]], t]; }
  return { pts, fs: side, ts: side };
}

/** Route every edge. Edges whose endpoints are missing (or equal) are skipped. */
export function routeAll(rects: Rect[], edges: EdgeIn[]): Map<string, Route> {
  const byId = new Map(rects.map((r) => [r.id, r]));
  const live = edges.filter((e) => e.from !== e.to && byId.has(e.from) && byId.has(e.to));

  // 1. sides for every edge
  const sides = new Map<string, [Side, Side]>();
  for (const e of live) sides.set(e.id, chooseSides(byId.get(e.from)!, byId.get(e.to)!));

  // 2. lane offsets: edges sharing a side of a tile are spread along it, ordered by where they go
  type Use = { edge: string; end: "from" | "to"; other: number };
  const uses = new Map<string, Use[]>();
  const addUse = (node: string, side: Side, u: Use) => {
    const k = node + ":" + side;
    if (!uses.has(k)) uses.set(k, []);
    uses.get(k)!.push(u);
  };
  for (const e of live) {
    const [fs, ts] = sides.get(e.id)!;
    const a = byId.get(e.from)!, b = byId.get(e.to)!;
    addUse(e.from, fs, { edge: e.id, end: "from", other: isH(fs) ? b.cz : b.cx });
    addUse(e.to, ts, { edge: e.id, end: "to", other: isH(ts) ? a.cz : a.cx });
  }
  const offsets = new Map<string, number>(); // key: edge + ":" + end
  for (const [key, list] of uses) {
    const [nodeId, side] = key.split(":") as [string, Side];
    const r = byId.get(nodeId)!;
    const half = isH(side) ? r.hh : r.hw;
    list.sort((p, q) => p.other - q.other || (p.edge < q.edge ? -1 : p.edge > q.edge ? 1 : 0));
    const n = list.length;
    const spacing = n > 1 ? Math.min(0.34, (half * 1.4) / (n - 1)) : 0;
    list.forEach((u, i) => offsets.set(u.edge + ":" + u.end, (i - (n - 1) / 2) * spacing));
  }

  // 3. pick the best path per edge
  const routes = new Map<string, Route>();
  for (const e of live) {
    const a = byId.get(e.from)!, b = byId.get(e.to)!;
    const [fs, ts] = sides.get(e.id)!;
    const s = portPos(a, fs, offsets.get(e.id + ":from") ?? 0);
    const t = portPos(b, ts, offsets.get(e.id + ":to") ?? 0);

    let best: { pts: V[]; fs: Side; ts: Side; cost: number } | null = null;
    const consider = (pts: V[], f: Side, tt: Side): boolean => {
      pts = dedupe(pts);
      const hits = collisions(pts, rects, e.from, e.to);
      const cost = hits * 1000 + length(pts);
      if (!best || cost < best.cost) best = { pts, fs: f, ts: tt, cost };
      return hits === 0;
    };

    let clean = false;
    for (const f of ELBOW_FRACTIONS) {
      if (consider(zRoute(s, t, isH(fs), f), fs, ts)) { clean = true; break; }
    }
    if (!clean) {
      for (const side of ["t", "b", "l", "r"] as Side[]) {
        for (const d of LOOP_DISTANCES) {
          const l = loopRoute(a, b, side, d);
          if (consider(l.pts, l.fs, l.ts)) break;
        }
      }
    }
    const chosen = best!;
    routes.set(e.id, { id: e.id, pts: chosen.pts, fs: chosen.fs, ts: chosen.ts });
  }
  return routes;
}

// ------------------------------------------------------------------ geometry

/** Replace each corner of an orthogonal polyline with a small quadratic curve. */
export function roundPath(pts: V[], radius = 0.28, steps = 7): V[] {
  if (pts.length < 3) return pts.slice();
  const out: V[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], p = pts[i], next = pts[i + 1];
    const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const l2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.02) { out.push(p); continue; }
    const a: V = [p[0] - ((p[0] - prev[0]) / l1) * r, p[1] - ((p[1] - prev[1]) / l1) * r];
    const b: V = [p[0] + ((next[0] - p[0]) / l2) * r, p[1] + ((next[1] - p[1]) / l2) * r];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, w = 1 - u;
      out.push([w * w * a[0] + 2 * w * u * p[0] + u * u * b[0], w * w * a[1] + 2 * w * u * p[1] + u * u * b[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface Polyline { pts: V[]; cum: number[]; len: number }

export function makePolyline(pts: V[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

export function pointAt(pl: Polyline, d: number): V {
  if (pl.pts.length === 1) return pl.pts[0];
  d = Math.max(0, Math.min(pl.len, d));
  let i = 1;
  while (i < pl.cum.length - 1 && pl.cum[i] < d) i++;
  const seg = pl.cum[i] - pl.cum[i - 1] || 1;
  const u = (d - pl.cum[i - 1]) / seg;
  return [pl.pts[i - 1][0] + (pl.pts[i][0] - pl.pts[i - 1][0]) * u, pl.pts[i - 1][1] + (pl.pts[i][1] - pl.pts[i - 1][1]) * u];
}

/** Distance from a point to the polyline. */
export function distanceTo(pts: V[], p: V): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - z1) * dz) / l2));
    best = Math.min(best, Math.hypot(p[0] - (x1 + dx * u), p[1] - (z1 + dz * u)));
  }
  return best;
}

export interface LabelAnchor { at: V; horizontal: boolean; segLen: number }

const ANCHOR_FRACTIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];

/**
 * Where an arrow's label pill and step badge sit. Prefers the middle of a long segment, but slides
 * along it (and tries the other segments) to stay clear of tile names and of pills already placed.
 * `tiles` are tile centres; `placed` are anchors of earlier arrows. Pills are wide, so they keep a
 * larger distance from each other than from tiles.
 */
export function labelAnchor(pts: V[], tiles: V[] = [], placed: V[] = []): LabelAnchor {
  let best: LabelAnchor | null = null, bestScore = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 0.9 && pts.length > 2) continue; // too short to carry a label
    for (const f of ANCHOR_FRACTIONS) {
      const at: V = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      let nearTile = Infinity, nearPill = Infinity;
      for (const t of tiles) nearTile = Math.min(nearTile, Math.hypot(at[0] - t[0], at[1] - t[1]));
      for (const p of placed) nearPill = Math.min(nearPill, Math.hypot(at[0] - p[0], at[1] - p[1]));
      // Clearance is capped so that "far enough" is a tie and the middle of a long segment wins.
      const clearance = Math.min(Math.min(nearTile, 2.3), Math.min(nearPill, 2.4) * 0.95);
      const score = clearance + Math.min(segLen, 6) * 0.06 - Math.abs(f - 0.5) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { at, horizontal: Math.abs(b[1] - a[1]) < 1e-6, segLen };
      }
    }
  }
  if (best) return best;
  const a = pts[0], b = pts[pts.length - 1];
  return { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], horizontal: Math.abs(b[1] - a[1]) < 1e-6, segLen: Math.hypot(b[0] - a[0], b[1] - a[1]) };
}
