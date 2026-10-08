import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 收集现有离线检查，单独进程执行，避免各脚本的假模型与全局状态相互影响。
const scripts = dirname(fileURLToPath(import.meta.url));
const checks = readdirSync(scripts).filter(name => /^check-.*\.mjs$/.test(name)).sort();
if (!checks.length) throw new Error('没有找到回归检查脚本');
const failed = [];
for (const check of checks) {
  console.log(`\n[回归] ${check}`);
  const result = spawnSync(process.execPath, [join(scripts, check)], { cwd: dirname(scripts), stdio: 'inherit' });
  if (result.signal) {
    console.error(`检查被中断：${check} (${result.signal})`);
    process.exit(1);
  }
  if (result.error || result.status !== 0) failed.push(check);
}
console.log(`\n${checks.length - failed.length}/${checks.length} 个检查通过`);
if (failed.length) {
  console.error('失败：' + failed.join('、'));
  process.exitCode = 1;
}
