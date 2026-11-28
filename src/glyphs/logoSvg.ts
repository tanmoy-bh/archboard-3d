import type { BrandKey } from "../model/brandKeys";
import { BRAND_LOGOS } from "./brandLogos";

/** The logo as a nested drawing, fitted inside a w x h area whose top left corner is (x, y). */
export function logoMarkup(key: BrandKey, x: number, y: number, w: number, h: number): string {
  const logo = BRAND_LOGOS[key];
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${logo.w} ${logo.h}" preserveAspectRatio="xMidYMid meet" overflow="visible">${logo.body}</svg>`;
}

/**
 * The flat version of a tool: its colour logo on a light rounded badge, so dark logos read in both themes.
 * A logo that is already a square tile is shown as it is. `size` is the width of the square it fills.
 */
export function flatLogo(key: BrandKey, cx: number, cy: number, size: number): string {
  const left = cx - size / 2, top = cy - size / 2;
  if (BRAND_LOGOS[key].tile) return logoMarkup(key, left, top, size, size);
  const pad = size * 0.14;
  return (
    `<rect x="${left}" y="${top}" width="${size}" height="${size}" rx="${size * 0.2}" fill="#f7f8fa" stroke="#8b93a3" stroke-width="${size * 0.022}"/>` +
    logoMarkup(key, left + pad, top + pad, size - 2 * pad, size - 2 * pad)
  );
}
