import { sha256, toHex } from "./sha256";

/**
 * Passphrase check. Only a salted, slow hash of the passphrase is stored here, never the passphrase.
 *
 * This is a gate, not strong security: the app runs entirely in the browser, so this code and hash are
 * visible to anyone who can load the page, and a short passphrase can be brute forced offline given
 * the hash. It keeps casual visitors out. For real protection, put the app behind server-side
 * authentication (for example basic auth, or an access proxy) as well.
 */
const SALT = "archboard3d/gate/v1:";
export const ROUNDS = 20000;

/** The salted, iterated hash of the passphrase. */
export const PASSPHRASE_HASH = "316e905950a2f7a30c51bf984331a40e0fb5c33f9e7e749477bfdf539b593c41";

const enc = new TextEncoder();

export function deriveKey(passphrase: string, rounds = ROUNDS): string {
  const salt = enc.encode(SALT);
  let h = sha256(enc.encode(SALT + passphrase));
  for (let i = 1; i < rounds; i++) {
    const next = new Uint8Array(h.length + salt.length);
    next.set(h);
    next.set(salt, h.length);
    h = sha256(next);
  }
  return toHex(h);
}

/** Constant-time string comparison, so timing does not leak how many leading characters matched. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassphrase(input: string, expected: string = PASSPHRASE_HASH, rounds = ROUNDS): boolean {
  return same(deriveKey(input, rounds), expected);
}
