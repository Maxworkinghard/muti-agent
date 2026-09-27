/**
 * 体验换方向之前的版本（圆桌版多人格讨论工作台）：npm run legacy
 *
 * 旧版冻结在远程分支 legacy/v1-roundtable 上。这个脚本把它检出到 .legacy/v1-roundtable（git worktree，
 * 不影响当前工作区），装好依赖，再同时起旧版的前端开发服务器和 Python 辩论后端：
 *   页面      http://localhost:5174（LEGACY_PORT 可改）
 *   辩论后端  127.0.0.1:8001（LEGACY_DEBATE_PORT 可改）
 * 端口和新版默认的 5173 / 8000 错开，两个版本可以同时开着对比。
 * 模型配置沿用当前仓库的 frontend/.env（和 backend/模型配置.json），复制一份过去；
 * 找不到模型 key 时辩论后端用试跑模式（示例发言），其余三个模式会提示缺少 LLM_API_KEY。
 * Ctrl+C 同时停掉两个进程。
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BRANCH = 'legacy/v1-roundtable';
const DIR = join(ROOT, '.legacy', 'v1-roundtable');
const PORT = process.env.LEGACY_PORT || '5174';
const DEBATE_PORT = process.env.LEGACY_DEBATE_PORT || '8001';
const WIN = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, ...opts });
  if (r.status !== 0) {
    console.error(`[旧版] 执行失败：${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
}

// 1. 取最新的旧版分支，检出到 .legacy/（已经检出过就切到最新）
run('git', ['fetch', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`], { cwd: ROOT });
if (existsSync(join(DIR, '.git'))) run('git', ['checkout', '--detach', `origin/${BRANCH}`], { cwd: DIR });
else run('git', ['worktree', 'add', '--detach', DIR, `origin/${BRANCH}`], { cwd: ROOT });

// 2. 沿用当前仓库的模型配置
for (const f of [join('frontend', '.env'), join('backend', '模型配置.json')]) {
  if (existsSync(join(ROOT, f)) && !existsSync(join(DIR, f))) copyFileSync(join(ROOT, f), join(DIR, f));
}
const envText = existsSync(join(DIR, 'frontend', '.env')) ? readFileSync(join(DIR, 'frontend', '.env'), 'utf8') : '';
const hasKey = !!process.env.LLM_API_KEY || /^\s*LLM_API_KEY\s*=\s*\S+/m.test(envText) || existsSync(join(DIR, 'backend', '模型配置.json'));

// 3. 装依赖（只在第一次）
if (!existsSync(join(DIR, 'frontend', 'node_modules'))) run('npm', ['install', '--no-audit', '--no-fund'], { cwd: join(DIR, 'frontend') });

// 4. 起辩论后端和前端
const python = [process.env.PYTHON, 'python3', 'python'].filter(Boolean)
  .find((p) => spawnSync(p, ['--version'], { shell: WIN }).status === 0);
const children = [];
if (python) {
  const args = ['服务.py', '--端口', DEBATE_PORT, ...(hasKey ? [] : ['--试跑'])];
  children.push(spawn(python, args, { cwd: join(DIR, 'backend'), stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }));
  if (!hasKey) console.log('[旧版] 没找到模型 key，辩论后端用试跑模式；其余三个模式要在 frontend/.env 里填 LLM_API_KEY');
} else {
  console.log('[旧版] 找不到 python3 / python，辩论模式不可用，其余三个模式不受影响');
}
// 直接用 node 起 vite（不经过 npx），停止时才能真正把它杀掉
children.push(spawn(process.execPath, [join(DIR, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), '--port', PORT, '--strictPort'], {
  cwd: join(DIR, 'frontend'), stdio: 'inherit',
  env: { ...process.env, DEBATE_BACKEND: `http://127.0.0.1:${DEBATE_PORT}` },
}));
console.log(`[旧版] 打开 http://localhost:${PORT}`);

const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// 任一个进程退出（端口被占等），另一个也一起停，别留半套服务在后台
for (const c of children) c.on('exit', stop);
