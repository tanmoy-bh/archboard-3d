import { GIFEncoder, applyPalette, quantize } from "gifenc";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Encode RGBA frames as an endlessly looping animated GIF. One 256 colour palette is built from a few
 * frames spread through the clip and shared by all of them, which keeps the file small and stops the
 * colours from flickering between frames. `onProgress` runs after each frame, and the encoder yields to
 * the browser between frames so the page stays responsive.
 */
export async function encodeGif(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  fps: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (frames.length === 0) throw new Error("There are no frames to encode.");
  const picks = [...new Set([0, Math.floor(frames.length / 3), Math.floor((2 * frames.length) / 3)])].map((i) => frames[i]);
  const sample = new Uint8ClampedArray(picks.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of picks) { sample.set(f, at); at += f.length; }
  const palette = quantize(sample, 256);

  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames.length; i++) {
    gif.writeFrame(applyPalette(frames[i], palette), width, height, i === 0 ? { palette, delay, repeat: 0 } : { delay });
    onProgress?.(i + 1, frames.length);
    await tick();
  }
  gif.finish();
  return gif.bytes();
}
