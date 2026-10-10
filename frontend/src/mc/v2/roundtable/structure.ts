/**
 * 水上园林茶叙榭的方块结构：台基与石墩（下面架空，水从榭底流过）、栅栏细柱、南面槅扇门、歇山卷棚屋面、
 * 北月台与入水埠头、水廊（甲板、廊柱）、曲桥，再加上园里的地（terrain.ts：南院、园路、驳岸、假山）。
 * 只放方块：柱头梁枋、挂落、美人靠、轩顶、翼角、门洞、廊顶、园墙和北岸的楼亭由道具层（timber.ts、garden.ts）补。总平面见 site.ts。
 */
import {Builder} from '../../rooms/builders';
import {BRIDGE,CORRIDOR,HALL,TERRACE,type Segment} from './site';
import {buildTerrain} from './terrain';

type Rect={x0:number;x1:number;z0:number;z1:number};
const inRect=(r:Rect,x:number,z:number)=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1;
const onEdge=(r:Rect,x:number,z:number)=>x===r.x0||x===r.x1||z===r.z0||z===r.z1;
const slab=(b:Builder,x:number,u:number,z:number,id:string)=>{const y=Math.floor(u+1e-6);b.put(x,y,z,id,{type:u-y<.25?'bottom':'top',waterlogged:'false'});};
const fence=(b:Builder,x:number,z:number,y0:number,y1:number,id='dark_oak_fence')=>{for(let y=y0;y<=y1;y++)b.put(x,y,z,id,{waterlogged:'false'});};

/**
 * 架空的石台：顶面一层上半砖（0.5–1），石墩是整块，按 3 格一个、四角必有；边上一圈青石压面，中间是给定的面层。
 * 水面在 0.15，台面下面留出一道暗缝，从湖上看过去水是流进榭底的。
 */
function deck(b:Builder,r:Rect,surface:string,edge='smooth_stone_slab',pier=(x:number,z:number)=>((x-r.x0)%3===0||x===r.x1)&&((z-r.z0)%3===0||z===r.z1)){
  for(let x=r.x0;x<=r.x1;x++)for(let z=r.z0;z<=r.z1;z++){
    if(b.cells.has(`${x},0,${z}`))continue;
    if(pier(x,z)){b.put(x,0,z,'smooth_stone');b.put(x,-1,z,'stone_bricks');continue;}
    slab(b,x,.5,z,onEdge(r,x,z)?edge:surface);
  }
}

/**
 * 屋面：按到檐口的距离 D 取高度（profile 单位 0.5 米）；歇山两端 gable 格以内是披檐（取到四边的最近距离），往里是卷棚两坡。
 * 比外面一行高出一整米的那几行（靠近屋脊、坡陡的地方）用楼梯块：外半格低、里半格高，屋面一级只抬 0.5 米，不出现一米高的大台阶。
 */
function hipGable(b:Builder,r:Rect,eave:number,profile:number[],gable:number){
  const hAt=(d:number)=>eave+profile[Math.min(Math.max(0,d),profile.length-1)]*.5;
  const at=(x:number,z:number)=>{const ns=Math.min(z-r.z0,r.z1-z),ew=Math.min(x-r.x0,r.x1-x),skirt=ew<gable,d=skirt?Math.min(ns,ew):ns;
    return {h:hAt(d),d,ns:!skirt||ns<=ew};};
  const mid=(r.z0+r.z1)/2;
  for(let x=r.x0;x<=r.x1;x++)for(let z=r.z0;z<=r.z1;z++){const {h,d,ns}=at(x,z);
    if(ns&&d>0&&h-hAt(d-1)>=1-1e-6){b.put(x,Math.floor(h-.5+1e-6),z,'deepslate_tile_stairs',{facing:z<mid?'south':'north',half:'bottom',shape:'straight',waterlogged:'false'});continue;}
    slab(b,x,h,z,ns?'deepslate_tile_slab':'polished_deepslate_slab');}
  return at;
}

/** 廊柱：每段沿两条侧边，从头到尾均分、柱距约 3 格（含两端）；落在别的段走道里的去掉。 */
export function corridorPosts(segs:Segment[]){
  const posts=new Map<string,[number,number]>();
  for(const s of segs){const lines=s.along==='x'?[s.z0,s.z1]:[s.x0,s.x1],[a0,a1]=s.along==='x'?[s.x0,s.x1]:[s.z0,s.z1];
    const n=Math.max(1,Math.round((a1-a0)/3)),steps=Array.from({length:n+1},(_,i)=>a0+Math.round(i*(a1-a0)/n));
    for(const l of lines)for(const a of steps){const [x,z]=s.along==='x'?[a,l]:[l,a];posts.set(x+','+z,[x,z]);}}
  const walkway=(x:number,z:number)=>segs.some(s=>inRect(s,x,z)&&(s.along==='x'?z>s.z0&&z<s.z1:x>s.x0&&x<s.x1));
  return [...posts.values()].filter(([x,z])=>!walkway(x,z)&&!(x<=HALL.x1&&z>=HALL.z0&&z<=HALL.z1));
}

export function buildGarden(){
  const b=new Builder();
  const H={x0:HALL.x0,x1:HALL.x1,z0:HALL.z0,z1:HALL.z1};
  // ——主榭台基：厅内是木地板（上面盖地面图），柱线外一圈青石压面；石墩按柱网布置。
  const posts=new Set<string>();for(const x of HALL.postX)for(const z of HALL.postZ)if(x===HALL.postX[0]||x===HALL.postX[3]||z===HALL.postZ[0]||z===HALL.postZ[3])posts.add(x+','+z);
  deck(b,H,'spruce_slab','smooth_stone_slab',(x,z)=>posts.has(x+','+z)||(onEdge(H,x,z)&&((x-H.x0)%4===0||(z-H.z0)%4===0)&&!(x===H.x0&&z===H.z0)));
  // ——柱：4 格高的细栅栏柱（柱心在格子中心，0.25 米见方）。
  for(const k of posts){const [x,z]=k.split(',').map(Number);fence(b,x,z,1,HALL.postTop-1);}
  // ——南面槅扇：两侧次间全关，中间一跨两边各关一扇、当中两扇开着通南岸。下截裙板、上面三截格心，门板贴在柱外侧。
  const z=HALL.postZ[3];
  for(const x of [11,12,14,17,19,20]){b.put(x,1,z,'spruce_trapdoor',{facing:'north',half:'bottom',open:'true',powered:'false',waterlogged:'false'});for(const y of [2,3,4])b.put(x,y,z,'dark_oak_trapdoor',{facing:'north',half:'bottom',open:'true',powered:'false',waterlogged:'false'});}
  // ——歇山卷棚屋面（台基同大，四面出檐 1.5 米）：檐口 5，0.5 米一级往上，越近屋脊越陡，脊上一道圆脊。
  const roofAt=hipGable(b,H,HALL.eave,[0,1,2,3,5,7,8],HALL.gable);
  // ——北月台（方砖 + 青石压边）和入水的两级埠头。
  deck(b,TERRACE,'polished_andesite_slab');
  for(let x=14;x<=17;x++){slab(b,x,0,TERRACE.z0-1,'smooth_stone_slab');slab(b,x,-.5,TERRACE.z0-2,'smooth_stone_slab');}
  // ——东曲廊：甲板（方砖）、石墩在廊柱下，3 格高的廊柱。可见的卷棚瓦在 timber.ts，不在这里叠半砖，
  // 否则和主榭东檐交接处会堆成一摞灰块。
  for(const s of CORRIDOR)deck(b,s,'polished_andesite_slab','smooth_stone_slab',(x,zz)=>corridorPosts(CORRIDOR).some(([px,pz])=>px===x&&pz===zz));
  for(const [x,zz] of corridorPosts(CORRIDOR))fence(b,x,zz,1,3);
  // ——曲桥：贴水的青石板（顶面 0.5），每段两头一个石墩。
  for(const s of BRIDGE)for(let x=s.x0;x<=s.x1;x++)for(let zz=s.z0;zz<=s.z1;zz++){if(b.cells.has(`${x},0,${zz}`))continue;slab(b,x,0,zz,'smooth_stone_slab');if((x===s.x0||x===s.x1)&&(zz===s.z0||zz===s.z1))b.put(x,-1,zz,'stone_bricks');}
  // ——园里的地：南院、园路、驳岸、假山（水面以内不放）
  buildTerrain(b);
  return {builder:b,roofAt};
}
