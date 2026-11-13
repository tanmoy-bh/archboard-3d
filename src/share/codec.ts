import { parseDoc } from "../model/serialize";
import type { DocData } from "../model/types";

/** The most a packed link may inflate to. A guard against a link made to blow up in memory. */
export const MAX_UNPACKED_BYTES = 4 * 1024 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function run(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); throw new Error("This link holds more data than the viewer will open."); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** The text of a board as it goes into a link. `shareId` belongs to the editor's bookkeeping, not to the picture. */
export function boardText(doc: DocData): string {
  const { shareId: _ignored, ...rest } = doc;
  return JSON.stringify(rest);
}

/** Compress a board into a short URL safe string (raw deflate, then base64url). */
export async function packDoc(doc: DocData): Promise<string> {
  if (typeof CompressionStream === "undefined") throw new Error("This browser cannot make share links. Use Publish, or a newer browser.");
  return toBase64Url(await run(new TextEncoder().encode(boardText(doc)), new CompressionStream("deflate-raw")));
}

/** The reverse of packDoc. Throws a readable error for anything that is not a board. */
export async function unpackDoc(packed: string): Promise<DocData> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open share links. Try a newer browser.");
  let text: string;
  try {
    text = new TextDecoder().decode(await run(fromBase64Url(packed.trim()), new DecompressionStream("deflate-raw"), MAX_UNPACKED_BYTES));
  } catch (e) {
    if (e instanceof Error && e.message.includes("more data")) throw e;
    throw new Error("This link is damaged or cut short, so the diagram cannot be opened.");
  }
  return parseDoc(text);
}
