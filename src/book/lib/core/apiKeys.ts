/**
 * API keys (Phase 10, spec §5.10) — pure generation + hashing for the public
 * REST API. The plaintext key is shown to the user ONCE; only its SHA-256 hash
 * is stored, so a leaked database never exposes usable keys. A short prefix is
 * stored separately for display ("tul_live_ab12…").
 *
 * Uses Web Crypto (available in Node 20+ and the browser).
 */

const KEY_PREFIX = "tul_live_";
const RANDOM_BYTES = 24;

export interface GeneratedApiKey {
  plaintext: string;  // shown to the user once
  prefix: string;     // safe to store/display (e.g. "tul_live_ab12cd34")
  hash: string;       // SHA-256 hex — the only thing persisted
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const buf = new Uint8Array(RANDOM_BYTES);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/** First 16 chars — enough to recognize a key without revealing it. */
export function apiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, KEY_PREFIX.length + 8);
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const plaintext = KEY_PREFIX + randomToken();
  return { plaintext, prefix: apiKeyPrefix(plaintext), hash: await hashApiKey(plaintext) };
}

/** Constant-time-ish compare of two hex hashes (length-checked equality). */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Pull the bearer token from an Authorization header value. */
export function bearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}
