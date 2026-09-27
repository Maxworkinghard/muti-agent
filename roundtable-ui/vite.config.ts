import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLlmHandler } from './server/llm-proxy.ts';

/** 辩论后端地址，默认 backend/服务.py 的 8000 端口；换端口时设置环境变量 DEBATE_BACKEND */
const debate = process.env.DEBATE_BACKEND || 'http://127.0.0.1:8000';

/** 把 /api/llm/chat 挂到开发服务器和预览服务器上，API Key 从 .env 读取，只留在服务器端 */
function llmProxy(env: Record<string, string>): Plugin {
  const handler = createLlmHandler(env);
  return {
    name: 'llm-proxy',
    configureServer(server) { server.middlewares.use('/api/llm/chat', handler); },
    configurePreviewServer(server) { server.middlewares.use('/api/llm/chat', handler); },
  };
}

export default defineConfig(({ mode }) => {
  // 第三个参数传空串：读取全部变量，但不会把没有 VITE_ 前缀的变量暴露给前端
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), llmProxy(env)],
    // 允许读取上一级的 persona-protocol（人物校验规则和前端共用一份）
    server: {
      port: 5173, fs: { allow: ['..'] },
      // 辩论模式走 PR5 的 Python 后端：cd backend && python 服务.py
      proxy: { '/api/discuss': debate, '/api/options': debate },
    },
    preview: { proxy: { '/api/discuss': debate, '/api/options': debate } },
  };
});
