import { beforeEach, describe, expect, it } from "vitest";
import { Controller } from "../src/interaction/controller";
import { Store } from "../src/model/store";
import { emptyDoc } from "../src/model/types";
import { SP } from "../src/scene/constants";
import type { SceneView } from "../src/scene/sceneView";

/** 50 screen pixels are one grid cell, so a component at cell (2, 2) sits under the screen point (100, 100). */
const PX = 50;

function setup(): { store: Store; controller: Controller; zooms: number[]; pans: number[][]; fire: (type: string, id: number, x: number, y: number, pointerType?: string) => void } {
  const doc = emptyDoc();
  doc.nodes.push({ id: "a", icon: "svc", gx: 2, gy: 2, label: "A" });
  doc.zones.push({ id: "z", gx: 6, gy: 6, w: 4, h: 4, label: "Zone", color: "#5aa9ff" });
  const store = new Store(doc);
  const listeners = new Map<string, (e: unknown) => void>();
  const zooms: number[] = [], pans: number[][] = [];
  const canvas = {
    style: {},
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => false,
  };
  const view = {
    canvas,
    holdRotation: () => {}, showGhost: () => {}, showRubber: () => {}, setHover: () => {},
    groundPoint: (x: number, y: number) => ({ x: (x / PX) * SP, z: (y / PX) * SP }),
    pickNode: (x: number, y: number) => store.doc.nodes.find((n) => Math.hypot(x - n.gx * PX, y - n.gy * PX) < PX / 2)?.id ?? null,
    pickText: () => null, pickEdge: () => null, pickZone: () => null, pickZoneCorner: () => null,
    zoomAt: (_x: number, _y: number, factor: number) => zooms.push(factor),
    panScreen: (...a: number[]) => pans.push(a),
  };
  const controller = new Controller(view as unknown as SceneView, store);
  const fire = (type: string, id: number, x: number, y: number, pointerType = "touch") =>
    listeners.get(type)!({ pointerId: id, pointerType, clientX: x, clientY: y, button: 0, shiftKey: false, altKey: false });
  return { store, controller, zooms, pans, fire };
}

const at = (s: Store, id = "a") => [s.node(id)!.gx, s.node(id)!.gy];

beforeEach(() => { (globalThis as { window?: unknown }).window ??= { addEventListener: () => {} }; });

describe("touch gestures in the editor", () => {
  it("a one finger drag over a component that is not selected moves the board, not the component", () => {
    const t = setup();
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointermove", 1, 200, 100);
    t.fire("pointerup", 1, 200, 100);
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.pans.length).toBeGreaterThan(0);
    expect(t.store.selection.size).toBe(0);
    expect(t.store.canUndo).toBe(false);
  });

  it("two fingers zoom by how far apart they move, and edit nothing", () => {
    const t = setup();
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointerdown", 2, 200, 100);
    t.fire("pointermove", 2, 300, 100);
    t.fire("pointerup", 2, 300, 100);
    t.fire("pointerup", 1, 100, 100);
    expect(t.zooms).toEqual([2]);
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.store.selection.size).toBe(0);
    expect(t.store.canUndo).toBe(false);
  });

  it("puts a component back when a second finger arrives after the first had started to move it", () => {
    const t = setup();
    t.store.select(["a"]);
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointermove", 1, 200, 100);
    expect(at(t.store)).not.toEqual([2, 2]);
    t.fire("pointerdown", 2, 300, 300);
    t.fire("pointermove", 2, 350, 350);
    t.fire("pointerup", 1, 200, 100);
    t.fire("pointerup", 2, 350, 350);
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.store.canUndo).toBe(false);
    expect(t.zooms.length).toBeGreaterThan(0);
  });

  it("only moves the board with the finger left over after a pinch", () => {
    const t = setup();
    t.store.select(["a"]);
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointerdown", 2, 200, 200);
    t.fire("pointerup", 2, 200, 200);
    const before = t.pans.length;
    t.fire("pointermove", 1, 250, 100);
    t.fire("pointerup", 1, 250, 100);
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.pans.length).toBe(before + 1);
  });

  it("a tap selects, and a drag on the selected component then moves it as one undo step", () => {
    const t = setup();
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointermove", 1, 103, 102); // a finger is never perfectly still
    t.fire("pointerup", 1, 103, 102);
    expect([...t.store.selection]).toEqual(["a"]);
    expect(at(t.store)).toEqual([2, 2]);
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointermove", 1, 200, 100);
    t.fire("pointerup", 1, 200, 100);
    expect(at(t.store)).toEqual([4, 2]);
    t.store.undo();
    expect(at(t.store)).toEqual([2, 2]);
  });

  it("puts things back when the system cancels the touch", () => {
    const t = setup();
    t.store.select(["a"]);
    t.fire("pointerdown", 1, 100, 100);
    t.fire("pointermove", 1, 200, 100);
    t.fire("pointercancel", 1, 200, 100);
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.store.canUndo).toBe(false);
  });

  it("places a picked component on a tap, never during a pinch", () => {
    const t = setup();
    t.controller.arm("svc");
    t.fire("pointerdown", 1, 400, 100);
    t.fire("pointerdown", 2, 500, 100);
    t.fire("pointerup", 1, 400, 100);
    t.fire("pointerup", 2, 500, 100);
    expect(t.store.doc.nodes).toHaveLength(1);
    t.fire("pointerdown", 1, 400, 100);
    t.fire("pointerup", 1, 400, 100);
    expect(t.store.doc.nodes).toHaveLength(2);
  });

  it("edits nothing while viewing only, by finger or mouse", () => {
    const t = setup();
    t.store.select(["a"]);
    t.controller.viewOnly = true;
    for (const kind of ["touch", "mouse"]) {
      t.fire("pointerdown", 1, 100, 100, kind);
      t.fire("pointermove", 1, 250, 100, kind);
      t.fire("pointerup", 1, 250, 100, kind);
    }
    expect(at(t.store)).toEqual([2, 2]);
    expect(t.pans.length).toBeGreaterThan(1);
    expect(t.store.canUndo).toBe(false);
  });

  it("leaves mouse dragging as it was", () => {
    const t = setup();
    t.fire("pointerdown", 1, 100, 100, "mouse");
    t.fire("pointermove", 1, 200, 100, "mouse");
    t.fire("pointerup", 1, 200, 100, "mouse");
    expect(at(t.store)).toEqual([4, 2]);
  });

  it("lets a zone resize be undone", () => {
    const t = setup();
    t.store.select(["z"]);
    (t.controller as unknown as { view: { pickZoneCorner: () => number } }).view.pickZoneCorner = () => 3;
    t.fire("pointerdown", 1, 500, 500, "mouse");
    t.fire("pointermove", 1, 600, 600, "mouse");
    t.fire("pointerup", 1, 600, 600, "mouse");
    expect(t.store.zone("z")!.w).toBe(6);
    t.store.undo();
    expect(t.store.zone("z")!.w).toBe(4);
  });
});
