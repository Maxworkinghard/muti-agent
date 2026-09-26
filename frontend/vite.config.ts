import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { PYTHON_ROUTES, roundtableApi } from './server/vitePlugin.ts';

export default defineConfig(({ mode }) => {
  // 理性讨论走 backend/服务.py；它换了端口时，在 .env.local 里设 ROUNDTABLE_PY_URL
  const py = loadEnv(mode, process.cwd(), 'ROUNDTABLE_').ROUNDTABLE_PY_URL || 'http://127.0.0.1:8000';
  const proxy = Object.fromEntries(PYTHON_ROUTES.map((p) => [p, py]));
  return {
    // roundtableApi：/api/* 后端，每个成员是一段直接调模型接口的对话（见 server/）
    plugins: [react(), roundtableApi()],
    server: { port: 5173, proxy },
    preview: { proxy },
  };
});
