// Shared by the board API routes. Plain JavaScript so Cloudflare can run it as it is.
//
// Boards live in one KV namespace bound as DIAGRAMS. Key "d:<id>" holds the board JSON; the title, the update time
// and whether the board is shared ride along as KV metadata, so listing never has to read the values.
//
// Every saved board belongs to the owner, who is behind the passphrase. Only a board marked shared can be read by
// anyone with its link. A board saved before sharing existed has no flag in its metadata and counts as shared, so
// the links that are already out there keep working.

export const MAX_BYTES = 512 * 1024;
export const MAX_TITLE = 120;
export const LIMITS = { nodes: 600, edges: 2000, texts: 400, zones: 200 };
export const ID_RE = /^[a-z0-9]{8,32}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const keyFor = (id) => `d:${id}`;

/** Shared unless the metadata says otherwise (boards from before the flag existed were all shared). */
export const isShared = (meta) => !meta || meta.shared !== false;

export const metaFor = (title, shared) => ({ title, updated: new Date().toISOString(), shared: !!shared });

/** ?shared=1 or ?shared=0 on a write, or undefined when the request does not say. */
export function sharedParam(request) {
  const v = new URL(request.url).searchParams.get("shared");
  return v === "1" ? true : v === "0" ? false : undefined;
}

/** 12 random characters, about 62 bits: the id is the key to the link, so it must not be guessable. */
export function newId(length = 12) {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 252 && out.length < length) out += ALPHABET[b % 36]; // 252 = 7 * 36: no modulo bias
    }
  }
  return out;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

/** The KV namespace, or null before it has been bound in the Pages project settings. */
export const store = (env) => (env && env.DIAGRAMS && typeof env.DIAGRAMS.get === "function" ? env.DIAGRAMS : null);

export const notSetUp = () => json({ error: "Publishing is not set up yet." }, 503);

/**
 * Refuse writes that a browser says came from another site. Behind the projects hub the Origin is the hub's
 * host and not this one, so Sec-Fetch-Site (set by the browser, not by scripts) is the main check.
 */
export function sameSite(request) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite) return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  const origin = request.headers.get("Origin");
  if (!origin) return true; // not a browser, and the gate cookie is still required
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

/** Read and check a board sent for publishing. Returns { ok: true, text, title, counts } or { ok: false, response }. */
export async function readBoard(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BYTES) return { ok: false, response: json({ error: "That board is too large to publish." }, 413) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BYTES) return { ok: false, response: json({ error: "That board is too large to publish." }, 413) };
  let doc;
  try { doc = JSON.parse(raw); } catch { return { ok: false, response: json({ error: "The board is not valid JSON." }, 400) }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || doc.version !== 1 || !Array.isArray(doc.nodes)) {
    return { ok: false, response: json({ error: "That does not look like an Archboard 3D board." }, 400) };
  }
  const count = (v) => (Array.isArray(v) ? v.length : 0);
  for (const key of Object.keys(LIMITS)) {
    if (count(doc[key]) > LIMITS[key]) return { ok: false, response: json({ error: `The board has too many ${key} to publish (limit ${LIMITS[key]}).` }, 413) };
  }
  const title = (typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : "Untitled architecture").slice(0, MAX_TITLE);
  delete doc.boardId; // the id belongs to the stored copy, not inside it
  delete doc.shareId; // the name older versions used for it
  return { ok: true, text: JSON.stringify(doc), title };
}
