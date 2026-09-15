import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  server: { port: 5173, open: true },
  resolve: { alias: { finance: '/src/mock/finance-mock.ts', 'finance-logger': '/src/vendor/logger.ts' } }
});
