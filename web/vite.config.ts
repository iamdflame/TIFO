import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: { outDir: path.join(__dirname, 'dist'), emptyOutDir: true },
  server: {
    port: 5173,
    fs: { allow: [path.join(__dirname, '..')] },
    proxy: { '/api': { target: 'http://localhost:8090', changeOrigin: true } },
  },
});
