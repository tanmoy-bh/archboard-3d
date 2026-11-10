import { describe, expect, it } from "vitest";
import { ICONS, iconSvg } from "../src/glyphs/flatIcons";
import { ELEVATION, ELEVATION_2D, METRICS, elevationOf, snapAzimuth } from "../src/scene/constants";
import { placeLabels } from "../src/scene/labels";
import { ICON_KEYS } from "../src/model/types";

describe("2D glyphs", () => {
  it("has a flat drawing for every component type", () => {
    expect(Object.keys(ICONS).sort()).toEqual([...ICON_KEYS].sort());
    for (const key of ICON_KEYS) {
      const svg = iconSvg(key, "#e7e3d9", 64);
      expect(svg.startsWith("<svg"), key).toBe(true);
      expect(svg.length, key).toBeGreaterThan(120);
    }
  });
});

describe("view modes", () => {
  it("looks straight down in 2D and at the isometric angle in 3D", () => {
    expect(elevationOf("3d")).toBe(ELEVATION);
    expect(elevationOf("2d")).toBe(ELEVATION_2D);
    expect(ELEVATION_2D).toBeGreaterThan(Math.PI / 2 - 0.01);
    expect(ELEVATION_2D).toBeLessThan(Math.PI / 2);
  });

  it("uses the full square footprint of a tile in 2D", () => {
    expect(METRICS["2d"].tileHalfW).toBeCloseTo(0.8, 1);
    expect(METRICS["2d"].labelDrop).toBeGreaterThan(METRICS["2d"].tileBelow);
  });

  it("keeps pills off a tile and its name in the flat view", () => {
    const tiles = [{ cx: 5, cz: 0, labelW: 2, labelH: 0.5 }];
    const spec = [{ id: "e", pts: [[0, 0], [10, 0]] as [number, number][], pillW: 1.2, pillH: 0.4, badge: false }];
    const m = placeLabels(0, ELEVATION_2D, tiles, spec, METRICS["2d"]);
    expect(Math.abs(m.get("e")!.at[0] - 5)).toBeGreaterThan(1.4);
  });
});

describe("switching between 2D and 3D never spins the board", () => {
  const q = Math.PI / 2;
  const diag = (k: number) => Math.PI / 4 + k * q; // 3D azimuths

  it("returns to exactly the starting view after 3D -> 2D -> 3D, from every quarter turn", () => {
    for (let k = -8; k <= 8; k++) {
      const start = diag(k);
      const flat = snapAzimuth(start, "2d");
      const back = snapAzimuth(flat, "3d");
      expect(back, `k=${k}`).toBeCloseTo(start, 9);
    }
  });

  it("returns to exactly the starting view after 2D -> 3D -> 2D", () => {
    for (let k = -8; k <= 8; k++) {
      const start = k * q;
      expect(snapAzimuth(snapAzimuth(start, "3d"), "2d"), `k=${k}`).toBeCloseTo(start, 9);
    }
  });

  it("moves the camera by exactly 45 degrees per switch, never 90", () => {
    for (let k = -8; k <= 8; k++) {
      expect(Math.abs(snapAzimuth(diag(k), "2d") - diag(k)), `3D->2D k=${k}`).toBeCloseTo(Math.PI / 4, 9);
      expect(Math.abs(snapAzimuth(k * q, "3d") - k * q), `2D->3D k=${k}`).toBeCloseTo(Math.PI / 4, 9);
    }
  });

  it("is not thrown off by floating point error from rotating with Q and E", () => {
    // Build the azimuth the way the app does: by adding quarter turns again and again.
    for (const dir of [1, -1]) {
      let az = Math.PI / 4;
      for (let i = 0; i < 40; i++) {
        az += dir * q;
        const flat = snapAzimuth(az, "2d");
        expect(Math.abs(flat - az), `step ${i}`).toBeCloseTo(Math.PI / 4, 6);
        expect(snapAzimuth(flat, "3d"), `step ${i}`).toBeCloseTo(az, 6);
      }
    }
  });

  it("does not drift over many repeated switches", () => {
    let az = Math.PI / 4;
    for (let i = 0; i < 200; i++) az = snapAzimuth(snapAzimuth(az, "2d"), "3d");
    expect(az).toBeCloseTo(Math.PI / 4, 9);
  });

  it("opens the 2D board with columns running left to right from the default view", () => {
    expect(snapAzimuth(Math.PI / 4, "2d")).toBeCloseTo(0, 9);
  });

  it("never returns negative zero", () => {
    expect(Object.is(snapAzimuth(Math.PI / 4, "2d"), 0)).toBe(true);
    expect(Object.is(snapAzimuth(0, "2d"), 0)).toBe(true);
  });
});
