/**
 * 单端口启动器：把页面和 Node 模型代理合并到一根端口上，供线上发布使用。
 *
 *   1. 静态文件      frontend/dist（vite build 的产物）
 *   2. Node 会话后端 server-dist/api.mjs（打包后的 server/api.ts）
 *                    /api/health、/api/sessions、/api/llm/*
 *
 * 本地开发不用这个文件（npm run dev 已把前两样挂在 Vite 上），它只解决"线上只有一根端口"的问题。
 * 约定：监听 process.env.PORT，绑 0.0.0.0；frontend/.env 里的 LLM_* 供 Node 模型代理使用。
 */
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DIST = join(ROOT, 'frontend', 'dist');
const ENV_FILE = join(ROOT, 'frontend', '.env');
/** 线上专用的一份，存在时覆盖 .env；本地开发（npm run dev）不读它，互不影响 */
const ENV_PROD_FILE = join(ROOT, 'frontend', '.env.production');
const SERVER_BUNDLE = join(ROOT, 'server-dist', 'api.mjs');

const PORT = Number(process.env.PORT || 5173);
const HOST = '0.0.0.0';
/** 由 Node 后端自己处理的路径，和 server/vitePlugin.ts 里的 OWN 保持一致 */
const NODE_API = ['/api/health', '/api/sessions', '/api/llm/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

/** 读 frontend/.env，写法跟 backend/讨论引擎.py 里那份保持一致（容忍 BOM、引号、注释） */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim().replace(/^export\s+/, '');
    out[k] = t.slice(i + 1).trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return out;
}

// 本地开发时 Vite 的 loadEnv 也是"文件在前、process.env 覆盖在后"，这里保持同样顺序；
// 中间插一层 .env.production，让线上换模型不用动本机开发用的 .env
const env = { ...readEnvFile(ENV_FILE), ...readEnvFile(ENV_PROD_FILE), ...process.env };
const accessPassword = env.APP_ACCESS_PASSWORD || '';
if (accessPassword.length < 16) {
  console.error('单端口发布需要至少 16 个字符的 APP_ACCESS_PASSWORD（放在环境变量或 frontend/.env.production）。');
  process.exit(1);
}
const expectedAuth = Buffer.from('roundtable:' + accessPassword);

function authorized(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Basic ') || auth.length > 512) return false;
  const supplied = Buffer.from(auth.slice(6), 'base64');
  return supplied.length === expectedAuth.length && timingSafeEqual(supplied, expectedAuth);
}

function sameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host.toLowerCase() === (req.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Node 会话后端

let api = null;
try {
  ({ createApi: api = null } = await import('file://' + SERVER_BUNDLE.replace(/\\/g, '/')));
} catch (e) {
  console.error('没法加载 server-dist/api.mjs，请先运行 npm run build:server：' + e.message);
}
const apiHandler = typeof api === 'function' ? api(env) : null;
const keyMissing = !(env.LLM_API_KEY || '').trim();
if (keyMissing) console.warn('提醒：frontend/.env 里没有 LLM_API_KEY，模型调用会失败。');

// ---------------------------------------------------------------- 静态文件

const isInside = (parent, child) => child === parent || child.startsWith(parent + sep);

async function sendStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // 拒绝任何隐藏文件（.env、.git…）和目录穿越
  if (rel.split('/').some((s) => s.startsWith('.') && s !== '' && s !== '.')) return false;

  const file = resolve(join(DIST, normalize(rel)));
  if (!isInside(DIST, file)) return false;

  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    const index = join(file, 'index.html');
    info = await stat(index).catch(() => null);
    if (!info) return false;
    return serveFile(req, res, index, info);
  }
  // 没扩展名的路径交给前端路由（dist 只有一份 index.html）
  if (!info && !extname(file)) {
    const index = join(DIST, 'index.html');
    const indexInfo = await stat(index).catch(() => null);
    if (indexInfo) return serveFile(req, res, index, indexInfo);
  }
  if (!info?.isFile()) return false;
  return serveFile(req, res, file, info);
}

function serveFile(req, res, file, info) {
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  // 带哈希的构建产物可以长缓存，index.html 必须每次问过服务器
  const immutable = file.includes(sep + 'assets' + sep);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
  return true;
}

// ---------------------------------------------------------------- 主服务

const server = createServer((req, res) => {
  // 发布入口统一保护页面和 API；浏览器完成一次 Basic 登录后，同源请求会沿用凭据。
  if (!authorized(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Roundtable", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end('需要访问密码');
  }
  if (!sameOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('跨站请求被拒绝');
  }
  const pathname = (req.url || '/').split('?')[0];

  if (NODE_API.some((p) => pathname.startsWith(p))) {
    if (!apiHandler) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: '服务端没打包好（server-dist/api.mjs 缺失）' }));
    }
    // Node 后端自己写响应头（SSE 也走这条），这里只兜底异常
    return void apiHandler.handle(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: '这个接口不接受 ' + req.method }));
  }

  sendStatic(req, res, pathname)
    .then((handled) => {
      if (handled || res.headersSent) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    })
    .catch(() => {
      if (res.headersSent) return res.end();
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500');
    });
});

server.listen(PORT, HOST, () => {
  console.log(`[主服务] 监听 http://${HOST}:${PORT}`);
  console.log(`[主服务] 静态目录 ${DIST}`);
  console.log(`[主服务] 模型 ${env.LLM_MODEL || '(未配置)'} @ ${env.LLM_BASE_URL || '(未配置)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    apiHandler?.dispose?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
