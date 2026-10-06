/* 只重建 HD 材质包（全量 mc:import 在音效复制阶段卡死过一次；其余产物未变）。
   node run-hd-only.mjs */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { buildHd } from './mc-hd.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/mc');
const mc = process.env.MC_DIR ?? 'F:/MC/.minecraft';
const read = async p => { try { return await fs.readFile(p); } catch { throw new Error('读不到游戏资源：' + p); } };
const json = b => JSON.parse(new TextDecoder().decode(b));
async function write(name, data) { const b = typeof data === 'string' ? Buffer.from(data) : data; const p = path.join(output, name); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, b); }
const writeJson = (name, data) => write(name, JSON.stringify(data) + '\n');
const version = process.env.MC_VERSION ?? '26.3';
const jarPath = path.join(mc, 'versions', version, version + '.jar');
const bytes = await read(jarPath), jar = unzipSync(bytes), names = Object.keys(jar).sort();
const states = {}, models = {};
for (const n of names) {
  if (n.startsWith('assets/minecraft/blockstates/') && n.endsWith('.json')) states[n.split('/').at(-1).slice(0, -5)] = json(jar[n]);
  if (n.startsWith('assets/minecraft/models/block/') && n.endsWith('.json')) models[n.split('/models/')[1].slice(0, -5)] = json(jar[n]);
}
let packPath = process.env.MC_PACK;
if (!packPath) { const dir = path.join(mc, 'versions', version, 'resourcepacks'); const found = (await fs.readdir(dir).catch(() => [])).filter(f => /faithful/i.test(f) && /64x/i.test(f) && f.endsWith('.zip')).sort(); if (found.length) packPath = path.join(dir, found.at(-1)); }
if (!packPath) throw new Error('没有找到 Faithful 64x 材质包');
const hd = await buildHd({ root, output, jar, packPath, pack: unzipSync(await read(packPath)), states, models, write, writeJson });
console.log('HD rebuilt:', JSON.stringify(hd));
