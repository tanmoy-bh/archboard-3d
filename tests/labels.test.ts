import { describe, expect, it } from "vitest";
import { ELEVATION } from "../src/scene/constants";
import { placeLabels } from "../src/scene/labels";

const AZ = Math.PI / 4;

describe("placeLabels", () => {
  it("puts a lone label in the middle of its segment", () => {
    const m = placeLabels(AZ, ELEVATION, [], [{ id: "e", pts: [[0, 0], [10, 0]], pillW: 1.2, pillH: 0.4, badge: false }]);
    expect(m.get("e")!.at[0]).toBeCloseTo(5);
  });

  it("slides a label off a tile name that would be covered", () => {
    // A tile whose name hangs where the middle of the arrow is.
    const tiles = [{ cx: 5, cz: 0, labelW: 2, labelH: 0.5 }];
    const free = placeLabels(AZ, ELEVATION, [], [{ id: "e", pts: [[0, 0], [10, 0]], pillW: 1.2, pillH: 0.4, badge: false }]);
    const crowded = placeLabels(AZ, ELEVATION, tiles, [{ id: "e", pts: [[0, 0], [10, 0]], pillW: 1.2, pillH: 0.4, badge: false }]);
    expect(Math.abs(crowded.get("e")!.at[0] - free.get("e")!.at[0])).toBeGreaterThan(0.5);
  });

  it("keeps two pills on the same line apart on screen", () => {
    // Looking straight along z (azimuth 0) the x axis runs left to right, so overlap is easy to reason about.
    const pts: [number, number][] = [[0, 0], [10, 0]];
    const m = placeLabels(0, ELEVATION, [], [
      { id: "a", pts, pillW: 1.6, pillH: 0.4, badge: false },
      { id: "b", pts, pillW: 1.6, pillH: 0.4, badge: false },
    ]);
    expect(Math.abs(m.get("a")!.at[0] - m.get("b")!.at[0])).toBeGreaterThanOrEqual(1.6);
  });

  it("keeps a pill off the footprint of a tile on its line", () => {
    const tiles = [{ cx: 5, cz: 0, labelW: 2, labelH: 0.5 }];
    const m = placeLabels(0, ELEVATION, tiles, [{ id: "e", pts: [[0, 0], [10, 0]], pillW: 1.2, pillH: 0.4, badge: false }]);
    expect(Math.abs(m.get("e")!.at[0] - 5)).toBeGreaterThan(1.5);
  });

  it("skips arrows with neither a label nor a badge", () => {
    const m = placeLabels(AZ, ELEVATION, [], [{ id: "e", pts: [[0, 0], [10, 0]], pillW: 0, pillH: 0, badge: false }]);
    expect(m.has("e")).toBe(false);
  });
});
