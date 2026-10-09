import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the same web app. The web build in `dist/` is copied into the
 * Android project, so the app runs from the device with no network needed.
 *
 * `appId` is a placeholder: change it to your own reverse-domain id before publishing.
 */
const config: CapacitorConfig = {
  appId: 'com.mhdyhn.meety',
  appName: 'میتی',
  webDir: 'dist',
};

export default config;
