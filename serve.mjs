/**
 * 单端口启动器：把三样东西合并到一根端口上，供线上发布使用。
 *
 *   1. 静态文件      frontend/dist（vite build 的产物）
 *   2. Node 会话后端 server-dist/api.mjs（打包后的 server/api.ts）
 *                    /api/health、/api/sessions、/api/llm/*
 *   3. Python 辩论后端 backend/服务.py（子进程，只监听 127.0.0.1）
 *                    /api/discuss、/api/options —— 由本文件反向代理转发
 *
 * 本地开发不用这个文件（npm run dev 已把前两样挂在 Vite 上），它只解决"线上只有一根端口"的问题。
 * 约定：监听 process.env.PORT，绑 0.0.0.0；frontend/.env 里的 LLM_* 同时喂给 Node 和 Python。
 */
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DIST = join(ROOT, 'frontend', 'dist');
const ENV_FILE = join(ROOT, 'frontend', '.env');
/** 线上专用的一份，存在时覆盖 .env；本地开发（npm run dev）不读它，互不影响 */
const ENV_PROD_FILE = join(ROOT, 'frontend', '.env.production');
const BACKEND_DIR = join(ROOT, 'backend');
const SERVER_BUNDLE = join(ROOT, 'server-dist', 'api.mjs');

const PORT = Number(process.env.PORT || 5173);
const HOST = '0.0.0.0';
/** Python 辩论后端只在本机回环上监听，不对外暴露 */
const DEBATE_PORT = Number(process.env.DEBATE_PORT || 8000);
const DEBATE_ORIGIN = `http://127.0.0.1:${DEBATE_PORT}`;

/** 由 Node 后端自己处理的路径，和 server/vitePlugin.ts 里的 OWN 保持一致 */
const NODE_API = ['/api/health', '/api/sessions', '/api/llm/'];
/** 转给 Python 辩论后端的路径 */
const DEBATE_API = ['/api/discuss', '/api/options'];

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

// ---------------------------------------------------------------- Python 辩论后端

let python = null;
let pythonReady = false;
let pythonError = '辩论后端还没启动';
/** 每次换候选都 +1，用来作废上一个候选留下的就绪轮询 */
let pythonGen = 0;

function startPython() {
  const candidates = [process.env.PYTHON, 'python3', 'python'].filter(Boolean);
  let index = 0;

  const tryNext = () => {
    if (index >= candidates.length) {
      pythonError = '这台机器上找不到 python3 / python，辩论模式不可用（其余三个模式不受影响）';
      console.error('[辩论后端] ' + pythonError);
      return;
    }
    const cmd = candidates[index++];
    const gen = ++pythonGen;
    const child = spawn(cmd, ['服务.py', '--端口', String(DEBATE_PORT)], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        LLM_API_KEY: env.LLM_API_KEY || '',
        LLM_BASE_URL: env.LLM_BASE_URL || '',
        LLM_MODEL: env.LLM_MODEL || '',
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    child.stdout.on('data', (b) => process.stdout.write('[辩论后端] ' + b));
    child.stderr.on('data', (b) => process.stderr.write('[辩论后端] ' + b));

    child.once('error', () => {
      if (settled) return;
      settled = true;
      if (child.exitCode === null) child.kill();
      tryNext();
    });

    child.once('spawn', () => {
      settled = true;
      python = child;
      waitForPython(gen);
    });

    child.once('exit', (code) => {
      pythonReady = false;
      if (python === child) python = null;
      if (!settled) {
        settled = true;
        tryNext();
        return;
      }
      // Windows 上 python3.exe 常常是应用商店的占位程序：spawn 得起来、但立刻以 9009
      // 退出，真正的解释器在 python 上。这种“还没就绪就退出”也要往下试候选，
      // 否则永远轮不到能用的那个。只有确实就绪过（自己崩了）才不再重试。
      if (!child.__wasReady && index < candidates.length) {
        pythonError = '';
        console.error(`[辩论后端] ${cmd} 没能启动（code ${code}），换下一个候选`);
        tryNext();
        return;
      }
      // 启动脚本自己 SystemExit 时（例如没配 api_key），把原因带到接口响应里
      pythonError = pythonError || `辩论后端已退出（code ${code}）`;
      console.error(`[辩论后端] 进程退出，code=${code}`);
    });
  };

  tryNext();
}

/** Python 起来要几百毫秒，轮询它的 /api/options 确认就绪 */
async function waitForPython(gen) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (gen !== pythonGen) return; // 已经换到新候选，这个轮询作废
    try {
      const res = await fetch(DEBATE_ORIGIN + '/api/options');
      if (res.ok) {
        pythonReady = true;
        if (python) python.__wasReady = true; // 记在本次子进程上，供退出时判断要不要换候选
        pythonError = '';
        console.log(`[辩论后端] 就绪：${DEBATE_ORIGIN}`);
        return;
      }
    } catch {
      /* 还没监听，继续等 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  pythonError = '辩论后端启动超时（30 秒）';
  console.error('[辩论后端] ' + pythonError);
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

// ---------------------------------------------------------------- 辩论后端反向代理

function proxyDebate(req, res, pathname) {
  if (!pythonReady) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: pythonError || '辩论后端未就绪' }));
    return;
  }
  const upstream = httpRequest(
    { host: '127.0.0.1', port: DEBATE_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${DEBATE_PORT}` } },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '转发到辩论后端失败：' + e.message }));
  });
  req.pipe(upstream);
}

// ---------------------------------------------------------------- 主服务

const server = createServer((req, res) => {
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

  if (DEBATE_API.some((p) => pathname.startsWith(p))) return proxyDebate(req, res, pathname);

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
  startPython();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    apiHandler?.dispose?.();
    if (python) python.kill(sig);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
