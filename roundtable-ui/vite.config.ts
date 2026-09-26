import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { roundtableApi } from './server/vitePlugin.ts';

export default defineConfig({
  // roundtableApi：/api/* 后端，每个成员是一段直接调模型接口的对话（见 server/）
  plugins: [react(), roundtableApi()],
  server: { port: 5173 },
});
