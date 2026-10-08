import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 家具、地毯、吊灯这些道具直接用方块贴图（k.block(...,{side:'block/oak_planks'})、blockArmchair(k,'white_wool',...)），
 * 它们不在房间的方块列表里，高清包和风格包按房间方块收集贴图时会漏掉。
 * 这里扫 src/mc 下的源码，把字符串里出现的、确实存在的方块贴图名都收进来：
 * 'block/xxx' 直接收；单独的 'xxx' 如果有 block/xxx 这张贴图也收（连同 xxx_top、xxx_bottom）。
 * known 是原版有的贴图名集合（形如 block/oak_planks）。
 */
export async function sourceTextures(root, known) {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (/\.tsx?$/.test(entry.name)) files.push(p);
    }
  };
  await walk(path.join(root, 'src/mc'));
  const found = new Set();
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    for (const [, s] of text.matchAll(/'([a-z0-9_/]+)'/g)) {
      const name = s.startsWith('block/') ? s : 'block/' + s;
      for (const n of [name, name + '_top', name + '_bottom']) if (known.has(n)) found.add(n);
    }
  }
  return [...found].sort();
}
