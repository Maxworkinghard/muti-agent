import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { roundtableApi } from './server/vitePlugin.ts';

export default defineConfig({
  // roundtableApi：Node 会话后端及四种模式共用的 /api/llm/chat 模型代理；Key 只留在服务器端
  plugins: [react(), roundtableApi()],
  // 允许读取上一级的人物资料和 persona-protocol 校验规则
  server: {
    port: 5173, fs: { allow: ['..'] },
  },
});
