import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { roundtableApi } from './server/vitePlugin.ts';

export default defineConfig({
  // roundtableApi：/api/* 后端，每个成员是一段直接调模型接口的对话（见 server/）
  plugins: [react(), roundtableApi()],
  // 允许读取上一级的 persona-protocol（人物校验规则和前端共用一份）
  server: { port: 5173, fs: { allow: ['..'] } },
});
