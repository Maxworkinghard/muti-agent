import { defineConfig } from 'vite';

/**
 * 只打包服务端。
 *
 * session.ts / llmAgent.ts 里用了构造函数参数属性（constructor(readonly id: string, ...)），
 * 属于不可擦除语法，Node 的类型剥离跑不了，所以线上不能直接 import 这些 .ts。
 * 这里把它们连同依赖打成单个 ESM，线上只要 Node 就能跑，不需要 TypeScript。
 *
 * 产物：../server-dist/api.mjs，导出 createApi，由根目录的 serve.mjs 使用。
 */
export default defineConfig({
  // 服务端产物不需要 public/ 里的音频和场景图，那是给浏览器用的
  publicDir: false,
  build: {
    ssr: 'server/api.ts',
    outDir: '../server-dist',
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: { output: { entryFileNames: 'api.mjs' } },
  },
});
