import type { CapacitorConfig } from "@capacitor/cli";

/** UI bundle: run `npm run android:sync` after `npm run build` writes `out/`. */
const config: CapacitorConfig = {
  appId: "com.label.workspace",
  appName: "Label",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
