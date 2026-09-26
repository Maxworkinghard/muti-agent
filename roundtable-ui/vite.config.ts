import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { roundtableApi } from './server/vitePlugin.ts';

export default defineConfig({
  // roundtableApi：/api/* 后端，每个成员由一个 omp 进程扮演（见 server/）
  plugins: [react(), roundtableApi()],
  server: { port: 5173 },
});
