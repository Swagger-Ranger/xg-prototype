import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // Prefer .ts/.tsx over stale sibling .js artifacts from prior `tsc -b` runs.
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
  },
  server: {
    port: 5173,
    proxy: {
      // 显式 127.0.0.1:macOS + node 18+ 默认 IPv6-first 解析 localhost,
      // 而 java/python 后端常只监听 IPv4(*:port),会偶发 ECONNREFUSED。
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai/, ''),
      },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
