/**
 * 水上园林茶叙榭的方块贴图（贴图名 → 16×16 像素画，每米 16 像素，和方块世界同一密度）。
 * 色板按苏式园林来：黛瓦（冷的蓝灰）、粉墙（暖白）、栗壳色木作（压暗、不偏橙）、青石、方砖、黄石驳岸、沿阶草。
 * 第二轮的原则：每张贴图都是画出来的图案（木纹、石层、砖缝），不靠随机噪点撒一层“质感”——噪点远看是脏，近看是雪花。
 * 只画这间房实际用到的贴图；scripts/check-mc-v2.mjs 会核对每个方块面的贴图都在这张表里。
 */
import type {Painter} from '../../style';
import {pick,rng,tone} from '../pixel';
import {ashlar,grassTop,plant} from '../blockTextures';

/** 色板 */
export const GARDEN={
  tile:{base:'#4f545b',light:'#626870',shine:'#737980',gap:'#3a3e44',deep:'#2c2f34'},
  plaster:{base:'#e8e4da',light:'#eeebe3',shade:'#dcd7cb',speck:'#d2ccbe'},
  /** 栗壳色木作（柱、梁、槅扇、挂落、美人靠）：比第一轮暗一档、灰一点，傍晚的暖光照上去是深栗色，不是橙色 */
  wood:{base:'#4b362b',light:'#5b4436',dark:'#3b2a22',deep:'#2a1e18'},
  /** 青石（台基压面、台阶、桥面） */
  stone:{base:'#7d8281',light:'#8d9291',dark:'#6a6f70',edge:'#53585a'},
  /** 方砖（厅内、月台、院子、廊下），偏冷的灰 */
  brick:{base:'#8f8c86',light:'#9e9b94',dark:'#83807a',joint:'#76736e'},
  /** 黄石（驳岸、假山）：灰里带一点赭 */
  yellow:{base:'#9a8a72',light:'#ae9f86',dark:'#7b6d5a',deep:'#5c5144',moss:'#5e6e3f'},
  /** 台基侧面：偏青的灰石 */
  ashlar:['#878a86','#91938e','#7d807c','#999b96','#848681'],
  grass:{base:'#5f8a45',light:'#77a052',dark:'#4c7236',deep:'#3d5d2c'},
  /** 沿阶草、苔（园里的地被，比草坪暗、细） */
  moss:{base:'#4c6a35',light:'#5d7c40',dark:'#3d5a2c',deep:'#30472a'},
  /** 青砖（墙脚、门框） */
  grey:{base:'#7f7f7c',light:'#8e8e8a',dark:'#706f6c',joint:'#5f5e5b'},
};
const T=GARDEN.tile,P=GARDEN.plaster,W=GARDEN.wood,S=GARDEN.stone,B=GARDEN.brick,Y=GARDEN.yellow,M=GARDEN.moss,G=GARDEN.grey;

/**
 * 小青瓦屋面：一垄盖瓦（亮脊 + 两侧本色）一垄底瓦沟（最暗），4 像素一组；顺着瓦垄每 8 像素一道淡淡的搭接缝，相邻两垄错开 4 像素。
 * along='v'：瓦垄顺着贴图的 v（方块顶面的 z，南北坡用）；'u'：顺着 u（东西披檐用）。
 */
function roofTiles(along:'u'|'v'):Painter{return p=>{
  for(let a=0;a<16;a++)for(let b=0;b<16;b++){
    const col=a%4,lap=(b+(Math.floor(a/4)%2)*4)%8===0;
    let c=col===0?T.gap:col===2?T.light:T.base;
    if(lap&&col!==0)c=tone(c,.88);
    if(along==='v')p.px(a,b,c);else p.px(b,a,c);
  }
};}
/** 粉墙：几乎平的暖白，只有很稀的几粒砂点和一道极淡的雨痕。 */
const plaster:Painter=p=>{const r=rng(71);p.fill(P.base);for(let i=0;i<7;i++)p.px(Math.floor(r()*16),Math.floor(r()*16),r()<.5?P.light:P.shade);p.rect(11,2,1,9,tone(P.base,.985));};
/** 栗壳色木：顺纹，几道长短不一的深色纹线，一列亮一点的漆光；不撒点。 */
const chestnut:Painter=p=>{p.fill(W.base);p.rect(6,0,2,16,W.light).rect(7,0,1,16,tone(W.light,1.05));
  for(const [x,y,l] of [[2,1,9],[4,6,8],[10,0,6],[12,7,9],[14,2,7],[1,11,5],[9,9,6]] as const)p.rect(x,y,1,l,W.dark);p.rect(0,0,1,16,W.dark).rect(15,0,1,16,W.dark);};
/** 青石条：0.5 米一道错缝，上沿一道亮边，石面一两道很淡的凿痕。 */
const greenStone:Painter=p=>{p.fill(S.base);for(const [y,x] of [[0,0],[8,6]] as const){p.rect(0,y,16,1,S.light);p.rect(0,y+7,16,1,S.edge);p.rect(x,y,1,8,S.edge);p.rect(x+1,y+1,1,6,S.light);}
  for(const [x,y] of [[3,3],[11,4],[2,12],[13,11]] as const)p.rect(x,y,2,1,S.dark);};
const greenStoneSide:Painter=p=>{p.fill(S.dark);p.rect(0,0,16,1,S.light).rect(0,7,16,1,S.edge).rect(0,8,16,1,S.base).rect(0,15,16,1,S.edge);};
/** 方砖：一格铺四块 0.5 米的方砖，砖缝 1 像素，每块砖深浅略不同，左上一道很淡的亮边。 */
const squareBrick:Painter=p=>{const r=rng(75);p.fill(B.joint);for(const y of [0,8])for(const x of [0,8]){const c=pick(r,[B.base,B.light,B.dark,B.base],[3,1,1,2]);p.rect(x,y,7,7,c).rect(x,y,7,1,tone(c,1.04)).rect(x,y,1,7,tone(c,1.02));}};
/** 花街铺地：浅灰碎石底，竖砌的瓦片拼成斜方格（每 8 像素一个菱形），格心一粒深色卵石；对比收着，远看是一层细花纹。 */
const pebbleMosaic:Painter=p=>{p.fill('#9f9a90');
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=(x+y)%8,e=(x-y+16)%8;if(d===0||e===0){p.px(x,y,'#837e76');continue;}if((x*7+y*3)%5===0)p.px(x,y,'#aba69c');}
  for(const [x,y] of [[4,0],[0,4],[4,8],[8,4],[12,8],[8,12],[12,0],[0,12]] as const)p.px(x,y,'#68645e');};
/**
 * 黄石（驳岸、假山）：一张贴图就是一块石头的面——几道很淡的横向石层（深浅只差几个百分点），两三条斜着的短裂，几粒浅色的风化点。
 * 石块的轮廓交给道具层一块块错叠的石头和方块边，贴图里不再画“砖缝”（画了就成了砌墙）。
 */
const yellowStone:Painter=p=>{p.fill(Y.base);
  for(const [y,h,k] of [[0,3,1.04],[3,2,.97],[5,4,1],[9,2,1.05],[11,3,.96],[14,2,1.02]] as const)p.rect(0,y,16,h,tone(Y.base,k));
  for(const [x,y,l] of [[2,4,5],[10,8,4],[5,12,6]] as const)p.rect(x,y,l,1,tone(Y.base,.9));
  for(const [x,y] of [[6,1],[7,2],[8,3],[12,10],[13,11],[3,13],[2,14]] as const)p.px(x,y,Y.deep);
  for(const [x,y] of [[11,2],[4,7],[14,13],[9,15]] as const)p.px(x,y,tone(Y.light,1.06));};
/** 打磨过的黄石（山上的石阶、平台压面）：整块，四周一圈暗边，中间两道淡纹。 */
const yellowDressed:Painter=p=>{p.fill(Y.base);p.rect(0,0,16,1,tone(Y.base,1.06)).rect(0,15,16,1,Y.dark).rect(0,0,1,16,tone(Y.base,1.03)).rect(15,0,1,16,Y.dark);p.rect(3,5,9,1,tone(Y.base,.95)).rect(5,10,8,1,tone(Y.base,.96));};
/** 沿阶草 / 苔：深绿底上一丛丛细叶（2×1、1×2 的小块），两三种绿交错，远看是一片细密的地被，不是草坪。 */
const mossTop:Painter=p=>{const r=rng(85);p.fill(M.base);for(let i=0;i<34;i++){const x=Math.floor(r()*16),y=Math.floor(r()*16),c=pick(r,[M.light,M.dark,M.deep,tone(M.light,1.08)],[3,3,1,1]);if(r()<.5)p.rect(x,y,2,1,c);else p.rect(x,y,1,2,c);}};
/** 泥土（树下、竹根） */
const soil:Painter=p=>{p.fill('#5d4a3a');for(const [x,y,c] of [[2,3,'#6b5745'],[9,1,'#4d3d30'],[13,6,'#6b5745'],[5,10,'#4d3d30'],[11,12,'#7a6a58'],[1,14,'#6b5745'],[7,7,'#7a6a58']] as const)p.rect(x,y,2,1,c);};
/** 碎石小路：浅灰米色的碎石，几粒深一点的。 */
const gravel:Painter=p=>{p.fill('#a8a296');for(let y=0;y<16;y+=2)for(let x=(y/2)%2;x<16;x+=3)p.px(x,y,(x+y)%5?'#9a948a':'#b8b2a6');for(const [x,y] of [[4,5],[12,2],[7,12],[14,10]] as const)p.px(x,y,'#7d786f');};
/** 青砖：0.5×0.25 米的砖，一顺一丁地错缝。墙脚、月洞门框、漏窗框用。 */
const greyBrick:Painter=p=>{p.fill(G.joint);for(let y=0;y<16;y+=4)for(let x=(y/4)%2?-4:0;x<16;x+=8){const c=(x+y)%3?G.base:G.light;p.rect(x+1,y+1,7,3,c);p.rect(x+1,y+1,7,1,tone(c,1.05));}};
/** 台基、驳岸侧面：方整石，靠水一层带苔。 */
const baseStone=ashlar(77,GARDEN.ashlar,'#5f5c56');
const mossStone=ashlar(78,GARDEN.ashlar,'#5f5c56',{base:'#55703a',light:'#6a8645',dark:'#43592c'});
/** 槅扇上半：步步锦格子（深栗木框 + 镂空），透光、投影。 */
const lattice:Painter=p=>{p.clear();const c=W.base,h=W.light;
  p.rect(0,0,16,1,c).rect(0,15,16,1,c).rect(0,0,1,16,c).rect(15,0,1,16,c);
  for(const y of [5,10])p.rect(1,y,14,1,c);for(const x of [5,10])p.rect(x,1,1,14,c);
  for(const [x0,y0] of [[1,1],[6,1],[11,1],[1,6],[6,6],[11,6],[1,11],[6,11],[11,11]] as const){const alt=(x0+y0)%2===0;if(alt)p.rect(x0,y0+2,2,1,c).rect(x0+2,y0,1,2,c);else p.rect(x0+2,y0+2,2,1,c).rect(x0+1,y0+2,1,2,c);}
  p.rect(0,0,16,1,h);};
/** 槅扇下半：裙板（实心栗木板，内框一圈浅线）。 */
const skirtPanel:Painter=p=>{p.fill(W.base);p.rect(0,0,16,1,W.light).rect(0,15,16,1,W.deep).rect(0,0,1,16,W.light).rect(15,0,1,16,W.deep);
  p.rect(2,2,12,12,W.dark);p.rect(3,3,10,10,W.base);p.rect(3,3,10,1,W.light);};
/** 草坡侧面：上沿一圈草，下面泥土。 */
const grassSide:Painter=p=>{p.fill('#5d4a3a');for(const [x,y] of [[3,9],[10,12],[6,14]] as const)p.px(x,y,'#4d3d30');const Gr=GARDEN.grass;for(let x=0;x<16;x++){const h=3+((x*7)%3);p.rect(x,0,1,h,x%3?Gr.base:Gr.dark);p.px(x,0,Gr.light);}};

export const GARDEN_PAINT:Record<string,Painter>={
  'block/deepslate_tiles':roofTiles('v'),
  'block/polished_deepslate':roofTiles('u'),
  'block/calcite':plaster,
  'block/dark_oak_planks':chestnut,
  'block/spruce_planks':chestnut,
  'block/smooth_stone':greenStone,
  'block/smooth_stone_slab_side':greenStoneSide,
  'block/polished_andesite':squareBrick,
  'block/cobblestone':pebbleMosaic,
  'block/stone_bricks':baseStone,
  'block/mossy_stone_bricks':mossStone,
  'block/tuff':yellowStone,
  'block/polished_tuff':yellowDressed,
  'block/mud_bricks':greyBrick,
  'block/dark_oak_trapdoor':lattice,
  'block/spruce_trapdoor':skirtPanel,
  'block/grass_block_top':grassTop(83),
  'block/grass_block_side':grassSide,
  'block/grass_block_side_overlay':p=>{p.clear();},
  'block/dirt':soil,
  'block/coarse_dirt':soil,
  'block/moss_block':mossTop,
  'block/gravel':gravel,
  'block/short_grass':plant(87,'#4f7535','#6f9a4c'),
  'block/fern':plant(88,'#3f6a34','#56894a'),
};
/** 道具层要和方块同一张画的几张（园墙的粉墙和青砖、瓦、青石、黄石），按名字取 */
export const GARDEN_PAINTERS={plaster,tileV:roofTiles('v'),greyBrick,greenStone,yellowStone};
