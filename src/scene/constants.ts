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

export const gridToWorld = (g: number): number => g * SP;
export const worldToGrid = (w: number): number => w / SP;
