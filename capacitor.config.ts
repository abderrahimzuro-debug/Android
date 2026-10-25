import type { CapacitorConfig } from '@capacitor/cli';

/**
 * MathFlow Android (Capacitor) configuration.
 *
 * `webDir: 'dist'` means the whole PWA — including all fonts, icons, the math
 * engine and the service worker — is bundled INSIDE the APK. The app therefore
 * works offline from the very first launch, without a network connection.
 * Use `npm run android:sync` after every `npm run build`.
 */
const config: CapacitorConfig = {
  appId: 'app.mathflow.solver',
  appName: 'MathFlow',
  webDir: 'dist',
  loggingBehavior: 'production',
  android: {
    androidScheme: 'https',
    allowMixedContent: false,
    captureInput: false,
    backgroundColor: '#0b1f31',
  },
};

export default config;
