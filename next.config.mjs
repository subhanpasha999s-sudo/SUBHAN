const staticExport = process.env.TULMIN_STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  /** Static bundle for Capacitor / APK (`out/` → `capacitor.config` webDir). */
  ...(staticExport ? { output: "export" } : {}),
  images: { unoptimized: true },
  /** App Router: keep `fuse.js` out of the server bundle (client-only fuzzy search). */
  serverExternalPackages: ["fuse.js"],

  /**
   * Phone on Wi‑Fi hits `http://192.168.x.x:3000` — Origin is that host, not localhost.
   * Without this, Next dev blocks `_next` assets (403) → blank or broken UI on device.
   * Wildcards match private LAN ranges (dev-only concern). Add explicit hosts via env if needed.
   */
  allowedDevOrigins: [
    ...(process.env.NEXT_DEV_LAN_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
  ],

  async headers() {
    return [
      {
        source: "/:icon(favicon.ico|favicon.png|icon.svg|apple-touch-icon.png|apple-touch-icon-precomposed.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
