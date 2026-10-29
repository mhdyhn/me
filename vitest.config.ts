import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    clearMocks: true,
    // Several suites start embedded PostgreSQL; bounded workers keep CI from starving its setup hooks.
    maxWorkers: 2,
    hookTimeout: 30000,
  },
});
