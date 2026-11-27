/**
 * Where a screen point falls on the board's canvas, as fractions across (u) and down (v) it. A phone held upright
 * can show the board turned a quarter turn clockwise to use the screen in landscape: then the canvas's width runs
 * down the screen and its height from right to left. `r` is the canvas's box as it appears on screen.
 */
export function canvasFraction(r: { left: number; top: number; right: number; width: number; height: number }, x: number, y: number, turned: boolean): { u: number; v: number } {
  return turned
    ? { u: (y - r.top) / r.height, v: (r.right - x) / r.width }
    : { u: (x - r.left) / r.width, v: (y - r.top) / r.height };
}
