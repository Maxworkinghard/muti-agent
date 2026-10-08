/* 视觉重构：产品默认材质包 pixel2d —— 覆盖六房实际用到的全部方块贴图，奶油墙/mint 地/蜜木/饱和布面。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import {createServer} from 'vite';
import {sourceTextures} from './mc-textures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/mc/style');
const atlas = JSON.parse(await fs.readFile(path.join(root, 'public/mc/atlas.json'), 'utf8'));
const source = PNG.sync.read(await fs.readFile(path.join(root, 'public/mc/atlas.png')));
const assets = JSON.parse(await fs.readFile(path.join(root, 'public/mc/blocks.json'), 'utf8'));

const vite = await createServer({root, configFile: false, logLevel: 'error', server: {middlewareMode: true, hmr: false}, appType: 'custom'});
let used;
try {
  const [{buildMcRoom, MC_SCENE_KINDS}, {blockModels, resolveModel, resolveTexture}] = await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/blockModel.ts'),
  ]);
  used = new Set();
  for (const b of MC_SCENE_KINDS.flatMap(kind => {
    const room = buildMcRoom(kind);
    return [...room.blocks, ...room.ceiling, ...(room.cutaway ?? [])];
  })) {
    for (const ref of blockModels(assets, b)) {
      const m = resolveModel(assets.models, ref.model);
      for (const e of m.elements ?? []) for (const f of Object.values(e.faces)) used.add(resolveTexture(m, f.texture));
    }
  }
  // 道具直接用的方块贴图（家具、地毯、吊灯……），从源码里找。
  for (const name of await sourceTextures(root, new Set(Object.keys(atlas.textures)))) used.add(name);
} finally {
  await vite.close();
}

/** 与 UI 视觉宪法对齐 */
const P = {
  cream: '#F0E6D2', cream2: '#fff8ea', creamEdge: '#ebcc9e',
  mint: '#77a892', mintDark: '#5f8f7c', mintLight: '#8fb8a6',
  wood: '#d4a86a', woodLight: '#e4bc80', woodEdge: '#a87840', woodDark: '#8a5a34',
  blue: '#3d8bff', magenta: '#ff4d9a', yellow: '#f0c84a',
  orange: '#ff7a2f', green: '#3dba6e', purple: '#9b6fe0', red: '#ff5a5a',
  ink: '#2b2136', ink2: '#5a4e66', stone: '#d9cdb4', stoneEdge: '#b8ab94',
  glass: '#9fd3ea', glassShine: '#e6f6fb',
  grass: '#6aa86a', leaf: '#4f9a4a', dirt: '#9c7450',
};

function rgb(s) { return [...s.slice(1).match(/../g)].map(x => parseInt(x, 16)); }
function shade(hex, k) {
  const c = rgb(hex);
  return '#' + c.map(v => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1)))).toString(16).padStart(2, '0')).join('');
}

function draw(name) {
  const p = new PNG({width: 16, height: 16});
  const rect = (x, y, w, h, color) => {
    const col = rgb(color);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx > 15 || yy < 0 || yy > 15) continue;
      p.data.set([...col, 255], (yy * 16 + xx) * 4);
    }
  };
  const edge = (dark, light) => {
    rect(0, 0, 16, 1, light); rect(0, 0, 1, 16, light);
    rect(0, 15, 16, 1, dark); rect(15, 0, 1, 16, dark);
  };
  const flat = (base, e = .88) => { rect(0, 0, 16, 16, base); edge(shade(base, e), shade(base, 1.08)); };
  const planks = (base) => {
    const dark = shade(base, .78), light = shade(base, 1.12);
    rect(0, 0, 16, 16, base);
    for (const y of [0, 4, 8, 12]) { rect(0, y, 16, 1, light); rect(0, y + 3, 16, 1, dark); rect(y % 8 ? 11 : 4, y, 1, 4, dark); }
    edge(dark, light);
  };
  const bark = (base) => {
    rect(0, 0, 16, 16, base);
    for (const x of [1, 6, 11]) rect(x, 0, 1, 16, shade(base, .78));
    for (const x of [3, 9, 14]) rect(x, 0, 1, 16, shade(base, 1.12));
  };
  const rings = (base) => {
    rect(0, 0, 16, 16, shade(base, .75)); rect(1, 1, 14, 14, base);
    for (const n of [3, 6]) {
      rect(n, n, 16 - 2 * n, 1, shade(base, .8)); rect(n, 15 - n, 16 - 2 * n, 1, shade(base, .8));
      rect(n, n, 1, 16 - 2 * n, shade(base, .8)); rect(15 - n, n, 1, 16 - 2 * n, shade(base, .8));
    }
    rect(7, 7, 2, 2, shade(base, 1.1));
  };
  const wool = (base) => { rect(0, 0, 16, 16, base); edge(shade(base, .75), shade(base, 1.15)); rect(2, 7, 12, 1, shade(base, .9)); };
  const books = () => {
    rect(0, 0, 16, 16, P.woodEdge); rect(0, 0, 16, 2, P.woodLight); rect(0, 7, 16, 2, P.wood); rect(0, 14, 16, 2, P.woodLight);
    // 少量饱和书脊，避免土气彩虹墙
    const colors = [P.blue, P.magenta, P.yellow, P.green, P.orange, P.purple];
    for (const y of [2, 9]) for (let i = 0; i < 5; i++) {
      const c = colors[(i + (y === 2 ? 0 : 2)) % colors.length];
      rect(1 + i * 3, y, 2, 5, c); rect(1 + i * 3, y + 1, 1, 1, shade(c, 1.2));
    }
    edge(P.woodEdge, P.woodLight);
  };
  const glass = () => {
    rect(0, 0, 16, 16, P.glass); edge(P.woodDark, P.woodLight); rect(7, 0, 2, 16, P.woodDark);
    for (let i = 0; i < 4; i++) { rect(2 + i, 9 - i * 2, 1, 1, P.glassShine); rect(10 + i, 11 - i * 2, 1, 1, P.glassShine); }
  };
  const leaves = (base) => {
    rect(0, 0, 16, 16, base);
    for (let i = 0; i < 14; i++) {
      const x = (i * 5 + 3) % 14, y = (i * 7 + 2) % 14;
      rect(x, y, 2, 2, i % 2 ? shade(base, .8) : shade(base, 1.15));
    }
  };
  const grass = () => {
    rect(0, 0, 16, 16, P.grass);
    for (let i = 0; i < 9; i++) { const x = (i * 3 + 1) % 15, y = (i * 5) % 14; rect(x, y + 1, 1, 1, shade(P.grass, .86)); rect(x, y, 1, 1, shade(P.grass, 1.12)); }
  };

  // —— 分类绘制（缺块策略：尽量匹配族名；兜底奶油平涂）——
  if (/bookshelf|chiseled_bookshelf/.test(name)) books();
  else if (/glass_pane_top|glass$/.test(name) && !/tinted|stained/.test(name)) glass();
  else if (/_stained_glass/.test(name)) { flat(P.glass); }
  else if (/leaves|azalea/.test(name)) leaves(P.leaf);
  else if (/grass_block_top|grass$|short_grass|tall_grass/.test(name)) grass();
  else if (/grass_block_side/.test(name)) { rect(0, 0, 16, 16, P.dirt); rect(0, 0, 16, 6, P.grass); edge(P.dirt, shade(P.grass, 1.1)); }
  else if (/dirt_path/.test(name)) flat(P.wood);
  else if (/dirt|podzol|mud|rooted_dirt|farmland|coarse_dirt/.test(name)) flat(P.dirt, .82);
  else if (/log_top|stem_top|wood_top/.test(name)) rings(P.wood);
  else if (/_log$|_stem$|stripped_.*log|bark/.test(name)) bark(P.woodDark);
  else if (/planks|bamboo_mosaic|mosaic/.test(name)) {
    if (/birch/.test(name)) planks('#e4c990');
    else if (/spruce|dark_oak|mangrove/.test(name)) planks(P.woodDark);
    else if (/cherry|crimson/.test(name)) planks('#d4889a');
    else if (/warped/.test(name)) planks('#4aa898');
    else planks(P.wood);
  }
  else if (/sandstone|red_sandstone/.test(name)) {
    flat(/red_/.test(name) ? shade(P.creamEdge, .92) : P.cream);
    if (/top/.test(name)) { rect(3, 5, 6, 1, shade(P.cream, 1.05)); rect(10, 11, 3, 1, shade(P.creamEdge, .95)); }
  }
  else if (/quartz|smooth_quartz|calcite|diorite|bone_block/.test(name)) flat(P.cream2);
  else if (/smooth_stone|stone_bricks|stone$|andesite|cobblestone|deepslate|tuff|bricks$|terracotta$/.test(name) && !/glazed|red_|blue_|green_|yellow_|pink_|magenta_|cyan_|lime_|orange_|purple_|brown_|black_|white_|gray_|light_/.test(name)) {
    flat(P.stone);
  }
  else if (/white_concrete|light_gray_concrete|white_wool|white_terracotta|snow|powder_snow/.test(name)) flat(P.cream);
  else if (/gray_concrete|light_gray_|gray_wool|gray_terracotta|iron_block|raw_iron/.test(name)) flat(P.stoneEdge);
  else if (/brown_concrete|brown_wool|brown_terracotta|stripped_.*_log_top/.test(name)) flat(P.woodDark);
  else if (/blue_wool|blue_concrete|blue_terracotta|lapis/.test(name)) wool(P.blue);
  else if (/red_wool|red_concrete|red_terracotta|redstone_block/.test(name)) wool(P.magenta);
  else if (/magenta_wool|pink_wool|magenta_concrete|pink_concrete/.test(name)) wool(P.magenta);
  else if (/yellow_wool|yellow_concrete|gold_block|raw_gold|honey_block/.test(name)) wool(P.yellow);
  else if (/orange_wool|orange_concrete|copper_block|raw_copper|cut_copper/.test(name)) wool(P.orange);
  else if (/lime_wool|green_wool|lime_concrete|green_concrete|emerald/.test(name)) wool(P.green);
  else if (/cyan_wool|cyan_concrete|prismarine|sea_lantern|glowstone|shroomlight|froglight/.test(name)) {
    if (/sea_lantern|glowstone|shroomlight|froglight/.test(name)) {
      rect(0, 0, 16, 16, P.mintLight); edge(P.mintDark, shade(P.mintLight, 1.1));
      for (let y = 2; y < 14; y += 4) for (let x = 2; x < 14; x += 4) rect(x, y, 2, 2, P.yellow);
    } else wool(P.mint);
  }
  else if (/purple_wool|purple_concrete|amethyst/.test(name)) wool(P.purple);
  else if (/black_wool|black_concrete|obsidian|coal_block|netherite/.test(name)) flat(P.ink2);
  else if (/door|trapdoor|sign|hanging_sign|shelf/.test(name)) planks(P.wood);
  else if (/lantern|torch|candle|campfire|fire/.test(name)) {
    rect(0, 0, 16, 16, P.woodDark); rect(4, 2, 8, 10, P.yellow); rect(5, 3, 6, 8, shade(P.yellow, 1.15));
  }
  else if (/water/.test(name)) { flat('#6eb6d4'); }
  else if (/iron_door|iron_bars|iron_trapdoor|chain|hopper|cauldron|anvil/.test(name)) flat('#9aa3b0');
  else if (/potted_|flower|tulip|orchid|allium|daisy|cornflower|lilac|rose|dandelion|poppy|wither_rose|torchflower|pink_petals|wildflowers/.test(name)) {
    rect(0, 0, 16, 16, P.cream2); rect(7, 8, 2, 8, P.leaf); rect(5, 4, 6, 5, P.magenta);
  }
  else if (/fern|bush|dead_bush|vine|sugar_cane|bamboo|cactus|seagrass|kelp|lily/.test(name)) leaves(P.leaf);
  else if (/light$/.test(name)) { /* invisible light cube — keep near-white translucent-ish cream */ flat(P.cream2); }
  else if (/sand$|gravel|clay|soul_sand|soul_soil/.test(name)) flat(P.creamEdge);
  else flat(P.cream); // 兜底：奶油平涂，不留 Faithful 写实噪点

  return p;
}

const selected = [...used].filter(n => n && atlas.textures[n]).sort();
await fs.mkdir(out, {recursive: true});

// 先整图拷贝原版 atlas，再按 selected 覆盖（缺块策略：未在 used 的保持原版；used 的一律像素重绘）
for (const name of selected) {
  const tile = atlas.textures[name], tilePng = draw(name);
  for (let y = -2; y < tile.height + 2; y++) for (let x = -2; x < tile.width + 2; x++) {
    const sx = Math.max(0, Math.min(15, Math.floor(x * 16 / tile.width)));
    const sy = Math.max(0, Math.min(15, Math.floor(y * 16 / tile.height)));
    source.data.set(tilePng.data.subarray((sy * 16 + sx) * 4, (sy * 16 + sx) * 4 + 4), ((tile.y + y) * source.width + tile.x + x) * 4);
  }
  await fs.writeFile(path.join(out, name.replaceAll('/', '-') + '.png'), PNG.sync.write(tilePng));
}

await fs.writeFile(path.join(out, 'atlas.png'), PNG.sync.write(source));
await fs.writeFile(path.join(out, 'atlas.json'), JSON.stringify(atlas) + '\n');
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({
  pack: 'pixel2d',
  resolution: 16,
  atlas: 'style/atlas.png',
  atlasIndex: 'style/atlas.json',
  textures: selected.length,
  credit: 'pixel2d / cream wall / mint floor / honey wood',
  redrawn: selected,
  palette: P,
  note: 'missing-tile policy: all room-used textures redrawn; unused atlas slots keep original copy',
}) + '\n');

console.log(JSON.stringify({output: out, used: used.size, redrawn: selected.length, sample: selected.slice(0, 20)}, null, 2));
