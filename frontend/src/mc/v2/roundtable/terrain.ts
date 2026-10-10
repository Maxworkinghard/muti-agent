/**
 * 园里的地（方块）：南院方砖、花街小路、沿阶草地被、树下的土；临水一圈黄石驳岸；北岸黄石假山的山体和上山石阶。
 * 水面是一整块平面（water.ts），地块盖在上面：POND 轮廓以内不放地。驳岸的方块边是一格一格的台阶线，
 * 道具层（shore.ts）再沿真正的岸线叠一圈大小不一的黄石，把方块边遮住。
 * 高度：园地顶面 y=1；假山每格的高度 hillHeight 是“地面以上”的米数（0.5 一档）。
 */
import {Builder} from '../../rooms/builders';
import {valueNoise} from '../pixel';
import {ARCH,CANOPY,COURT,HALL,HILL,HILL_PAVILION,LOU,NORTH_CORRIDOR,POND,PAVILION,WALLS,edgeDistance,inside} from './site';

type Pt=[number,number];
/** 点到折线的最短距离 */
export const lineDistance=(line:Pt[],x:number,z:number)=>{let d=Infinity;for(let i=1;i<line.length;i++){const [ax,az]=line[i-1],[bx,bz]=line[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(ax+dx*t-x,az+dz*t-z));}return d;};

/** 拱桥两头落地的点（南 +1、北 −1） */
const archEnd=(side:1|-1):Pt=>[ARCH.x,side>0?ARCH.z1+.6:ARCH.z0-.6];
/** 园路（世界坐标折线）：花街铺地。环路上每一段都接到一座建筑或一座桥上。 */
export const PATHS:Array<{line:Pt[];half:number}>=[
  // 南院：榭的南门前一条横路，往西接西南岸、往东接东南岸
  {line:[[-5,22.5],[8,21.6],[24,21.6],[37.5,23]],half:.85},
  // 南院西头 → 西南岸 → 拱桥南端
  {line:[[-5,22.5],[-8.5,18.8],[-11.4,13],[-11.2,9],archEnd(1)],half:.95},
  // 拱桥北端 → 西北岸 → 假山西脚
  {line:[archEnd(-1),[-12,-10],[-9.2,-16.8],[-4.2,-21.8],[.2,-25.6],[1.2,-30]],half:.95},
  // 假山背后 → 北廊西头
  {line:[[1.2,-30],[2.6,-38.2],[10,-42.4],[20.5,-42]],half:.9},
  // 北廊东头 → 东岸 → 半岛（六角亭东面）
  {line:[[48,-42],[49.6,-34],[49.8,-20],[49.4,-8],[47.2,-2.6],[42.8,1.8],[39.6,3.4]],half:.95},
  // 半岛 → 东岸南段 → 南院东头
  {line:[[40.4,5.6],[47.8,10],[48.8,15],[45.4,21.4],[37.5,23]],half:.95},
  // 两层楼东侧 → 北廊
  {line:[[38.6,-29.6],[42.4,-34],[44,-40.8]],half:.8},
];

/** 假山平台高度（米，地面以上） */
export const HILL_TOP=HILL.peak.h;
/** 假山的几座峰（世界坐标、峰高、半径）：主峰上是方亭，东边一座次峰，西边一座矮峰；峰与峰之间是山谷，种树和灌木 */
export const PEAKS=[{x:13.5,z:-32,h:5,r:8},{x:21.5,z:-29.5,h:3.5,r:5.5},{x:5.5,z:-30.5,h:2.5,r:5}];
/**
 * 假山每一格的高度（地面以上，米，0.5 一档）：几座峰各自往外落（越近峰顶越陡），取最高的那座，再加一点起伏；
 * 靠近山脚轮廓线的地方压下来，临水一面落成几道 1 米上下的石崖（崖面在 shore.ts 的 hillRocks 贴横放的黄石）。山顶留一块平台给方亭。
 */
export function hillHeight(x:number,z:number){
  if(!inside(HILL.outline,x,z))return 0;
  const {x:px,z:pz}=HILL.peak,n=valueNoise(907);
  if(Math.max(Math.abs(x-px),Math.abs(z-pz))<=HILL_PAVILION.half+1)return HILL_TOP;
  let h=0;for(const k of PEAKS){const d=Math.hypot(x-k.x,z-k.z)/k.r;if(d<1)h=Math.max(h,k.h*(1-Math.pow(d,1.6)));}
  h+= (n(x*.3,z*.3)-.5)*1.1;h=Math.min(h,edgeDistance(HILL.outline,x,z)*1.35+.4,HILL_TOP-.5);
  return Math.max(.5,Math.round(h*2)/2);
}
/** 上山石阶：从西脚 (1.2, −30) 往东爬到山顶平台西沿，高度均匀上升 */
export const STEPS:Pt[]=[[1.2,-30],[4.6,-31.2],[7.8,-31.7],[HILL.peak.x-HILL_PAVILION.half-1.2,-32]];

/** 南院中轴（月洞门、榭的南门、桌心都在这条线上） */
const AXIS=HALL.table.x;

export function buildTerrain(b:Builder){
  const n=valueNoise(911);
  const column=(x:number,z:number,h:number,surface:string,body='tuff')=>{const full=Math.floor(h),half=h-full>=.5;
    for(let y=0;y<=full;y++)b.put(x,y,z,y===full&&!half?surface:body);
    if(half)b.put(x,full+1,z,surface==='moss_block'||surface==='tuff'?'tuff_slab':'polished_tuff_slab',{type:'bottom',waterlogged:'false'});};
  for(let x=WALLS.west;x<WALLS.east;x++)for(let z=WALLS.north;z<WALLS.south;z++){
    const cx=x+.5,cz=z+.5;if(inside(POND,cx,cz))continue;
    const h=hillHeight(cx,cz);
    // 假山：黄石山体，平台上是沿阶草；四邻比自己低一档以上的是崖边，顶面也露石
    if(h>0){const cliff=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>hillHeight(cx+dx,cz+dz)<h-.75);column(x,z,h,cliff?'tuff':'moss_block');continue;}
    const shore=edgeDistance(POND,cx,cz)<1.25;
    // 南院方砖；中轴一道花街通月洞门；临水一边是整齐的青石条（院子和榭是人工的边，不用乱石）
    if(x>=HALL.x0-1&&x<=HALL.x1+1&&z>=COURT.z0&&z<=COURT.z0+2){b.put(x,0,z,shore?'smooth_stone':'polished_andesite');continue;}
    if(z>=COURT.z0&&z<=COURT.z1&&Math.abs(cx-AXIS)<1.6){b.put(x,0,z,'cobblestone');continue;}
    // 两层楼底座和临水平台（临水一边也是青石条）、北廊：方砖
    if((x>=LOU.x0-1&&x<=LOU.x1+1&&z>=LOU.z0&&z<=LOU.terrace.z1)||(x>=NORTH_CORRIDOR.x0&&x<=NORTH_CORRIDOR.x1&&z>=NORTH_CORRIDOR.z0&&z<=NORTH_CORRIDOR.z1)){b.put(x,0,z,shore?'smooth_stone':'polished_andesite');continue;}
    // 驳岸：其余贴水一圈是黄石
    if(shore){b.put(x,0,z,'tuff');continue;}
    // 六角亭所在的半岛尖：方砖
    if(Math.hypot(cx-PAVILION.x,cz-PAVILION.z)<PAVILION.base+1.6){b.put(x,0,z,'polished_andesite');continue;}
    // 园路
    if(PATHS.some(p=>lineDistance(p.line,cx,cz)<=p.half)){b.put(x,0,z,'cobblestone');continue;}
    // 其余是地被：沿阶草；阔叶大树下面一圈土（落叶、树荫，草长不起来）；零星的草丛和蕨
    const soil=CANOPY.some(t=>Math.hypot(cx-t.x,cz-t.z)<1.2+n(cx*.5,cz*.5)*.8);
    b.put(x,0,z,soil?'coarse_dirt':'moss_block');
    const hsh=((x*2654435761)^(z*40503))>>>0;
    if(!soil&&hsh%11===0)b.put(x,1,z,hsh%3===0?'fern':'short_grass');
  }
  // 上山石阶：顺着 STEPS 均匀爬升，每格的面比两边山体低半格（凿在山石之间），面是打磨过的黄石
  const done=new Set<string>();
  for(let i=0;i<=60;i++){const t=i/60,[ax,az]=lerpLine(STEPS,t),x=Math.floor(ax),z=Math.floor(az),k=x+','+z;if(done.has(k))continue;done.add(k);
    const h=Math.max(.5,Math.round(t*HILL_TOP*2)/2);
    for(let y=0;y<=HILL_TOP+1;y++)b.cells.delete(`${x},${y},${z}`);column(x,z,h,'polished_tuff');}
}
/** 折线上按总长比例 t 取点 */
export function lerpLine(line:Pt[],t:number):Pt{const lens=line.slice(1).map((p,i)=>Math.hypot(p[0]-line[i][0],p[1]-line[i][1])),total=lens.reduce((a,b)=>a+b,0);let s=t*total;
  for(let i=0;i<lens.length;i++){if(s<=lens[i]){const k=s/lens[i];return [line[i][0]+(line[i+1][0]-line[i][0])*k,line[i][1]+(line[i+1][1]-line[i][1])*k];}s-=lens[i];}return line[line.length-1];}
