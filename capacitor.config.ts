import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the same web app. The web build in `dist/` is copied into the
 * Android project. The app opens the live site given in `server.url`.
 *
 * `appId` is a placeholder: change it to your own reverse-domain id before publishing.
 */
const config: CapacitorConfig = {
  appId: 'com.mhdyhn.meety',
  appName: 'میتی',
  webDir: 'dist',
  // Same dark colour as the splash screen and the app, so there is no white flash while the site loads.
  backgroundColor: '#101312',
  // The app is bundled inside the APK, so the screens open at once. Only data calls go to the server (VITE_API_BASE).
};

export default config;
