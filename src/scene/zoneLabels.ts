/**
 * Places each zone's name on a free side of the zone.
 *
 * A zone name is a screen space sprite, so a fixed corner of the zone is wrong as soon as the board turns: the
 * name can land outside the zone, on a neighbour, on a tile or under an arrow label. Instead, for the current
 * view angle, every zone tries a set of spots (inside at the top, above the top corner, along each of the four
 * edges, beside and below the zone) and takes the one that collides least with tiles, arrow labels, arrows,
 * text boxes, other zones and the names already placed. Pure functions, no Three.js, so they are unit tested.
 *
 * Screen space is the same as in labels.ts: a ground point (x, z) maps to
 * (right, up) = (x cos a - z sin a, -sin e (x sin a + z cos a)).
 */
import { LabelMetrics, METRICS } from "./constants";
import type { TileSpec } from "./labels";
import type { V } from "./routing";

interface Box { x0: number; x1: number; y0: number; y1: number }

export interface ZoneLabelSpec {
  id: string;
  /** Zone rectangle on the ground, world units. */
  x0: number; z0: number; x1: number; z1: number;
  /** Size of the name, world units, in screen space. Zero when the zone has no name. */
  w: number; h: number;
}

export interface ZoneObstacles {
  tiles: TileSpec[];
  /** Arrow label pills: ground anchor and size (world units). */
  pills: { at: V; w: number; h: number }[];
  /** Arrow routes: ground points. */
  routes: V[][];
  /** Text boxes: ground centre and size (world units). */
  texts: { at: V; w: number; h: number }[];
}

export type LabelSide = "inside" | "above" | "upper-left" | "upper-right" | "lower-left" | "lower-right" | "left" | "right" | "below";

export interface ZoneLabelPlacement {
  /** Ground point the name is centred on. */
  at: V;
  side: LabelSide;
  /** What the choice collided with, 0 when the spot was free. */
  cost: number;
}

const GAP = 0.14;
const PREFERENCE: Record<LabelSide, number> = { inside: 0, above: 0.04, "upper-left": 0.08, "upper-right": 0.08, "lower-left": 0.14, "lower-right": 0.14, left: 0.2, right: 0.2, below: 0.24 };

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Is (x, y) inside the convex polygon? Works for either winding. */
function inside(poly: V[], x: number, y: number): boolean {
  let pos = false, neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c > 1e-9) pos = true; else if (c < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

/** Area of a box that lies inside a convex polygon, estimated on a grid. */
function areaInside(box: Box, poly: V[]): number {
  const nx = 8, ny = 4;
  let hit = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (inside(poly, box.x0 + ((i + 0.5) / nx) * (box.x1 - box.x0), box.y0 + ((j + 0.5) / ny) * (box.y1 - box.y0))) hit++;
  }
  return ((box.x1 - box.x0) * (box.y1 - box.y0) * hit) / (nx * ny);
}

const fullyInside = (box: Box, poly: V[]): boolean =>
  inside(poly, box.x0, box.y0) && inside(poly, box.x1, box.y0) && inside(poly, box.x0, box.y1) && inside(poly, box.x1, box.y1);

/** Does the segment a-b cross the box? (Liang-Barsky.) */
function segmentHits(a: V, b: V, box: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, a[0] - box.x0) && clip(dx, box.x1 - a[0]) && clip(-dy, a[1] - box.y0) && clip(dy, box.y1 - a[1]);
}

/** Choose a free side for every zone name. Smaller zones go first: they have the fewest good spots. */
export function placeZoneLabels(
  az: number,
  elevation: number,
  zones: ZoneLabelSpec[],
  obstacles: ZoneObstacles,
  metrics: LabelMetrics = METRICS["3d"],
): Map<string, ZoneLabelPlacement> {
  const cos = Math.cos(az), sin = Math.sin(az), se = Math.max(0.05, Math.sin(elevation));
  const proj = (x: number, z: number): V => [x * cos - z * sin, -se * (x * sin + z * cos)];
  // the inverse of proj on the ground plane
  const unproj = (r: number, u: number): V => {
    const b = -u / se;
    return [r * cos + b * sin, -r * sin + b * cos];
  };

  const fixed: Box[] = [];
  for (const t of obstacles.tiles) {
    const [r, u] = proj(t.cx, t.cz);
    fixed.push({ x0: r - metrics.tileHalfW, x1: r + metrics.tileHalfW, y0: u - metrics.tileBelow, y1: u + metrics.glyphAbove });
    fixed.push({ x0: r - t.labelW / 2, x1: r + t.labelW / 2, y0: u - metrics.labelDrop - t.labelH, y1: u - metrics.labelDrop });
  }
  for (const p of obstacles.pills) {
    const [r, u] = proj(p.at[0], p.at[1]);
    fixed.push({ x0: r - p.w / 2, x1: r + p.w / 2, y0: u - p.h / 2, y1: u + p.h / 2 });
  }
  for (const t of obstacles.texts) {
    const [r, u] = proj(t.at[0], t.at[1]);
    fixed.push({ x0: r - t.w / 2, x1: r + t.w / 2, y0: u - t.h / 2, y1: u + t.h / 2 });
  }
  const segments: [V, V][] = [];
  for (const route of obstacles.routes) {
    const pts = route.map(([x, z]) => proj(x, z));
    for (let i = 0; i < pts.length - 1; i++) segments.push([pts[i], pts[i + 1]]);
  }

  const polys = new Map<string, V[]>();
  for (const z of zones) polys.set(z.id, [proj(z.x0, z.z0), proj(z.x1, z.z0), proj(z.x1, z.z1), proj(z.x0, z.z1)]);

  const order = [...zones].sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0));
  const placedNames: Box[] = [];
  const out = new Map<string, ZoneLabelPlacement>();

  for (const z of order) {
    const poly = polys.get(z.id)!;
    const W = z.w, H = z.h;
    const centre = (box: Box): V => [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    if (W <= 0 || H <= 0) {
      const [r, u] = [(poly[0][0] + poly[2][0]) / 2, (poly[0][1] + poly[2][1]) / 2];
      out.set(z.id, { at: unproj(r, u), side: "inside", cost: 0 });
      continue;
    }

    const cands: { box: Box; side: LabelSide }[] = [];
    const rect = (x0: number, y0: number): Box => ({ x0, y0, x1: x0 + W, y1: y0 + H });

    // vertices on screen
    let T = poly[0], B = poly[0], L = poly[0], R = poly[0];
    for (const p of poly) { if (p[1] > T[1]) T = p; if (p[1] < B[1]) B = p; if (p[0] < L[0]) L = p; if (p[0] > R[0]) R = p; }
    const midR = (L[0] + R[0]) / 2;

    // inside, at the top: slide down from the top corner, trying the middle first and then to each side
    const height = T[1] - B[1], halfW = (R[0] - L[0]) / 2;
    for (let d = GAP; d < height * 0.7; d += 0.18) {
      for (const dx of [0, -0.5, 0.5, -1, 1].map((k) => k * Math.max(0, halfW - W / 2) * 0.8)) {
        const box = rect(midR + dx - W / 2, T[1] - d - H);
        if (fullyInside(box, poly)) cands.push({ box, side: "inside" });
      }
    }
    // above the top corner
    cands.push({ box: rect(midR - W / 2, T[1] + GAP), side: "above" });
    // along each edge, outside it. Edges are named by where they sit on screen.
    const edge = (a: V, b: V, side: LabelSide) => {
      for (const t of [0.5, 0.3, 0.7]) {
        const q: V = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (side === "upper-left") cands.push({ box: rect(q[0] - W, q[1] + GAP), side });
        else if (side === "upper-right") cands.push({ box: rect(q[0], q[1] + GAP), side });
        else if (side === "lower-left") cands.push({ box: rect(q[0] - W, q[1] - GAP - H), side });
        else cands.push({ box: rect(q[0], q[1] - GAP - H), side });
      }
    };
    edge(L, T, "upper-left");
    edge(T, R, "upper-right");
    edge(L, B, "lower-left");
    edge(B, R, "lower-right");
    cands.push({ box: rect(L[0] - GAP - W, L[1] - H / 2), side: "left" });
    cands.push({ box: rect(R[0] + GAP, R[1] - H / 2), side: "right" });
    cands.push({ box: rect(midR - W / 2, B[1] - GAP - H), side: "below" });

    let best: { cost: number; box: Box; side: LabelSide } | null = null;
    for (const c of cands) {
      let cost = PREFERENCE[c.side];
      for (const f of fixed) cost += overlap(c.box, f) * 6;
      for (const p of placedNames) cost += overlap(c.box, p) * 8;
      for (const other of zones) if (other.id !== z.id) cost += areaInside(c.box, polys.get(other.id)!) * 2;
      if (c.side !== "inside") cost += areaInside(c.box, poly) * 4; // an outside spot must really be outside
      for (const [a, b] of segments) if (segmentHits(a, b, c.box)) cost += 0.3;
      if (!best || cost < best.cost - 1e-9) best = { cost, box: c.box, side: c.side };
    }
    const b = best!;
    placedNames.push(b.box);
    const [r, u] = centre(b.box);
    out.set(z.id, { at: unproj(r, u), side: b.side, cost: Math.max(0, b.cost - PREFERENCE[b.side]) });
  }
  return out;
}
