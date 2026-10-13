import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const offlineSingleFile = mode === 'offline';
  return {
    plugins: [
      react(),
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
                globPatterns: ['**/*.{js,css,html,svg,woff2}'],
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
      rolldownOptions: {
        output: offlineSingleFile ? { inlineDynamicImports: true } : {},
      },
    },
  };
});
