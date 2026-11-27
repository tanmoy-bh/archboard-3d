import { describe, expect, it } from "vitest";
import { canvasFraction } from "../src/scene/turned";

describe("pointing at a board turned a quarter turn", () => {
  // A 800 by 400 canvas turned clockwise on a 400 by 800 portrait screen: on screen it is 400 wide and 800 tall.
  const turned = { left: 0, top: 0, right: 400, width: 400, height: 800 };

  it("reads an upright canvas as it is", () => {
    expect(canvasFraction({ left: 10, top: 20, right: 210, width: 200, height: 100 }, 60, 95, false)).toEqual({ u: 0.25, v: 0.75 });
  });

  it("puts the canvas's top left corner at the top right of the screen", () => {
    expect(canvasFraction(turned, 400, 0, true)).toEqual({ u: 0, v: 0 });
  });

  it("runs the canvas's width down the screen and its height from right to left", () => {
    expect(canvasFraction(turned, 300, 600, true)).toEqual({ u: 0.75, v: 0.25 });
  });
});
