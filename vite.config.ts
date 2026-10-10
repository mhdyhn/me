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
                globPatterns: ['**/*.{js,css,html,svg,woff2}'],
              },
              devOptions: { enabled: false },
            }),
          ]
        : []),
    ],
    server: { host: '0.0.0.0', allowedHosts: true },
    preview: { host: '0.0.0.0', allowedHosts: true },
    build: {
      rolldownOptions: {
        output: offlineSingleFile ? { inlineDynamicImports: true } : {},
      },
    },
  };
});
