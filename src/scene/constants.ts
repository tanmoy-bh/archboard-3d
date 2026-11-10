/** World scale. One grid cell is SP world units; a tile is TILE wide. */
export const SP = 3.8;
export const TILE = 1.5;
export const HALF = TILE / 2;
export const SLAB_H = 0.24;
/** Height at which connectors lie above the floor. */
export const EDGE_Y = 0.07;
/** World units per CSS pixel for text and glyph sprites (at zoom 1). */
export const PXW = 0.0185;
/** Visible world height at zoom 1. */
export const FRUSTUM_H = 16;
/** Camera tilt above the ground: the classic isometric angle. */
export const ELEVATION = Math.atan(1 / Math.SQRT2);
/** Screen-space gap between a tile's centre and the top of its name label, in world units. */
export const LABEL_DROP = (TILE / 2) * Math.SQRT2 * Math.sin(ELEVATION) + 0.12;

/**
 * "3d" is the isometric board with 3D models. "2d" is a flat, straight-down board with the original
 * 2D glyphs, like a classic diagramming tool.
 */
export type ViewMode = "3d" | "2d";

/** Straight down, a hair short of vertical so the camera's up vector stays well defined. */
export const ELEVATION_2D = Math.PI / 2 - 0.002;
export const elevationOf = (mode: ViewMode): number => (mode === "3d" ? ELEVATION : ELEVATION_2D);

/** How much screen space a tile takes in each mode, used to keep arrow labels off tiles and names. */
export interface LabelMetrics { tileHalfW: number; tileBelow: number; glyphAbove: number; labelDrop: number }
export const METRICS: Record<ViewMode, LabelMetrics> = {
  // a square tile seen as a diamond, with a model standing on it
  "3d": { tileHalfW: 1.06, tileBelow: 0.62, glyphAbove: 1.45, labelDrop: LABEL_DROP },
  // a square tile seen from above, with the glyph lying inside it
  "2d": { tileHalfW: TILE / 2 + 0.05, tileBelow: TILE / 2 + 0.05, glyphAbove: TILE / 2 + 0.05, labelDrop: TILE / 2 + 0.14 },
};

export const gridToWorld = (g: number): number => g * SP;
export const worldToGrid = (w: number): number => w / SP;

/**
 * The camera azimuth to use after switching to `mode`: the nearest quarter turn for the flat 2D board
 * (so the grid is axis aligned) or the nearest diagonal for the isometric 3D board.
 *
 * Switching must never accumulate rotation: 3D -> 2D -> 3D returns to exactly the starting azimuth, and
 * each switch moves the camera by exactly 45 degrees. The tolerance absorbs floating point error from
 * repeated quarter turns, which would otherwise tip a tie the wrong way and spin the board.
 */
export function snapAzimuth(az: number, mode: ViewMode): number {
  const q = Math.PI / 2, eps = 1e-6;
  const snapped = mode === "2d"
    ? Math.ceil(az / q - 0.5 - eps) * q
    : Math.round((az - q / 2) / q + eps) * q + q / 2;
  return snapped + 0; // turns -0 into 0, which would otherwise not survive serialisation
}
