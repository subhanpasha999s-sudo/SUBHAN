/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Static bundle for Capacitor / APK (`out/` → `capacitor.config` webDir). */
  output: "export",
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

  experimental: {
    /** Tree-shake icon + table helpers from package barrels. */
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-virtual",
      "@supabase/supabase-js",
    ],
  },
};

export default nextConfig;
