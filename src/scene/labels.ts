/**
 * Places arrow label pills and step badges so they do not cover tile names, tiles, glyphs or each other.
 * Pills and tile names are screen-space sprites, so the test is done in screen space for a given view
 * azimuth: a ground point (x, z) maps to (right, up) = (x cos a - z sin a, -sin e (x sin a + z cos a)).
 * Pure functions, no Three.js, so they are unit tested.
 */
import { METRICS, LabelMetrics, PXW } from "./constants";
import { LabelAnchor, V } from "./routing";

interface Box { x0: number; x1: number; y0: number; y1: number }

export interface TileSpec {
  cx: number;
  cz: number;
  /** Name label size in world units. */
  labelW: number;
  labelH: number;
}

export interface EdgeSpec {
  id: string;
  /** Corner points of the route, ground plane. */
  pts: V[];
  /** Pill size in world units (0 when the arrow has no label). */
  pillW: number;
  pillH: number;
  badge: boolean;
}

const FRACTIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const BADGE = 28 * PXW;
const BADGE_GAP = 15 * PXW;

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Choose an anchor for every arrow, in order. Earlier arrows get the better spots. */
export function placeLabels(az: number, elevation: number, tiles: TileSpec[], edges: EdgeSpec[], metrics: LabelMetrics = METRICS["3d"]): Map<string, LabelAnchor> {
  const cos = Math.cos(az), sin = Math.sin(az), se = Math.sin(elevation);
  const proj = (x: number, z: number): V => [x * cos - z * sin, -se * (x * sin + z * cos)];

  const fixed: Box[] = [];
  for (const t of tiles) {
    const [r, u] = proj(t.cx, t.cz);
    fixed.push({ x0: r - metrics.tileHalfW, x1: r + metrics.tileHalfW, y0: u - metrics.tileBelow, y1: u + metrics.glyphAbove });
    fixed.push({ x0: r - t.labelW / 2, x1: r + t.labelW / 2, y0: u - metrics.labelDrop - t.labelH, y1: u - metrics.labelDrop });
  }

  const placed: Box[] = [];
  const out = new Map<string, LabelAnchor>();

  for (const e of edges) {
    const hasPill = e.pillW > 0;
    if (!hasPill && !e.badge) continue;
    let best: { cost: number; anchor: LabelAnchor; box: Box } | null = null;

    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segLen < 0.9 && e.pts.length > 2) continue;
      const horizontal = Math.abs(b[1] - a[1]) < 1e-6;
      for (const f of FRACTIONS) {
        const at: V = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const [r, u] = proj(at[0], at[1]);
        // Box of the pill plus its badge (badge sits left of the pill, or above it on a vertical run).
        const w = hasPill ? e.pillW : BADGE, h = hasPill ? e.pillH : BADGE;
        const box: Box = { x0: r - w / 2, x1: r + w / 2, y0: u - h / 2, y1: u + h / 2 };
        if (hasPill && e.badge) {
          if (horizontal) box.x0 -= BADGE_GAP + BADGE;
          else box.y1 += BADGE_GAP + BADGE;
        }
        let cost = 0;
        for (const f2 of fixed) cost += overlap(box, f2);
        for (const p of placed) cost += overlap(box, p) * 1.5;
        // Prefer the middle of long segments when nothing else decides.
        cost += Math.abs(f - 0.5) * 0.04 + (6 - Math.min(segLen, 6)) * 0.01;
        if (!best || cost < best.cost) best = { cost, anchor: { at, horizontal, segLen }, box };
      }
    }
    if (!best) {
      const a = e.pts[0], b = e.pts[e.pts.length - 1];
      best = {
        cost: 0,
        anchor: { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], horizontal: Math.abs(b[1] - a[1]) < 1e-6, segLen: 0 },
        box: { x0: 0, x1: 0, y0: 0, y1: 0 },
      };
    }
    placed.push(best.box);
    out.set(e.id, best.anchor);
  }
  return out;
}
