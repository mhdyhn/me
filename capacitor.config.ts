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
  // The APK opens the live site so sign-in and the coach/student features reach the server.
  // The bundled copy in dist/ is still included as a fallback.
  server: {
    url: 'https://meety-985n.onrender.com',
    cleartext: false,
  },
};

export default config;
