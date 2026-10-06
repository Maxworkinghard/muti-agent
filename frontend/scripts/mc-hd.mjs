// 高清材质：只取礼堂用到的方块贴图，材质包有的用材质包，没有的把原版按最近邻放大到同样的像素密度；
// 同时生成法线贴图（亮度做 Sobel）和粗糙度/金属度贴图（按材质类别查表），三张图位置一一对应。
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createServer } from 'vite';

const json = (b) => JSON.parse(new TextDecoder().decode(b));

/** 粗糙度、金属度按贴图名归类：木 0.7、石 0.85、羊毛 0.95、金属 0.3、玻璃 0.05（第 11.3 节）。 */
function material(name) {
  if (/glass/.test(name)) return { rough: 0.06, metal: 0 };
  if (/iron|chain|lantern|bell|anvil|gold_block|copper|lightning_rod/.test(name)) return { rough: 0.38, metal: 0.85 };
  if (/wool|carpet/.test(name)) return { rough: 0.96, metal: 0 };
  if (/planks|log|wood|door|trapdoor|barrel|bookshelf|lectern|ladder|fence|scaffold|shelf/.test(name)) return { rough: 0.72, metal: 0 };
  if (/leaves|azalea|grass|fern|flower|moss|vine/.test(name)) return { rough: 0.62, metal: 0 };
  if (/terracotta|concrete/.test(name)) return { rough: 0.55, metal: 0 };
  return { rough: 0.86, metal: 0 };
}

/** 收集礼堂用到的方块贴图：用游戏自己的方块状态和模型解析，和渲染走同一套代码。 */
async function usedTextures(root, states, models) {
  const vite = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const [{ buildDebateRoom }, model] = await Promise.all([
      vite.ssrLoadModule('/src/mc/rooms/debate.ts'),
      vite.ssrLoadModule('/src/mc/blockModel.ts'),
    ]);
    const room = buildDebateRoom();
    const used = new Set();
    // 道具（红石灯）直接用游戏的灯贴图，不挂在房间方块上，手动加上。
    used.add('block/redstone_lamp');
    used.add('block/redstone_lamp_on');
    // 运行时会切换状态的方块（灯笼等）两种状态都收。
    const variants = (b) => [b, ...(b.id === 'lantern' ? [{ ...b, props: { ...b.props, hanging: b.props.hanging === 'true' ? 'false' : 'true' } }] : [])];
    for (const block of room.blocks) for (const b of variants(block)) for (const ref of model.blockModels({ states }, b)) {
      const m = model.resolveModel(models, ref.model);
      for (const e of m.elements ?? []) for (const face of Object.values(e.faces)) used.add(model.resolveTexture(m, face.texture));
    }
    return [...used].sort();
  } finally {
    await vite.close();
  }
}

function scaleNearest(png, factor) {
  if (factor === 1) return png;
  const out = new PNG({ width: png.width * factor, height: png.height * factor });
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const s = (Math.floor(y / factor) * png.width + Math.floor(x / factor)) * 4, d = (y * out.width + x) * 4;
    out.data.set(png.data.subarray(s, s + 4), d);
  }
  return out;
}

/** 法线：亮度当高度（暗的缝隙更深），在每一帧内部求导，透明像素朝外。 */
function normalMap(png, frameHeight, strength) {
  const out = new PNG({ width: png.width, height: png.height });
  const lum = (x, y) => { const i = (y * png.width + x) * 4; return png.data[i + 3] < 8 ? null : (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) / 255; };
  for (let y = 0; y < png.height; y++) {
    const top = Math.floor(y / frameHeight) * frameHeight, bottom = top + frameHeight - 1;
    for (let x = 0; x < png.width; x++) {
      const d = (y * png.width + x) * 4, h = lum(x, y);
      let nx = 0, ny = 0;
      if (h !== null) {
        const at = (xx, yy) => lum(Math.min(png.width - 1, Math.max(0, xx)), Math.min(bottom, Math.max(top, yy))) ?? h;
        const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        nx = -gx * strength; ny = gy * strength; // 贴图的 y 向下，切线空间的 y 向上
      }
      const len = Math.hypot(nx, ny, 1);
      out.data[d] = Math.round((nx / len * 0.5 + 0.5) * 255);
      out.data[d + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      out.data[d + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out.data[d + 3] = 255;
    }
  }
  return out;
}

/** 粗糙度在 G、金属度在 B（three 的约定），按亮度微调：越暗越粗糙一点。 */
function ormMap(png, name) {
  const { rough, metal } = material(name);
  const out = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const l = (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) / 255;
    const r = Math.min(1, Math.max(0.03, rough + (0.5 - l) * 0.12));
    out.data[i] = 255; out.data[i + 1] = Math.round(r * 255); out.data[i + 2] = Math.round(metal * 255); out.data[i + 3] = 255;
  }
  return out;
}

function pack(entries, padding) {
  const width = 2048, table = {}, placed = [];
  let x = padding, y = padding, row = 0;
  for (const e of entries) {
    if (x + e.color.width + padding > width) { x = padding; y += row + padding * 2; row = 0; }
    table[e.name] = { x, y, width: e.color.width, height: e.color.height, animation: e.animation, alpha: e.alpha };
    placed.push({ ...e, x, y });
    x += e.color.width + padding * 2; row = Math.max(row, e.color.height);
  }
  const height = 2 ** Math.ceil(Math.log2(y + row + padding));
  const sheets = ['color', 'normal', 'orm'].map(() => new PNG({ width, height }));
  sheets.forEach((s) => s.data.fill(0));
  for (const p of placed) for (const [k, sheet] of [['color', sheets[0]], ['normal', sheets[1]], ['orm', sheets[2]]]) {
    const src = p[k];
    // 四周复制边缘像素，缩小采样时不串色。
    for (let yy = -padding; yy < src.height + padding; yy++) for (let xx = -padding; xx < src.width + padding; xx++) {
      const sx = Math.max(0, Math.min(src.width - 1, xx)), sy = Math.max(0, Math.min(src.height - 1, yy));
      const s = (sy * src.width + sx) * 4, d = ((p.y + yy) * width + p.x + xx) * 4;
      sheet.data.set(src.data.subarray(s, s + 4), d);
    }
  }
  return { table: { width, height, textures: table }, sheets };
}

export async function buildHd({ root, output, jar, packPath, pack: zip, states, models, write, writeJson }) {
  const used = await usedTextures(root, states, models);
  const resolution = 64, entries = [], upscaled = [];
  for (const name of used) {
    const file = `assets/minecraft/textures/${name}.png`;
    const source = zip[file] ?? jar[file];
    if (!source) throw new Error('原版和材质包里都没有贴图：' + file);
    let png = PNG.sync.read(Buffer.from(source));
    const meta = (zip[file] && zip[file + '.mcmeta']) ?? jar[file + '.mcmeta'];
    const animation = meta ? json(meta).animation : undefined;
    const factor = resolution / (animation?.width ?? png.width);
    if (!zip[file]) upscaled.push(name);
    if (factor !== 1) png = scaleNearest(png, Math.max(1, Math.round(factor)));
    let cut = false, trans = false;
    for (let a = 3; a < png.data.length; a += 4) { if (png.data[a] === 0) cut = true; else if (png.data[a] < 255) trans = true; }
    const frameHeight = animation?.height ? animation.height * Math.round(factor) : png.width;
    const companion=(suffix)=>{const p=zip[file.replace(/\.png$/,suffix+'.png')];if(!p)return null;let out=PNG.sync.read(Buffer.from(p));const scale=png.width/out.width;if(scale>1&&Number.isInteger(scale))out=scaleNearest(out,scale);if(out.width!==png.width||out.height!==png.height)throw new Error('PBR 贴图尺寸不一致：'+name+suffix);return out;};
    entries.push({ name, color: png, normal: companion('_n')??normalMap(png, Math.min(frameHeight, png.height), 2.2), orm: companion('_s')??ormMap(png, name), animation, alpha: trans ? 'translucent' : cut ? 'cutout' : 'opaque' });
  }
  const { table, sheets } = pack(entries, 8);
  await write('hd/atlas.png', PNG.sync.write(sheets[0]));
  await write('hd/atlas_n.png', PNG.sync.write(sheets[1]));
  await write('hd/atlas_s.png', PNG.sync.write(sheets[2]));
  await writeJson('hd/atlas.json', table);
  const license = zip['LICENSE.txt'] ?? zip['LICENSE'] ?? zip['license.txt'];
  if (license) await write('hd/LICENSE.txt', Buffer.from(license));
  const packName = path.basename(packPath).replace(/\.zip$/i, '');
  const entities={},entityFallback=[];
  for(const name of ['banner_base','gradient_up','curly_border','rhombus','circle']){
    const relative=`entity/banner/${name}.png`,file='assets/minecraft/textures/'+relative,source=zip[file]??jar[file];if(!source)throw new Error('缺少旗帜贴图：'+relative);
    const original=PNG.sync.read(Buffer.from(jar[file])),image=PNG.sync.read(Buffer.from(source));const density=image.width/original.width;
    const hd=density<4?scaleNearest(image,Math.round(4/density)):image;
    if(!zip[file])entityFallback.push(relative);
    const target='hd/textures/'+relative;await write(target,PNG.sync.write(hd));entities[relative]=target;
  }
  await write('hd/CREDITS.md', [
    `# ${packName}`,
    '',
    '- 材质包：Faithful 64x（https://faithfulpack.net），从官方 Modrinth 页面下载',
    '- 许可：Faithful 许可（署名、附官网链接和许可原文、不得商用），原文见同目录 LICENSE.txt',
    `- 用到的贴图（${used.length - upscaled.length} 张来自材质包${upscaled.length ? `，${upscaled.length} 张材质包没有、由原版放大补齐` : ''}）：`,
    ...used.map((n) => `  - ${n}${upscaled.includes(n) ? '（原版放大）' : ''}`),
    '- 旗帜：'+Object.keys(entities).map(n=>n+(entityFallback.includes(n)?'（原版放大）':'')).join('、'),
    '- 优先使用包里的 `_n`、`_s`；缺失的法线按亮度生成，粗糙度按材质类别生成（G：粗糙度，B：金属度）',
    '',
  ].join('\n'));
  await writeJson('hd/manifest.json', { pack: packName, resolution, atlas: 'hd/atlas.png', normal: 'hd/atlas_n.png', orm: 'hd/atlas_s.png', atlasIndex: 'hd/atlas.json', textures: used.length, upscaled, entities,entityFallback,credit: '材质：Faithful 64x · faithfulpack.net' });
  return { textures: used.length, upscaled: upscaled.length, size: [table.width, table.height] };
}
