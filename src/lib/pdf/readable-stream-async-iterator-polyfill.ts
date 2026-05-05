/**
 * pdf.js v5 aggregates text via `for await (...) of ReadableStream`.
 * Engines without ReadableStream @@asyncIterator produce "undefined is not a function"
 * (bundled snippets often truncate to "... of e...").
 */
export function ensureReadableStreamAsyncIterator(): void {
  if (typeof globalThis.ReadableStream === "undefined") return;

  const proto = globalThis.ReadableStream.prototype as unknown as Record<
    symbol,
    unknown
  >;

  const key = Symbol.asyncIterator;
  if (typeof proto[key] === "function") return;

  Object.defineProperty(proto, key, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: async function* (this: ReadableStream<unknown>) {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* already released */
        }
      }
    },
  });
}
