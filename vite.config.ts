import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const offlineSingleFile = mode === 'offline';
  return {
    plugins: [
      react(),
      {
        name: 'exclude-apk-from-dist',
        closeBundle() {
          try {
            const baseDir = import.meta.dirname ?? process.cwd();
            const apkPath = resolve(baseDir, 'dist', 'meety.apk');
            if (existsSync(apkPath)) {
              unlinkSync(apkPath);
            }
          } catch {}
        },
      },
      ...(!offlineSingleFile
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['brand-mark.svg', 'apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
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
                  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                  { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                  { src: '/brand-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                ],
              },
              workbox: {
                navigateFallback: '/index.html',
                globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
                runtimeCaching: [
                  {
                    urlPattern: /\/exercise-(?:photos|images)\/.*\.(?:jpg|jpeg|png|webp|svg)$/,
                    handler: 'StaleWhileRevalidate',
                    options: {
                      cacheName: 'exercise-media-cache',
                      expiration: {
                        maxEntries: 250,
                        maxAgeSeconds: 60 * 24 * 60 * 60,
                      },
                    },
                  },
                  {
                    urlPattern: /\/icons\/.*\.(?:png|svg|ico)$/,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'app-icons-cache',
                      expiration: {
                        maxEntries: 30,
                        maxAgeSeconds: 90 * 24 * 60 * 60,
                      },
                    },
                  },
                ],
              },
              devOptions: { enabled: false },
            }),
          ]
        : []),
    ],
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      // The app calls relative /api paths; the dev server forwards them to the local API.
      proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8787', changeOrigin: false } },
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
      // Same API forwarding as the dev server, so the built app can sign in during local checks.
      proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8787', changeOrigin: false } },
    },
    build: {
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: offlineSingleFile
          ? { inlineDynamicImports: true }
          : {
              manualChunks(id: string) {
                if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
                  return 'vendor-react';
                }
                if (id.includes('node_modules/lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('node_modules/dexie') || id.includes('node_modules/@electric-sql')) {
                  return 'vendor-db';
                }
              },
            },
      },
    },
  };
});
