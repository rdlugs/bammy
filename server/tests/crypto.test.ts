import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/lib/crypto.ts";

describe("encrypt/decrypt", () => {
  it("round-trips and never stores the plaintext", () => {
    const secret = "glpat-abc123";
    const payload = encrypt(secret);

    expect(payload).not.toContain(secret);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(decrypt(payload)).toBe(secret);
  });

  it("uses a fresh IV for every call", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects a tampered payload", () => {
    const [version, iv, tag, ciphertext] = encrypt("secret").split(".");
    const flipped = ciphertext!.startsWith("A") ? `B${ciphertext!.slice(1)}` : `A${ciphertext!.slice(1)}`;

    expect(() => decrypt([version, iv, tag, flipped].join("."))).toThrow();
  });

  it("rejects an unknown format", () => {
    expect(() => decrypt("plaintext")).toThrow(/Unrecognised/);
  });
});
