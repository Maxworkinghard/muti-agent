import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import { buildFont } from './mc-font.mjs';
import { buildHd } from './mc-hd.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'public/mc');
const mc=process.env.MC_DIR ?? 'F:/MC/.minecraft';
const savedMaterial=await fs.readFile(path.join(output,'manifest.json'),'utf8').then(b=>JSON.parse(b).material).catch(()=>undefined);
const material=process.argv.find(x=>x.startsWith('--material='))?.slice(11)??process.env.MC_MATERIAL??savedMaterial??'hd';
if(!['original','hd','style'].includes(material))throw new Error('材质选项应为 original、hd 或 style');
const read=async p=>{try{return await fs.readFile(p);}catch{throw new Error('读不到游戏资源：'+p);}};
const json=b=>JSON.parse(new TextDecoder().decode(b));
const normalize=n=>n.replace(/^minecraft:/,'');
async function write(name,data) {const b=typeof data==='string'?Buffer.from(data):data;if(b.byteLength>50*1024*1024)throw new Error('文件超过 50 MB：'+name);const p=path.join(output,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,b);}
const writeJson=(name,data)=>write(name,JSON.stringify(data)+'\n');

function atlas(files,jar) {
  const entries={}; let x=2,y=2,row=0;
  const images=[];
  for(const f of files.sort()) {
    const png=PNG.sync.read(Buffer.from(jar[f]));
    const meta=jar[f+'.mcmeta']?json(jar[f+'.mcmeta']):{};
    const anim=meta.animation;
    // Keep every animation frame; coordinates are independent of frame order.
    if(x+png.width+2>2048){x=2;y+=row+4;row=0;}
    entries[f.split('/textures/')[1].slice(0,-4)]={x,y,width:png.width,height:png.height,animation:anim,alpha:'opaque'};
    let cut=false,trans=false;
    for(let a=3;a<png.data.length;a+=4){if(png.data[a]===0)cut=true;else if(png.data[a]<255)trans=true;}
    entries[f.split('/textures/')[1].slice(0,-4)].alpha=trans?'translucent':cut?'cutout':'opaque';
    images.push({png,x,y});x+=png.width+4;row=Math.max(row,png.height);
  }
  const height=2**Math.ceil(Math.log2(y+row+2));
  const dest=new PNG({width:2048,height});
  for(const {png,x,y} of images) for(let yy=-2;yy<png.height+2;yy++) for(let xx=-2;xx<png.width+2;xx++) {
    const sx=Math.max(0,Math.min(png.width-1,xx)),sy=Math.max(0,Math.min(png.height-1,yy));
    const s=(sy*png.width+sx)*4,d=((y+yy)*2048+x+xx)*4;
    dest.data.set(png.data.subarray(s,s+4),d);
  }
  return {png:PNG.sync.write(dest),table:{width:2048,height,textures:entries}};
}

try {
  let versions;try{versions=await fs.readdir(path.join(mc,'versions'));}catch{throw new Error('读不到游戏目录：'+path.join(mc,'versions'));}
  const version=process.env.MC_VERSION ?? versions.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
  const jarPath=path.join(mc,'versions',version,version+'.jar');
  const bytes=await read(jarPath),jar=unzipSync(bytes),names=Object.keys(jar).sort();
  // 高清材质包：MC_PACK 指定；没指定时用这个版本 resourcepacks 文件夹里的 Faithful 64x。原版素材照旧导出，作为没有高清时的退路。
  let packPath=process.env.MC_PACK;
  if(!packPath){const dir=path.join(mc,'versions',version,'resourcepacks');const found=(await fs.readdir(dir).catch(()=>[])).filter(f=>/faithful/i.test(f)&&/64x/i.test(f)&&f.endsWith('.zip')).sort();if(found.length)packPath=path.join(dir,found.at(-1));}
  const versionJson=json(await read(path.join(mc,'versions',version,version+'.json')));
  const indexPath=path.join(mc,'assets/indexes',versionJson.assetIndex.id+'.json');
  const index=json(await read(indexPath)).objects;
  const asset=async name=>{const item=index['minecraft/'+name];if(!item)throw new Error('资源索引缺少：minecraft/'+name+'（'+indexPath+'）');return read(path.join(mc,'assets/objects',item.hash.slice(0,2),item.hash));};
  const states={},models={},itemDefs={},itemModels={};
  for(const n of names) {
    if(n.startsWith('assets/minecraft/blockstates/')&&n.endsWith('.json'))states[n.split('/').at(-1).slice(0,-5)]=json(jar[n]);
    if(n.startsWith('assets/minecraft/models/block/')&&n.endsWith('.json'))models[n.split('/models/')[1].slice(0,-5)]=json(jar[n]);
    if(n.startsWith('assets/minecraft/items/')&&n.endsWith('.json'))itemDefs[n.split('/').at(-1).slice(0,-5)]=json(jar[n]);
    if(n.startsWith('assets/minecraft/models/item/')&&n.endsWith('.json'))itemModels[n.split('/models/')[1].slice(0,-5)]=json(jar[n]);
  }
  await writeJson('blocks.json',{states,models});await writeJson('items.json',{items:itemDefs,models:itemModels});
  const blocks=atlas(names.filter(n=>n.startsWith('assets/minecraft/textures/block/')&&n.endsWith('.png')),jar);
  await write('atlas.png',blocks.png);await writeJson('atlas.json',blocks.table);
  const items=atlas(names.filter(n=>n.startsWith('assets/minecraft/textures/item/')&&n.endsWith('.png')),jar);
  await write('item-atlas.png',items.png);await writeJson('item-atlas.json',items.table);
  let textureCount=0; const texturePaths=[];
  const prefixes=['entity/bell/','entity/enchantment/','entity/banner/','entity/decorated_pot/','entity/cat/','entity/parrot/','entity/allay/','painting/','gui/sprites/tooltip/','gui/sprites/toast/','gui/sprites/widget/','particle/'];
  const exact=['block/water_still.png','entity/player/wide/steve.png','misc/shadow.png','misc/enchanted_glint_item.png','environment/clouds.png','environment/celestial/sun.png','gui/book.png','colormap/grass.png','colormap/foliage.png'];
  for(const n of names.filter(n=>n.startsWith('assets/minecraft/textures/'))) {
    const p=n.split('/textures/')[1];if(!(prefixes.some(v=>p.startsWith(v))||exact.includes(p))||!(p.endsWith('.png')||p.endsWith('.mcmeta')))continue;
    await write('textures/'+p,jar[n]);textureCount++;texturePaths.push(p);
  }
  const paintings={};for(const n of names.filter(n=>n.startsWith('data/minecraft/painting_variant/')&&n.endsWith('.json')))paintings[n.split('/').at(-1).slice(0,-5)]=json(jar[n]);
  await writeJson('data/painting_variant.json',paintings);
  const soundsJson=jar['assets/minecraft/sounds.json']?json(jar['assets/minecraft/sounds.json']):json(await asset('sounds.json'));
  const sounds={};
  // 背景音乐（第 12.10 节）：轻快的游戏曲 + 唱片 cat/chirp（出结果时的庆祝曲），按曲名导入。
  const gameMusic=[...new Set([...(soundsJson['music.game']?.sounds??[]).map(s=>typeof s==='string'?s:s.name).filter(s=>/\/(haggstrom|danny|left_to_bloom|one_more_day)$/.test(s)),...(soundsJson['music_disc.cat']?.sounds??[]).map(s=>typeof s==='string'?s:s.name),...(soundsJson['music_disc.chirp']?.sounds??[]).map(s=>typeof s==='string'?s:s.name)])];
  if(gameMusic.length!==6)throw new Error('应导入六首候选音乐，实际找到 '+gameMusic.length+' 首');
  const events=['block.bell.use','block.lever.click','item.book.page_turn','block.wood.step','block.wool.step','ui.toast.challenge_complete','item.goat_horn.sound.0','block.candle.ambient','block.firefly_bush.idle','entity.cat.purr','entity.parrot.ambient'];
  const clean=s=>s.replace(/^(minecraft:)?sounds\//,'').replace(/\.ogg$/,'');
  for(const song of gameMusic){sounds['music.game:'+clean(song)]=['sounds/'+clean(song)+'.ogg'];await write('sounds/'+clean(song)+'.ogg',await asset('sounds/'+clean(song)+'.ogg'));}
  // 仅清理上一份导入清单里不再选用的音乐；路径必须仍在本项目的声音目录内。
  const previous=await fs.readFile(path.join(output,'manifest.json')).then(json).catch(()=>null);
  const selectedMusic=new Set(Object.values(sounds).flat()),soundRoot=path.resolve(output,'sounds')+path.sep;
  for(const [event,files] of Object.entries(previous?.sounds??{}))if(event.startsWith('music.game'))for(const file of files){
    const target=path.resolve(output,file);if(!selectedMusic.has(file)&&target.startsWith(soundRoot)&&target.endsWith('.ogg'))await fs.rm(target,{force:true});
  }
  const resolve=(name,seen=new Set())=>{if(seen.has(name))throw new Error('音效引用循环：'+name);const e=soundsJson[name];if(!e)throw new Error('缺少音效事件：'+name);return e.sounds.flatMap(s=>typeof s==='string'?[s]:s.type==='event'?resolve(normalize(s.name),new Set([...seen,name])):[s.name]);};
  for(const e of events){const sources=resolve(e);sounds[e]=[];for(let i=0;i<sources.length;i++){const target=(e.startsWith('music.game:')?'sounds/'+e.slice(11)+'.ogg':'sounds/'+e+'/'+i+'.ogg');await write(target,await asset('sounds/'+normalize(sources[i])+'.ogg'));sounds[e].push(target);}}
  const glyphCount=await buildFont(jar,await asset('font/unifont.zip'),path.join(output,'font'));
  let hd=null;
  if(packPath){hd=await buildHd({root,output,jar,packPath,pack:unzipSync(await read(packPath)),states,models,write,writeJson});console.log('高清材质：'+packPath+'，'+hd.textures+' 张贴图（原版放大补齐 '+hd.upscaled+' 张），拼图 '+hd.size.join('×'));}
  else{await fs.rm(path.join(output,'hd'),{recursive:true,force:true});console.log('没有找到高清材质包，只导出原版素材');}
  await writeJson('manifest.json',{version,material,jarSha1:crypto.createHash('sha1').update(bytes).digest('hex'),blocks:'blocks.json',items:'items.json',atlas:'atlas.png',atlasIndex:'atlas.json',itemAtlas:'item-atlas.png',itemAtlasIndex:'item-atlas.json',font:'font/mc.ttf',textures:texturePaths,sounds,counts:{states:Object.keys(states).length,models:Object.keys(models).length,blockTextures:Object.keys(blocks.table.textures).length,itemTextures:Object.keys(items.table.textures).length,textures:textureCount,paintings:Object.keys(paintings).length,glyphs:glyphCount}});
  console.log(JSON.stringify({version,output,states:Object.keys(states).length,models:Object.keys(models).length,blockTextures:Object.keys(blocks.table.textures).length,textures:textureCount,glyphs:glyphCount,soundFiles:Object.values(sounds).flat().length},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
