import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, apiKeyPrefix, hashesEqual, bearerToken } from "./apiKeys";

describe("api keys", () => {
  it("generates a prefixed key with a stored hash, never the plaintext", async () => {
    const k = await generateApiKey();
    expect(k.plaintext.startsWith("tul_live_")).toBe(true);
    expect(k.prefix).toBe(apiKeyPrefix(k.plaintext));
    expect(k.prefix.length).toBe("tul_live_".length + 8);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.hash).not.toContain(k.plaintext);
  });

  it("hash is deterministic and verifies", async () => {
    const k = await generateApiKey();
    expect(await hashApiKey(k.plaintext)).toBe(k.hash);
    expect(hashesEqual(await hashApiKey(k.plaintext), k.hash)).toBe(true);
    expect(hashesEqual(await hashApiKey(k.plaintext + "x"), k.hash)).toBe(false);
  });

  it("keys are unique", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });

  it("parses the bearer token", () => {
    expect(bearerToken("Bearer tul_live_abc")).toBe("tul_live_abc");
    expect(bearerToken("bearer  tul_live_abc ")).toBe("tul_live_abc");
    expect(bearerToken("Basic xyz")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
