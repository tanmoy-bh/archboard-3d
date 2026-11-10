import { describe, expect, it } from "vitest";
import { encodeGif } from "../src/export/gif";

function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([r, g, b, 255], i * 4);
  return px;
}

describe("GIF export", () => {
  it("writes a looping GIF with one image per frame", async () => {
    const frames = [solid(8, 6, 255, 0, 0), solid(8, 6, 0, 255, 0), solid(8, 6, 0, 0, 255), solid(8, 6, 255, 255, 0)];
    const seen: number[] = [];
    const bytes = await encodeGif(frames, 8, 6, 12, (done) => seen.push(done));
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("GIF89a");
    expect(bytes[bytes.length - 1]).toBe(0x3b); // trailer
    expect(bytes[6] | (bytes[7] << 8)).toBe(8); // logical screen width
    expect(bytes[8] | (bytes[9] << 8)).toBe(6); // logical screen height
    let images = 0;
    for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) images++; // graphic control extensions
    expect(images).toBe(frames.length);
    expect(String.fromCharCode(...bytes)).toContain("NETSCAPE2.0"); // loop forever
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("refuses an empty clip", async () => {
    await expect(encodeGif([], 8, 6, 12)).rejects.toThrow();
  });
});
