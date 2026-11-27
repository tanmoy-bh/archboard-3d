import { describe, expect, it } from "vitest";
import { sidewaysScroll } from "../src/interaction/wheel";
import { FRUSTUM_H, SP, ZONE_PICK_BAND, ZONE_PICK_PX, zonePickReach } from "../src/scene/constants";

describe("grabbing a zone by its outline", () => {
  /** How wide the grab area is on screen, in pixels, to each side of the outline. */
  const onScreen = (zoom: number, height: number) => zonePickReach(zoom, height) * ((height * zoom) / FRUSTUM_H);

  it("never gets wider on screen as you zoom in, so empty floor stays free for dragging the board", () => {
    for (const zoom of [0.6, 1, 2, 4]) expect(onScreen(zoom, 700), `zoom ${zoom}`).toBeLessThanOrEqual(ZONE_PICK_PX + 1e-9);
  });

  it("stays wide enough to hit", () => {
    expect(onScreen(1, 700)).toBeCloseTo(ZONE_PICK_PX, 6);
  });

  it("is no wider on the floor than before when zoomed far out", () => {
    expect(zonePickReach(0.1, 700)).toBeCloseTo(ZONE_PICK_BAND * SP, 9);
  });
});

describe("the mouse wheel", () => {
  const wheel = (o: Partial<WheelEvent>) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o }) as WheelEvent;

  it("scrolls the board sideways on a side scroll", () => {
    expect(sidewaysScroll(wheel({ deltaX: 40 }))).toBe(40);
    expect(sidewaysScroll(wheel({ deltaX: -40, deltaY: 5 }))).toBe(-40);
  });

  it("scrolls sideways with Shift and the ordinary wheel", () => {
    expect(sidewaysScroll(wheel({ deltaY: 100, shiftKey: true }))).toBe(100);
    expect(sidewaysScroll(wheel({ deltaX: 100, shiftKey: true }))).toBe(100); // macOS swaps the axis itself
  });

  it("leaves an up or down scroll to zoom, even with a little sideways jitter", () => {
    expect(sidewaysScroll(wheel({ deltaY: 100 }))).toBe(0);
    expect(sidewaysScroll(wheel({ deltaX: 3, deltaY: -100 }))).toBe(0);
  });

  it("never takes over a pinch or a Ctrl or Cmd zoom", () => {
    expect(sidewaysScroll(wheel({ deltaX: 40, ctrlKey: true }))).toBe(0);
    expect(sidewaysScroll(wheel({ deltaX: 40, metaKey: true }))).toBe(0);
  });

  it("turns line steps into pixels", () => {
    expect(sidewaysScroll(wheel({ deltaX: 3, deltaMode: 1 }))).toBe(48);
  });
});
