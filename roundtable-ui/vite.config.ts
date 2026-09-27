import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { roundtableApi } from './server/vitePlugin.ts';

/** 辩论后端地址，默认 backend/服务.py 的 8000 端口；换端口时设置环境变量 DEBATE_BACKEND */
const debate = process.env.DEBATE_BACKEND || 'http://127.0.0.1:8000';
const debateProxy = { '/api/discuss': debate, '/api/options': debate };

export default defineConfig({
  // roundtableApi：PR6 的 Node 后端（情感分析、工作模式的会话，以及 /api/llm/chat 转发），Key 从 .env 读取，只留在服务器端
  plugins: [react(), roundtableApi()],
  // 允许读取上一级的 persona-protocol（人物校验规则和前端共用一份）
  server: {
    port: 5173, fs: { allow: ['..'] },
    // 辩论模式走 Python 后端：cd backend && python 服务.py
    proxy: debateProxy,
  },
  preview: { proxy: debateProxy },
});
