import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { createApi } from './api.ts';

/** 把 /api/* 挂到 Vite 开发 / 预览服务器上：npm run dev 一条命令同时启动前端和 omp 后端 */
export function roundtableApi(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    const { mode, root, envDir } = server.config;
    // 只读 ROUNDTABLE_* 变量；没有 VITE_ 前缀，所以不会暴露给浏览器
    const api = createApi(loadEnv(mode, typeof envDir === 'string' ? envDir : root, 'ROUNDTABLE_'));
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      api.handle(req, res).catch((e: Error) => {
        if (res.headersSent) return res.end();
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      });
    });
    server.httpServer?.once('close', () => api.dispose());
    process.once('exit', () => api.dispose());
  };
  return { name: 'roundtable-omp-api', configureServer: mount, configurePreviewServer: mount };
}
