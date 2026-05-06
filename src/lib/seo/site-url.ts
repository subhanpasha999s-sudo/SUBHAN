/**
 * Canonical host for metadata, sitemap, and JSON-LD.
 * Set `NEXT_PUBLIC_SITE_URL` on Vercel (e.g. https://tulmin.com).
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://tulmin.com";
}
