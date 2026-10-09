import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Dev-only: the browser posts the error that stopped the 3D model from loading, so the
 * failure can be read off the dev server log. There is no headless browser in this
 * environment, so this is the only way the client's reason reaches the terminal.
 */
const modelErrorLog = (): Plugin => ({
  name: 'meety-model-error-log',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__model-error', (request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        console.log('[model-error]', body.slice(0, 4000));
        response.statusCode = 204;
        response.end();
      });
    });
  },
});

export default defineConfig(({ mode }) => {
  const offlineSingleFile = mode === 'offline';
  return {
  plugins: [
    modelErrorLog(),
    react(),
    ...(!offlineSingleFile ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand-mark.svg'],
      manifest: {
        name: 'میتی — مربی تمرین باشگاه',
        short_name: 'میتی',
        lang: 'fa-IR',
        dir: 'rtl',
        description: 'همراه تمرین شخصی و خصوصی برای برنامه‌ریزی، ثبت ست‌ها و پیگیری پیشرفت در باشگاه.',
        theme_color: '#101312',
        background_color: '#101312',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/brand-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2,glb}'],
        runtimeCaching: [
          {
            // Network-first: the model is immutable, but a cache-first entry is only ever
            // right if what got cached really was the model. A 200 that carried something
            // else - a fallback page from a proxy, for instance - would otherwise be served
            // for a month and no amount of reloading would bring the model back.
            urlPattern: /\/models\/.*\.(?:glb|gltf)$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'meety-exercise-models',
              expiration: { maxEntries: 12, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/assets\/(?:three-core|react-three-fiber)-.*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'meety-3d-runtime',
              expiration: { maxEntries: 12, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    })] : []),
  ],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    rolldownOptions: {
      output: offlineSingleFile
        ? { inlineDynamicImports: true }
        : {
            codeSplitting: {
              groups: [
                { name: 'three-core', test: /node_modules[\\/]three[\\/]/, priority: 20, maxSize: 400_000 },
                { name: 'react-three-fiber', test: /node_modules[\\/]@react-three[\\/]/, priority: 10, maxSize: 400_000 },
              ],
            },
          },
    },
  },
};
});
