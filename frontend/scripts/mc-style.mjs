/* 12.14 的 C 候选：只重画辩论室使用的墙、木材、书架和长凳。游戏本体只读。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public/mc/style');
const atlas=JSON.parse(await fs.readFile(path.join(root,'public/mc/atlas.json'),'utf8'));
const source=PNG.sync.read(await fs.readFile(path.join(root,'public/mc/atlas.png')));
const assets=JSON.parse(await fs.readFile(path.join(root,'public/mc/blocks.json'),'utf8'));
const vite=await createServer({root,configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
let used;
try{
  const [{buildDebateRoom},{blockModels,resolveModel,resolveTexture}]=await Promise.all([vite.ssrLoadModule('/src/mc/rooms/debate.ts'),vite.ssrLoadModule('/src/mc/blockModel.ts')]);
  used=new Set();for(const b of buildDebateRoom().blocks)for(const ref of blockModels(assets,b)){
    const m=resolveModel(assets.models,ref.model);for(const e of m.elements??[])for(const f of Object.values(e.faces))used.add(resolveTexture(m,f.texture));
  }
}finally{await vite.close();}
const palette={cream:'#f5dfb0',creamEdge:'#ddc293',stone:'#74717c',stoneEdge:'#5c5866',wood:'#ad7547',woodLight:'#cc975b',woodEdge:'#805233',red:'#a74a59'};
function draw(name){
  const p=new PNG({width:16,height:16});
  const rgb=s=>[...s.slice(1).match(/../g)].map(x=>parseInt(x,16));
  const rect=(x,y,w,h,color)=>{const col=rgb(color);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){if(xx<0||xx>15||yy<0||yy>15)continue;const i=(yy*16+xx)*4;p.data.set([...col,255],i);}};
  const edge=(color,light)=>{rect(0,0,16,1,light);rect(0,0,1,16,light);rect(0,15,16,1,color);rect(15,0,1,16,color);};
  if(/sandstone/.test(name)){rect(0,0,16,16,palette.cream);edge(palette.creamEdge,'#ffebc5');rect(3,5,6,1,'#f9e5bb');rect(10,11,3,1,'#eed7a8');}
  else if(/gray_concrete/.test(name)){rect(0,0,16,16,palette.stone);edge(palette.stoneEdge,'#928995');rect(2,3,12,1,'#807b87');rect(2,11,12,1,'#6a6573');}
  else if(/red_wool/.test(name)){rect(0,0,16,16,palette.red);edge('#773944','#c66b76');rect(2,7,12,1,'#b25463');}
  else if(/bookshelf/.test(name)){
    rect(0,0,16,16,palette.woodEdge);rect(0,0,16,2,palette.woodLight);rect(0,7,16,2,palette.wood);rect(0,14,16,2,palette.woodLight);
    const colors=['#447997','#c36c58','#8fa561','#d8b563','#72628c','#4f9782'];
    for(const y of [2,9])for(let i=0;i<6;i++){rect(1+i*2.4|0,y,2,5,colors[(i+(y===2?0:2))%6]);rect(1+i*2.4|0,y+1,1,1,'#f2d6a1');}
    edge(palette.woodEdge,palette.woodLight);
  }else if(/log_top/.test(name)){
    rect(0,0,16,16,palette.woodLight);for(const n of [1,4,7]){rect(n,n,16-2*n,1,palette.woodEdge);rect(n,15-n,16-2*n,1,palette.woodEdge);rect(n,n,1,16-2*n,palette.woodEdge);rect(15-n,n,1,16-2*n,palette.woodEdge);}
  }else if(/log/.test(name)){
    rect(0,0,16,16,palette.wood);for(const x of [0,5,10,15])rect(x,0,1,16,palette.woodEdge);rect(2,0,1,16,palette.woodLight);rect(12,0,1,16,palette.woodLight);
  }else{
    const birch=/birch/.test(name);rect(0,0,16,16,birch?'#d5b77d':palette.wood);const dark=birch?'#ac905d':palette.woodEdge,light=birch?'#e6c990':palette.woodLight;
    for(const y of [0,4,8,12]){rect(0,y,16,1,dark);rect(0,y+1,16,1,light);rect(y%8?5:11,y,1,4,dark);}edge(dark,light);
  }
  return p;
}
const selected=[...used].sort().filter(n=>/^block\/(birch_planks|spruce_planks|spruce_log(_top)?|(?:smooth_)?sandstone.*|(?:light_)?gray_concrete|bookshelf|chiseled_bookshelf.*|red_wool)$/.test(n));
await fs.mkdir(out,{recursive:true});
for(const name of selected){const tile=atlas.textures[name],p=draw(name);
  for(let y=-2;y<tile.height+2;y++)for(let x=-2;x<tile.width+2;x++){
    const sx=Math.max(0,Math.min(15,Math.floor(x*16/tile.width))),sy=Math.max(0,Math.min(15,Math.floor(y*16/tile.height)));
    source.data.set(p.data.subarray((sy*16+sx)*4,(sy*16+sx)*4+4),((tile.y+y)*source.width+tile.x+x)*4);
  }
  await fs.writeFile(path.join(out,name.replaceAll('/','-')+'.png'),PNG.sync.write(p));
}
await fs.writeFile(path.join(out,'atlas.png'),PNG.sync.write(source));
await fs.writeFile(path.join(out,'atlas.json'),JSON.stringify(atlas)+'\n');
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({pack:'debate-pixel',resolution:16,atlas:'style/atlas.png',atlasIndex:'style/atlas.json',textures:selected.length,credit:'辩论室像素配色 · 自绘候选',redrawn:selected,palette})+'\n');
console.log(JSON.stringify({output:out,redrawn:selected},null,2));
