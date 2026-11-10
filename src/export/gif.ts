import { GIFEncoder, Palette, applyPalette, quantize } from "gifenc";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Build one 256 colour palette from a few RGBA frames spread through the clip. */
export function makePalette(samples: Uint8ClampedArray[]): Palette {
  if (samples.length === 0) throw new Error("There are no frames to encode.");
  const sample = new Uint8ClampedArray(samples.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of samples) { sample.set(f, at); at += f.length; }
  return quantize(sample, 256);
}

/** Convert an RGBA frame to palette indices, a quarter of the memory of the raw pixels. */
export const indexFrame = (rgba: Uint8ClampedArray, palette: Palette): Uint8Array => applyPalette(rgba, palette);

/**
 * Write palette-indexed frames as an endlessly looping animated GIF. All frames share the one palette,
 * which keeps the file small and stops colours flickering. The encoder yields to the browser between
 * frames so the page stays responsive, and `onProgress` runs after each one.
 */
export async function writeGif(
  frames: Uint8Array[],
  palette: Palette,
  width: number,
  height: number,
  fps: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (frames.length === 0) throw new Error("There are no frames to encode.");
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames.length; i++) {
    gif.writeFrame(frames[i], width, height, i === 0 ? { palette, delay, repeat: 0 } : { delay });
    onProgress?.(i + 1, frames.length);
    if (i % 8 === 7) await tick();
  }
  gif.finish();
  return gif.bytes();
}

/** Convenience for whole clips held as RGBA frames: palette from three spread frames, then write. */
export async function encodeGif(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  fps: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (frames.length === 0) throw new Error("There are no frames to encode.");
  const picks = [...new Set([0, Math.floor(frames.length / 3), Math.floor((2 * frames.length) / 3)])].map((i) => frames[i]);
  const palette = makePalette(picks);
  return writeGif(frames.map((f) => indexFrame(f, palette)), palette, width, height, fps, onProgress);
}
