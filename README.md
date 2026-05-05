# Label

Meesho-style label PDF tools and SKU mapping. Web UI is packaged for **Android APK** via [Capacitor](https://capacitorjs.com/) (embedded WebView with your built `out/` bundle).

## Web development

```bash
npm install
npm run dev
```

Open `/export-labels` (home redirects there). Phones on the same Wi‑Fi use the LAN URL printed by `npm run dev`.

## Static build (always run before syncing the app)

Production UI is **`output: "export"`** → folder **`out/`** (ignored by git). There is **no `next start` server**: preview the exported site with:

```bash
npm run build
npm run preview
```

Sign-in still uses Supabase over HTTPS from the WebView (**Internet permission** is already declared in Android).

## Build an APK (your machine)

1. Install **Android Studio**, open it once, install **Android SDK** + platform tools + a JDK (**17** typical).
2. From the repo:

   ```bash
   npm run android:sync
   ```

   (`next build` + copy `out/` into the Capacitor Android project.)

3. Open native project:

   ```bash
   npm run android:open
   ```

4. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)** — install `app-debug.apk` on device (enable “unknown sources”), or attach phone with USB debugging.

`- id` is **`com.label.workspace`** (rename in [`capacitor.config.ts`](./capacitor.config.ts), then sync again).

## Notes

- The app is shipped as assets inside the APK; **Supabase/email flows require network** unless you refactor to offline-only storage.
- Old `redirects()` in `next.config` were removed—they do not apply to static export. Legacy paths like `/sku-mapping` should use **`/mapping`** directly.
