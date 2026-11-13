import { describe, expect, it } from "vitest";
import { ELEVATION, ELEVATION_2D, METRICS } from "../src/scene/constants";
import { ZoneLabelSpec, ZoneObstacles, placeZoneLabels } from "../src/scene/zoneLabels";

const none: ZoneObstacles = { tiles: [], pills: [], routes: [], texts: [] };
const zone = (id: string, x0: number, z0: number, x1: number, z1: number, w = 3, h = 0.4): ZoneLabelSpec => ({ id, x0, z0, x1, z1, w, h });
const proj = (az: number, e: number, x: number, z: number): [number, number] => [x * Math.cos(az) - z * Math.sin(az), -Math.sin(e) * (x * Math.sin(az) + z * Math.cos(az))];

/** The name's box on screen, from its ground centre. */
const box = (az: number, e: number, at: [number, number], w: number, h: number) => {
  const [r, u] = proj(az, e, at[0], at[1]);
  return { x0: r - w / 2, x1: r + w / 2, y0: u - h / 2, y1: u + h / 2 };
};
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

describe("placeZoneLabels", () => {
  it("puts the name of a lone zone inside it, at the top, when there is room", () => {
    for (const az of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4]) {
      const p = placeZoneLabels(az, ELEVATION, [zone("z", 0, 0, 20, 20)], none).get("z")!;
      expect(p.side).toBe("inside");
      expect(p.cost).toBe(0);
    }
  });

  it("keeps an inside name fully inside the zone on screen", () => {
    const az = Math.PI / 4;
    const z = zone("z", 0, 0, 20, 14, 4, 0.45);
    const p = placeZoneLabels(az, ELEVATION, [z], none).get("z")!;
    const b = box(az, ELEVATION, p.at, z.w, z.h);
    const corners = [[z.x0, z.z0], [z.x1, z.z0], [z.x1, z.z1], [z.x0, z.z1]].map(([x, y]) => proj(az, ELEVATION, x, y));
    const [minR, maxR] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
    const [minU, maxU] = [Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1]))];
    expect(b.x0).toBeGreaterThan(minR); expect(b.x1).toBeLessThan(maxR);
    expect(b.y0).toBeGreaterThan(minU); expect(b.y1).toBeLessThan(maxU);
  });

  it("moves the name outside, to a free side, when the zone is too small to hold it", () => {
    const p = placeZoneLabels(Math.PI / 4, ELEVATION, [zone("z", 0, 0, 4, 4, 6, 0.5)], none).get("z")!;
    expect(p.side).not.toBe("inside");
    expect(p.cost).toBe(0);
  });

  it("works in the flat 2D view, where the zone is an axis aligned rectangle", () => {
    const p = placeZoneLabels(Math.PI / 2, ELEVATION_2D, [zone("z", 0, 0, 20, 12)], none, METRICS["2d"]).get("z")!;
    expect(p.side).toBe("inside");
    expect(Number.isFinite(p.at[0]) && Number.isFinite(p.at[1])).toBe(true);
  });

  it("steers away from a tile sitting where the name would go", () => {
    const az = Math.PI / 4, z = zone("z", 0, 0, 20, 20);
    const free = placeZoneLabels(az, ELEVATION, [z], none).get("z")!;
    const tile = { cx: free.at[0], cz: free.at[1], labelW: 2, labelH: 0.4 };
    const crowded = placeZoneLabels(az, ELEVATION, [z], { ...none, tiles: [tile] }).get("z")!;
    const a = box(az, ELEVATION, crowded.at, z.w, z.h);
    const [r, u] = proj(az, ELEVATION, tile.cx, tile.cz);
    const t = { x0: r - METRICS["3d"].tileHalfW, x1: r + METRICS["3d"].tileHalfW, y0: u - METRICS["3d"].tileBelow, y1: u + METRICS["3d"].glyphAbove };
    expect(overlaps(a, t)).toBe(false);
  });

  it("steers away from an arrow label", () => {
    const az = Math.PI / 4, z = zone("z", 0, 0, 20, 20);
    const free = placeZoneLabels(az, ELEVATION, [z], none).get("z")!;
    const pill = { at: free.at, w: 1.6, h: 0.4 };
    const moved = placeZoneLabels(az, ELEVATION, [z], { ...none, pills: [pill] }).get("z")!;
    expect(overlaps(box(az, ELEVATION, moved.at, z.w, z.h), box(az, ELEVATION, pill.at, pill.w, pill.h))).toBe(false);
  });

  it("prefers a spot that no arrow crosses", () => {
    const az = Math.PI / 4, z = zone("z", 0, 0, 20, 20);
    const free = placeZoneLabels(az, ELEVATION, [z], none).get("z")!;
    const b = box(az, ELEVATION, free.at, z.w, z.h);
    // an arrow running straight through the free spot, expressed on the ground
    const c = Math.cos(az), s = Math.sin(az), se = Math.sin(ELEVATION);
    const ground = (r: number, u: number): [number, number] => { const q = -u / se; return [r * c + q * s, -r * s + q * c]; };
    const route = [ground(b.x0 - 1, (b.y0 + b.y1) / 2), ground(b.x1 + 1, (b.y0 + b.y1) / 2)];
    const moved = placeZoneLabels(az, ELEVATION, [z], { ...none, routes: [route] }).get("z")!;
    expect(moved.at).not.toEqual(free.at);
  });

  it("keeps the names of neighbouring zones apart and off each other's zone", () => {
    const az = Math.PI / 4;
    const zs = [zone("a", 0, 0, 10, 10, 4, 0.45), zone("b", 10.5, 0, 20.5, 10, 4, 0.45), zone("c", 0, 10.5, 10, 20.5, 4, 0.45), zone("d", 10.5, 10.5, 20.5, 20.5, 4, 0.45)];
    const m = placeZoneLabels(az, ELEVATION, zs, none);
    const boxes = zs.map((z) => box(az, ELEVATION, m.get(z.id)!.at, z.w, z.h));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i} and ${j}`).toBe(false);
  });

  it("gives a zone with no name a harmless spot", () => {
    const p = placeZoneLabels(0, ELEVATION, [zone("z", 0, 0, 5, 5, 0, 0)], none).get("z")!;
    expect(p.cost).toBe(0);
  });

  it("is deterministic", () => {
    const zs = [zone("a", 0, 0, 12, 9), zone("b", 12.5, 0, 24, 9)];
    expect(placeZoneLabels(1, ELEVATION, zs, none)).toEqual(placeZoneLabels(1, ELEVATION, zs, none));
  });
});
