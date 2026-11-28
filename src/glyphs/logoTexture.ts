import { BrandKey, isBrandKey } from "../model/brandKeys";
import { IconKey, iconKeysOf } from "../model/types";
import { BRAND_LOGOS } from "./brandLogos";

export interface LogoImage {
  canvas: HTMLCanvasElement;
  /** Resolves once the logo has been drawn on the canvas (also if it could not be). */
  ready: Promise<void>;
}

const LONG_SIDE = 384;
const cache = new Map<BrandKey, LogoImage>();

/** The logo drawn on a canvas, for use as a 3D texture. The browser draws the SVG, so gradients and masks survive. */
export function logoImage(key: BrandKey): LogoImage {
  const hit = cache.get(key);
  if (hit) return hit;
  const logo = BRAND_LOGOS[key];
  const scale = LONG_SIDE / Math.max(logo.w, logo.h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(logo.w * scale));
  canvas.height = Math.max(1, Math.round(logo.h * scale));
  const ready = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${logo.w} ${logo.h}" width="${canvas.width}" height="${canvas.height}">${logo.body}</svg>`,
    );
  });
  const entry = { canvas, ready };
  cache.set(key, entry);
  return entry;
}

/** Resolves once every tool logo on the board has been drawn, so a saved picture has no blank boxes. */
export async function logosReady(
  nodes: readonly { icon: IconKey; also?: BrandKey[] }[],
  load: (key: BrandKey) => { ready: Promise<void> } = logoImage,
): Promise<void> {
  const keys = new Set(nodes.flatMap(iconKeysOf).filter(isBrandKey));
  await Promise.all([...keys].map((k) => load(k).ready));
}
