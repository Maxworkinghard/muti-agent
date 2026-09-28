import { loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { createApi } from './api.ts';

/** Node 会话后端与模型代理；辩论导演和辩手也使用同一个模型代理。 */
const OWN = ['/api/health', '/api/sessions', '/api/llm/'];

/** 把后端挂到 Vite 开发 / 预览服务器上：npm run dev 同时提供前端、Node 会话服务与模型代理 */
export function roundtableApi(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    const { mode, root, envDir } = server.config;
    // 第三个参数传空串：读全部变量（LLM_*），这些变量没有 VITE_ 前缀，不会暴露给浏览器
    const api = createApi(loadEnv(mode, typeof envDir === 'string' ? envDir : root, ''));
    server.middlewares.use((req, res, next) => {
      if (!OWN.some((p) => req.url?.startsWith(p))) return next();
      api.handle(req, res).catch((e: Error) => {
        if (res.headersSent) return res.end();
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      });
    });
    server.httpServer?.once('close', () => api.dispose());
    process.once('exit', () => api.dispose());
  };
  return { name: 'roundtable-api', configureServer: mount, configurePreviewServer: mount };
}
