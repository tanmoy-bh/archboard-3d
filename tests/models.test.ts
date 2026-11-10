import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ICON_NAMES, PALETTE_GROUPS } from "../src/glyphs/catalog";
import { createGlyph, disposeGlyph } from "../src/glyphs/models";
import { ICON_KEYS } from "../src/model/types";

describe("3D glyph models", () => {
  it("builds a real 3D model for every glyph", () => {
    for (const key of ICON_KEYS) {
      const g = createGlyph(key);
      let meshes = 0;
      g.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes, `${key} should be made of geometry`).toBeGreaterThanOrEqual(2);
      disposeGlyph(g);
    }
  });

  it("makes every model solid: it has volume in all three dimensions", () => {
    for (const key of ICON_KEYS) {
      const g = createGlyph(key);
      g.group.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(g.group, true).getSize(new THREE.Vector3());
      expect(size.x, `${key} width`).toBeGreaterThan(0.25);
      expect(size.y, `${key} height`).toBeGreaterThan(0.25);
      expect(size.z, `${key} depth`).toBeGreaterThan(0.1);
      disposeGlyph(g);
    }
  });

  it("stands every model on the tile and keeps it a sensible size", () => {
    for (const key of ICON_KEYS) {
      const g = createGlyph(key);
      g.tick?.(0.4);
      g.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.group, true);
      const size = box.getSize(new THREE.Vector3());
      expect(box.min.y, `${key} should not sink into the tile`).toBeGreaterThan(-0.05);
      expect(size.y, `${key} height`).toBeLessThan(1.7);
      expect(Math.max(size.x, size.z), `${key} footprint fits the 1.5 wide tile`).toBeLessThan(1.7);
      disposeGlyph(g);
    }
  });

  it("gives every model its own geometry so removing one tile never affects another", () => {
    const a = createGlyph("db"), b = createGlyph("db");
    const geos = (g: ReturnType<typeof createGlyph>) => { const s = new Set<THREE.BufferGeometry>(); g.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) s.add(m.geometry); }); return s; };
    const ga = geos(a), gb = geos(b);
    expect([...ga].some((x) => gb.has(x))).toBe(false);
    disposeGlyph(a);
    expect(gb.size).toBeGreaterThan(0);
    disposeGlyph(b);
  });

  it("offers every glyph in the palette exactly once, with a name", () => {
    const listed = PALETTE_GROUPS.flatMap((g) => g.icons);
    expect([...listed].sort()).toEqual([...ICON_KEYS].sort());
    for (const key of ICON_KEYS) expect(ICON_NAMES[key].length).toBeGreaterThan(1);
  });
});
