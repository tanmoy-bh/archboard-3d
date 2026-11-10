import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ROUNDS, checkPassphrase, deriveKey } from "../src/security/passphrase";
import { sha256, toHex } from "../src/security/sha256";

describe("sha256", () => {
  it("matches the published test vectors", () => {
    const enc = new TextEncoder();
    expect(toHex(sha256(enc.encode("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(toHex(sha256(enc.encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(toHex(sha256(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("agrees with Node's crypto for many sizes, including the padding boundaries", () => {
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000]) {
      const data = randomBytes(n);
      expect(toHex(sha256(new Uint8Array(data)))).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

describe("passphrase check", () => {
  // A throwaway passphrase: the real one must never appear in this repository.
  const secret = "correct horse battery staple";
  const hash = deriveKey(secret);

  it("derives a stable 64 character hash", () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveKey(secret)).toBe(hash);
  });

  it("accepts the right passphrase and rejects everything else", () => {
    expect(checkPassphrase(secret, hash)).toBe(true);
    for (const bad of ["", "wrong", secret.toUpperCase(), secret + " ", " " + secret, secret.slice(0, -1)]) {
      expect(checkPassphrase(bad, hash), JSON.stringify(bad)).toBe(false);
    }
  });

  it("is salted and iterated, so it is not a plain SHA-256 of the passphrase", () => {
    expect(hash).not.toBe(createHash("sha256").update(secret).digest("hex"));
    expect(deriveKey(secret, 1)).not.toBe(hash);
    expect(ROUNDS).toBeGreaterThanOrEqual(10000);
  });
});
