import { describe, expect, it } from "vitest";
import { Rect, distanceTo, labelAnchor, makePolyline, pointAt, roundPath, routeAll } from "../src/scene/routing";

const rect = (id: string, cx: number, cz: number): Rect => ({ id, cx, cz, hw: 0.75, hh: 0.75 });

/** Does any segment of the polyline pass through the rectangle? */
function crosses(pts: [number, number][], r: Rect): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    if (
      Math.max(x1, x2) > r.cx - r.hw && Math.min(x1, x2) < r.cx + r.hw &&
      Math.max(z1, z2) > r.cz - r.hh && Math.min(z1, z2) < r.cz + r.hh
    ) return true;
  }
  return false;
}

function isOrthogonal(pts: [number, number][]): boolean {
  return pts.every((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) < 1e-6 || Math.abs(p[1] - pts[i - 1][1]) < 1e-6);
}

describe("routeAll", () => {
  it("draws a straight line between aligned tiles", () => {
    const r = routeAll([rect("a", 0, 0), rect("b", 6, 0)], [{ id: "e", from: "a", to: "b" }]).get("e")!;
    expect(r.pts).toHaveLength(2);
    expect(r.fs).toBe("r");
    expect(r.ts).toBe("l");
    expect(r.pts[0][1]).toBeCloseTo(0);
    expect(r.pts[1][1]).toBeCloseTo(0);
  });

  it("uses a right-angle elbow between offset tiles", () => {
    const r = routeAll([rect("a", 0, 0), rect("b", 6, 6)], [{ id: "e", from: "a", to: "b" }]).get("e")!;
    expect(r.pts.length).toBeGreaterThanOrEqual(3);
    expect(isOrthogonal(r.pts)).toBe(true);
  });

  it("goes vertical when the tiles are stacked", () => {
    const r = routeAll([rect("a", 0, 0), rect("b", 0, 7)], [{ id: "e", from: "a", to: "b" }]).get("e")!;
    expect(r.fs).toBe("b");
    expect(r.ts).toBe("t");
  });

  it("routes around a tile that sits in the way", () => {
    const rects = [rect("a", 0, 0), rect("mid", 6, 0), rect("b", 12, 0)];
    const r = routeAll(rects, [{ id: "e", from: "a", to: "b" }]).get("e")!;
    expect(crosses(r.pts, rects[1])).toBe(false);
    expect(isOrthogonal(r.pts)).toBe(true);
    // it must still start on the edge of a and end on the edge of b
    const onEdge = (p: [number, number], t: Rect) => {
      const dx = Math.abs(p[0] - t.cx) - t.hw, dz = Math.abs(p[1] - t.cz) - t.hh;
      return Math.max(dx, dz) > -1e-6 && Math.max(dx, dz) < 0.1;
    };
    expect(onEdge(r.pts[0], rects[0])).toBe(true);
    expect(onEdge(r.pts[r.pts.length - 1], rects[2])).toBe(true);
  });

  it("spreads arrows that share one side of a tile into separate lanes", () => {
    const rects = [rect("a", 0, 0), rect("b", 6, -4), rect("c", 6, 4)];
    const routes = routeAll(rects, [
      { id: "e1", from: "a", to: "b" },
      { id: "e2", from: "a", to: "c" },
    ]);
    const z1 = routes.get("e1")!.pts[0][1];
    const z2 = routes.get("e2")!.pts[0][1];
    expect(Math.abs(z1 - z2)).toBeGreaterThan(0.1);
    expect(z1).toBeLessThan(z2); // the arrow heading north leaves from the north lane
  });

  it("keeps opposite arrows between the same pair apart", () => {
    const rects = [rect("a", 0, 0), rect("b", 6, 0)];
    const routes = routeAll(rects, [
      { id: "e1", from: "a", to: "b" },
      { id: "e2", from: "b", to: "a" },
    ]);
    expect(Math.abs(routes.get("e1")!.pts[0][1] - routes.get("e2")!.pts[0][1])).toBeGreaterThan(0.1);
  });

  it("ignores edges with missing endpoints and self loops", () => {
    const routes = routeAll([rect("a", 0, 0)], [
      { id: "x", from: "a", to: "ghost" },
      { id: "y", from: "a", to: "a" },
    ]);
    expect(routes.size).toBe(0);
  });
});

describe("geometry helpers", () => {
  it("rounds corners and keeps the end points", () => {
    const pts: [number, number][] = [[0, 0], [4, 0], [4, 4]];
    const rounded = roundPath(pts);
    expect(rounded[0]).toEqual([0, 0]);
    expect(rounded[rounded.length - 1]).toEqual([4, 4]);
    expect(rounded.length).toBeGreaterThan(3);
  });

  it("walks along a polyline by distance", () => {
    const pl = makePolyline([[0, 0], [4, 0], [4, 4]]);
    expect(pl.len).toBeCloseTo(8);
    expect(pointAt(pl, 2)).toEqual([2, 0]);
    expect(pointAt(pl, 6)).toEqual([4, 2]);
    expect(pointAt(pl, 99)).toEqual([4, 4]);
  });

  it("measures distance to a polyline", () => {
    expect(distanceTo([[0, 0], [4, 0]], [2, 3])).toBeCloseTo(3);
    expect(distanceTo([[0, 0], [4, 0]], [7, 0])).toBeCloseTo(3);
  });

  it("anchors labels in the middle of the longest segment when nothing is nearby", () => {
    const a = labelAnchor([[0, 0], [1, 0], [1, 10]]);
    expect(a.at).toEqual([1, 5]);
    expect(a.horizontal).toBe(false);
  });

  it("slides a label away from a tile that sits near the middle", () => {
    const line: [number, number][] = [[0, 0], [10, 0]];
    const free = labelAnchor(line);
    const crowded = labelAnchor(line, [[5, 0.6]]);
    expect(free.at[0]).toBeCloseTo(5);
    expect(Math.abs(crowded.at[0] - 5)).toBeGreaterThan(1);
  });

  it("keeps a second label away from one already placed", () => {
    const line: [number, number][] = [[0, 0], [10, 0]];
    const second = labelAnchor(line, [], [[5, 0]]);
    expect(Math.abs(second.at[0] - 5)).toBeGreaterThan(1.5);
  });
});
