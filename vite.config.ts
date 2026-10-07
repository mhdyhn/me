import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
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
        globIgnores: ['**/ExerciseModelCanvas-*.js', '**/three-core-*.js', '**/react-three-fiber-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.(?:glb|gltf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'meety-exercise-models',
              expiration: { maxEntries: 12, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
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
    }),
  ],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]/, priority: 20, maxSize: 400_000 },
            { name: 'react-three-fiber', test: /node_modules[\\/]@react-three[\\/]/, priority: 10, maxSize: 400_000 },
          ],
        },
      },
    },
  },
});
