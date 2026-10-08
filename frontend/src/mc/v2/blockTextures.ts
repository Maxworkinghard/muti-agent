/**
 * v2 用到的每一张方块贴图的画法（贴图名 → 16×16 像素画）。房间把它交给 Room.paint，加载时画进图集，
 * 覆盖图集里原来的像素；scripts/check-mc-v2.mjs 会核对：房间里每个方块用到的每张贴图都在这里，
 * 所以画面上不出现原版或第三方材质包的像素。方块的形状（楼梯、台阶、栅栏的模型）仍来自现有导入管线。
 */
import type {Painter,Pixels} from '../style';
import {PAL,blend,pick,rng,speckle,tone} from './pixel';

type P=Pixels;
/** 方石砌块：三层错缝的石块，深色灰缝，每块石头单独取色并带一像素亮边。 */
function ashlar(seed:number,colors:string[],mortar:string,moss?:{base:string;light:string;dark:string}):Painter{return p=>{
  const r=rng(seed);p.fill(mortar);const rows=[[0,5],[5,5],[10,6]];
  rows.forEach(([y0,h],ri)=>{let x=ri%2?-3-Math.floor(r()*2):0;while(x<16){const w=5+Math.floor(r()*4),c=pick(r,colors);
    const xa=Math.max(0,x),xb=Math.min(16,x+w-1);if(xb>xa){p.rect(xa,y0,xb-xa,h-1,c);p.rect(xa,y0,xb-xa,1,tone(c,1.12));if(x>=0)p.rect(xa,y0,1,h-1,tone(c,1.06));p.rect(xa,y0+h-2,xb-xa,1,tone(c,.9));
      speckle(p,r,[tone(c,.92),tone(c,1.08)],.12,xa,y0+1,xb-xa,h-3);}
    x+=w;}});
  if(moss){for(let i=0;i<5;i++){const x=Math.floor(r()*14),y=[0,5,10][Math.floor(r()*3)],w=2+Math.floor(r()*4);p.rect(x,y,Math.min(w,16-x),1,moss.base);if(r()<.7)p.rect(x+1,y+1,Math.max(1,w-2),1,moss.dark);if(r()<.6)p.px(x,y,moss.light);}
    speckle(p,r,[moss.base,moss.dark],.05);}
};}
/** 圆鹅卵石：按最近的种子点分块，块与块之间是灰缝，每块左上角一点高光。 */
function cobble(seed:number,colors:string[],mortar:string):Painter{return p=>{
  const r=rng(seed),pts=Array.from({length:9},()=>[r()*16,r()*16,0] as number[]);pts.forEach(q=>q[2]=Math.floor(r()*colors.length));
  const owner=(x:number,y:number)=>{let best=0,bd=1e9;pts.forEach((q,i)=>{for(const ox of [-16,0,16])for(const oy of [-16,0,16]){const d=(x-q[0]-ox)**2+(y-q[1]-oy)**2;if(d<bd){bd=d;best=i;}}});return best;};
  const grid:number[][]=[];for(let y=0;y<16;y++){grid[y]=[];for(let x=0;x<16;x++)grid[y][x]=owner(x+.5,y+.5);}
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const o=grid[y][x],edge=grid[y][(x+1)%16]!==o||grid[(y+1)%16][x]!==o,top=grid[(y+15)%16][x]!==o||grid[y][(x+15)%16]!==o;const c=colors[pts[o][2]];
    p.px(x,y,edge?mortar:top?tone(c,1.14):r()<.15?tone(c,.9):c);}
};}
/** 横铺木板：四条板，每条板一道接缝和随机的板头，带几笔木纹。 */
function planks(seed:number,c:{base:string;light:string;dark:string;seam:string},boards=4):Painter{return p=>{
  const r=rng(seed),h=16/boards;
  for(let b=0;b<boards;b++){const y=b*h,col=pick(r,[c.base,c.light,c.base,c.dark],[3,1,2,1]);p.rect(0,y,16,h,col);p.rect(0,y,16,1,tone(col,1.07));p.rect(0,y+h-1,16,1,c.seam);
    const joint=Math.floor(r()*16);p.rect(joint,y,1,h-1,c.seam);
    for(let i=0;i<4;i++){const gx=Math.floor(r()*14),gy=y+1+Math.floor(r()*(h-2));p.rect(gx,gy,2+Math.floor(r()*3),1,tone(col,.88));}}
};}
/** 竖向木纹（剥皮原木、竖板墙）：每 4 像素一条竖板，竖向纹路。 */
function vertical(seed:number,c:{base:string;light:string;dark:string},seam?:string,every=4):Painter{return p=>{
  const r=rng(seed);for(let x=0;x<16;x++){const col=pick(r,[c.base,c.light,c.dark],[4,2,1]);p.rect(x,0,1,16,col);}
  for(let i=0;i<18;i++){const x=Math.floor(r()*16),y=Math.floor(r()*14);p.rect(x,y,1,2+Math.floor(r()*3),tone(c.base,r()<.5?.86:1.1));}
  if(seam)for(let x=every-1;x<16;x+=every){p.rect(x,0,1,16,seam);p.rect(x+1<16?x+1:0,0,1,16,tone(c.light,1.05));}
};}
/** 原木截面：一圈树皮，里面一层层年轮。 */
function rings(bark:string,wood:{base:string;light:string;dark:string}):Painter{return p=>{p.fill(bark);for(let i=1;i<8;i++){const col=i%2?wood.base:i===7?wood.dark:wood.light;p.rect(i,i,16-2*i,16-2*i,col);}p.rect(7,7,2,2,wood.dark);};}
/** 树皮：深色底上竖向裂纹和浅色棱。 */
function bark(seed:number,c:{base:string;light:string;dark:string}):Painter{return p=>{const r=rng(seed);p.fill(c.base);
  for(let x=0;x<16;x+=2+Math.floor(r()*2)){const y=Math.floor(r()*8),h=6+Math.floor(r()*10);p.rect(x,y,1,h,c.dark);if(x+1<16)p.rect(x+1,(y+3)%16,1,4,c.light);}speckle(p,r,[c.dark,c.light],.08);};}
function noise(seed:number,colors:string[],weights?:number[]):Painter{return p=>{const r=rng(seed);for(let y=0;y<16;y++)for(let x=0;x<16;x++)p.px(x,y,pick(r,colors,weights));};}
/** 草地顶面：三种绿成团分布，零星亮叶尖。 */
function grassTop(seed:number):Painter{return p=>{const r=rng(seed),G=PAL.grass;p.fill(G.base);
  for(let i=0;i<14;i++){const x=Math.floor(r()*15),y=Math.floor(r()*15),c=pick(r,[G.dark,G.light,G.deep],[3,3,1]);p.rect(x,y,2,1+Math.floor(r()*2),c);}
  speckle(p,r,[G.light,G.dark],.12);};}
/** 树叶：成簇的叶团，留一些镂空让后面透光。 */
function leaves(seed:number,c:{base:string;light:string;dark:string;deep?:string},holes=.16):Painter{return p=>{const r=rng(seed);p.fill(c.base);
  for(let i=0;i<10;i++){const x=Math.floor(r()*14),y=Math.floor(r()*14);p.rect(x,y,3,2,c.light);p.rect(x+1,y+2,2,1,c.dark);}
  speckle(p,r,[c.dark,c.deep??c.dark],.14);for(let i=0;i<16*16*holes;i++)p.clear(Math.floor(r()*16),Math.floor(r()*16),1,1);};}
/** 交叉十字模型用的植物剪影（草、蕨、花）。 */
function plant(seed:number,stem:string,stemLight:string,flower?:{petal:string;center:string;size:number}):Painter{return p=>{const r=rng(seed);p.clear();
  const blades=flower?2:6;for(let i=0;i<blades;i++){const x=2+Math.floor(r()*12),h=(flower?9:6)+Math.floor(r()*7);let cx=x;for(let y=15;y>15-h;y--){p.px(cx,y,y%3?stem:stemLight);if(r()<.25)cx+=r()<.5?-1:1;cx=Math.max(0,Math.min(15,cx));}}
  if(flower){const fx=6+Math.floor(r()*4),fy=4+Math.floor(r()*2),s=flower.size;p.rect(fx-s,fy,2*s+1,1,flower.petal).rect(fx,fy-s,1,2*s+1,flower.petal);if(s>1)p.rect(fx-1,fy-1,3,3,flower.petal);p.px(fx,fy,flower.center);p.rect(fx,fy+s+1,1,15-fy-s,stem);}
};}

const S=PAL.stone,F=PAL.frame;
/** 贴图名 → 画法。只放 v2 房间实际用到的。 */
export const V2_BLOCK_PAINT:Record<string,Painter>={
  'block/stone_bricks':ashlar(11,[S.base,S.warm,S.light,S.base,S.dark],S.mortar),
  'block/mossy_stone_bricks':ashlar(12,[S.base,S.warm,S.dark,S.base],S.mortar,PAL.moss),
  'block/cobblestone':cobble(13,[PAL.cobble.base,PAL.cobble.light,PAL.cobble.dark,S.warm,'#7d766c'],PAL.cobble.mortar),
  'block/mossy_cobblestone':cobble(14,[PAL.cobble.base,PAL.moss.base,PAL.cobble.dark,PAL.moss.dark],PAL.cobble.mortar),
  // 深橡木框架：柱子用剥皮原木（干净的竖纹），梁、檩条用带树皮的原木。
  'block/stripped_dark_oak_log':vertical(21,{base:F.base,light:F.light,dark:F.dark}),
  'block/stripped_dark_oak_log_top':rings(F.deep,{base:F.base,light:F.light,dark:F.dark}),
  'block/dark_oak_log':bark(22,PAL.bark),
  'block/dark_oak_log_top':rings(PAL.bark.dark,{base:F.base,light:F.light,dark:F.dark}),
  // 屋面内侧的望板、壁炉台、牌匾边框：深橡木横板。
  'block/dark_oak_planks':planks(23,{base:F.base,light:F.light,dark:F.dark,seam:F.deep}),
  // 地板：云杉宽板。
  'block/spruce_planks':planks(24,PAL.spruce),
  // 墙板：云杉竖板。
  'block/stripped_spruce_log':vertical(25,{base:PAL.spruce.base,light:PAL.spruce.light,dark:PAL.spruce.dark},PAL.spruce.seam,4),
  'block/stripped_spruce_log_top':rings(PAL.spruce.seam,PAL.spruce),
  // 书格顶面、茶台：白桦浅木。
  'block/oak_planks':planks(26,PAL.birch),
  'block/birch_planks':planks(28,PAL.pale),
  // 石灰抹面：几乎平的米白，零星砂点和一两道细裂，远看是干净的白墙。
  'block/calcite':p=>{const r=rng(29),L=PAL.plaster;p.fill(L.base);speckle(p,r,[L.light,L.dark],.14);speckle(p,r,[L.speck],.03);if(r()<.8){let x=Math.floor(r()*12),y=Math.floor(r()*6);for(let i=0;i<5;i++){p.px(x,y,L.dark);x+=r()<.5?1:0;y++;}}},
  'block/bookshelf':p=>{const r=rng(27),f=F;p.fill(f.base);p.rect(0,0,16,2,f.light).rect(0,7,16,2,f.base).rect(0,7,16,1,f.light).rect(0,14,16,2,f.dark);
    for(const y0 of [2,9]){let x=1;while(x<15){const w=1+Math.floor(r()*2),h=4+Math.floor(r()*2),c=pick(r,['#7b3b33','#33496b','#8a6a2c','#4f6b45','#5e3b55','#2f5f5c','#b29c74']);if(r()<.12){x+=1;continue;}
      p.rect(x,y0+5-h,w,h,c).rect(x,y0+5-h,w,1,tone(c,1.25));x+=w;}p.rect(0,y0,1,5,f.dark).rect(15,y0,1,5,f.dark);}},
  // 屋面瓦：冷灰蓝石板瓦，和暖色木作拉开冷暖。
  'block/deepslate_tiles':p=>{const r=rng(31),T=PAL.slate;p.fill(T.edge);for(let row=0;row<4;row++){const y=row*4,off=row%2?2:0;for(let x=-off;x<16;x+=4){const c=pick(r,[T.base,T.light,T.dark],[3,1,1]);p.rect(Math.max(0,x),y,Math.min(3,16-Math.max(0,x)),3,c);p.rect(Math.max(0,x),y,Math.min(3,16-Math.max(0,x)),1,tone(c,1.15));}}},
  // 天窗玻璃：只画窗棂和几点反光，中间镂空。
  'block/glass':p=>{p.clear();const fr=F.dark;p.rect(0,0,16,1,fr).rect(0,15,16,1,fr).rect(0,0,1,16,fr).rect(15,0,1,16,fr).rect(7,0,2,16,fr);p.px(3,4,'#dcefff').px(4,3,'#dcefff').px(11,6,'#dcefff');},
  'block/glass_pane_top':p=>{p.fill(F.dark);p.rect(7,0,2,16,F.base);},
  // 地面与岸边。
  'block/grass_block_top':grassTop(41),
  'block/grass_block_side':p=>{const r=rng(42),D=PAL.dirt,G=PAL.grass;noise(43,[D.base,D.light,D.dark],[4,2,2])(p);p.rect(0,0,16,3,G.base);for(let x=0;x<16;x++){const h=3+Math.floor(r()*3);p.rect(x,0,1,h,x%3?G.base:G.dark);p.px(x,0,G.light);}},
  'block/grass_block_side_overlay':p=>{p.clear();},
  'block/dirt':noise(44,[PAL.dirt.base,PAL.dirt.light,PAL.dirt.dark,'#6b4d34'],[4,2,2,1]),
  'block/coarse_dirt':noise(45,[PAL.dirt.base,PAL.dirt.dark,PAL.gravel.dark,PAL.dirt.light],[3,2,1,1]),
  'block/moss_block':noise(46,[PAL.moss.base,PAL.moss.light,PAL.moss.dark],[4,2,2]),
  'block/gravel':noise(47,[PAL.gravel.base,PAL.gravel.light,PAL.gravel.dark,'#7e766c'],[3,2,2,1]),
  'block/sand':noise(48,[PAL.sand.base,PAL.sand.light,PAL.sand.dark],[4,2,1]),
  // 近处的树和花草。
  'block/oak_leaves':leaves(51,PAL.leaf),
  'block/cherry_leaves':leaves(52,PAL.cherry,.12),
  'block/spruce_leaves':leaves(53,{...PAL.spruceLeaf,deep:'#1b3a26'},.1),
  'block/oak_log':bark(54,{base:'#6b5236',light:'#836646',dark:'#4f3c28'}),
  'block/oak_log_top':rings('#4f3c28',{base:'#b89462',light:'#c9a774',dark:'#93734a'}),
  'block/cherry_log':bark(55,{base:'#4a2a2c',light:'#5e3a3a',dark:'#331d1f'}),
  'block/cherry_log_top':rings('#331d1f',{base:'#d39a93',light:'#e2b0a7',dark:'#b07b74'}),
  'block/spruce_log':bark(56,{base:'#3d2b1d',light:'#4f3a28',dark:'#2a1d14'}),
  'block/spruce_log_top':rings('#2a1d14',PAL.spruce),
  'block/short_grass':plant(61,PAL.grass.dark,PAL.grass.light),
  'block/fern':plant(62,'#3f7034','#5a8f45'),
  'block/poppy':plant(63,'#3f7034','#4f8a3a',{petal:'#c8402f',center:'#3a1c14',size:1}),
  'block/dandelion':plant(64,'#4f8a3a','#5f9a44',{petal:'#f0c43a',center:'#c9921f',size:1}),
  'block/cornflower':plant(65,'#3f7034','#4f8a3a',{petal:'#4f78c8',center:'#26407a',size:1}),
  'block/oxeye_daisy':plant(66,'#3f7034','#4f8a3a',{petal:'#f4f0e4',center:'#e0b53a',size:1}),
  'block/pink_petals':p=>{const r=rng(67);p.clear();for(let i=0;i<22;i++){const x=Math.floor(r()*15),y=Math.floor(r()*15);p.rect(x,y,2,1,pick(r,[PAL.cherry.base,PAL.cherry.light,PAL.cherry.dark]));}},
  'block/pink_petals_stem':p=>{p.clear();},
};
/** 方便检查：v2 只认这些贴图。 */
export const V2_PAINTED=new Set(Object.keys(V2_BLOCK_PAINT));
export {blend};
