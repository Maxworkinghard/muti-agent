/**
 * 湖畔议事厅的家具与陈设（v2 自己设计、自己画贴图）：八角深木桌和石桌座、八把带不同布垫的木椅、
 * 桌上的茶具与纸卷、壁炉里的火、纸灯笼、盆栽、垂吊花篮、芦苇帘、草编席。尺寸按游戏人物比例（坐高 0.5、桌面 0.95）。
 */
import * as THREE from 'three';
import type {Painter} from '../../style';
import {PAL,pick,rng,speckle,tone} from '../pixel';
import {V2_BLOCK_PAINT} from '../blockTextures';
import {ColorBoxes,place,type V2Kit} from '../kit';

const F=PAL.frame;
/** 道具贴图（16×16，按每米 16 像素平铺）。 */
export const PROP_PAINT:Record<string,Painter>={
  // 桌面：比框架暖一档的胡桃色宽板。
  tableTop:p=>{const r=rng(101);for(let b=0;b<4;b++){const c=pick(r,['#6e4630','#7a4f36','#64402b']);p.rect(0,b*4,16,4,c).rect(0,b*4,16,1,tone(c,1.1)).rect(0,b*4+3,16,1,'#3e2618');for(let i=0;i<3;i++)p.rect(Math.floor(r()*13),b*4+1+Math.floor(r()*2),3,1,tone(c,.86));}},
  tableEdge:p=>{p.fill('#5a3826').rect(0,0,16,2,'#c9ad7c').rect(0,14,16,2,'#3e2618');},
  chairWood:p=>{const r=rng(102),B=PAL.birch;p.fill(B.base);for(let x=0;x<16;x+=4)p.rect(x,0,1,16,B.dark);speckle(p,r,[B.light,B.dark],.12);},
  // 布垫：粗布的十字纹，颜色用 color 乘上去。
  cushion:p=>{const r=rng(103);p.fill('#f2ece0');for(let y=0;y<16;y+=2)p.rect(0,y,16,1,'#e2d9c8');for(let x=1;x<16;x+=3)p.rect(x,0,1,16,'#ece4d4');speckle(p,r,['#d8ceba'],.08);p.rect(0,0,16,1,'#ffffff').rect(0,15,16,1,'#c9bfac');},
  // 草编席：浅麦色经纬，深色包边由几何体做。
  mat:p=>{const r=rng(104);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const weave=((x>>1)+(y>>1))%2;p.px(x,y,weave?'#cdb57e':'#bda46c');}speckle(p,r,['#a88e58','#dcc590'],.06);},
  matEdge:p=>{p.fill('#3f4a3a').rect(0,7,16,2,'#556250');},
  paper:p=>{p.fill(PAL.paper.base);const r=rng(105);speckle(p,r,['#e6dabb','#f6eedb'],.2);},
  // 写了几行字的便笺：整张铺在一张纸上。
  note:p=>{p.fill(PAL.paper.base);for(let y=3;y<14;y+=2){const w=6+((y*7)%6);p.rect(2,y,w,1,'#8a7a62');}p.rect(0,0,16,1,'#d9cba8');},
  // 卷起的卷轴：米白纸卷，两端深色轴头，中间一道朱红系带。
  scrollRoll:p=>{p.fill('#e8dcc0');p.rect(0,0,16,2,'#f4ecd8');p.rect(0,13,16,3,'#c9b994');p.rect(0,0,2,16,'#4a3123').rect(14,0,2,16,'#4a3123');p.rect(7,0,2,16,'#b8452f');},
  scroll:p=>{p.fill(PAL.paper.base);for(let y=3;y<14;y+=3)p.rect(3,y,10,1,'#8a7a62');p.rect(0,0,16,1,'#b8452f').rect(0,15,16,1,'#b8452f');},
  ceramic:p=>{p.fill('#dfe6e2');p.rect(0,5,16,3,'#3f6f8a');p.rect(0,6,16,1,'#5a8aa4');p.rect(0,0,16,1,'#f4f8f6');},
  teapot:p=>{p.fill('#5b3a2c');p.rect(0,4,16,2,'#74503c');p.rect(0,12,16,1,'#3e271c');},
  tray:p=>{p.fill(F.light);p.rect(0,0,16,1,'#8a6248');},
  // 纸灯笼：米色纸面、深木框，发光贴图。
  lanternPaper:p=>{p.fill('#ffe2a8');p.rect(0,0,16,1,'#d7a25a').rect(0,15,16,1,'#d7a25a');for(let y=4;y<16;y+=4)p.rect(0,y,16,1,'#f4c27a');p.rect(7,0,2,16,'#f6cf8c');},
  lanternFrame:p=>{p.fill(F.dark);p.rect(0,0,16,1,F.light);},
  // 火：分层的焰心、橙焰、暗红焰尖，镂空背景。
  flame:p=>{p.clear();const r=rng(106),X=PAL.fire;for(let x=0;x<16;x++){const h=6+Math.floor(r()*9)-(Math.abs(x-7.5)>5?4:0);for(let y=16-h;y<16;y++){const t=(y-(16-h))/h;p.px(x,y,t<.25?X.low:t<.55?X.mid:t<.8?X.hot:X.core);}}},
  ember:p=>{const r=rng(107);p.fill('#3a1a10');speckle(p,r,['#ff8a2a','#ffc24a','#c23a14'],.35);},
  logEnd:p=>{p.fill('#3a2a1e');p.rect(3,3,10,10,'#9a7448').rect(5,5,6,6,'#b88a54').rect(7,7,2,2,'#7a5634');},
  pot:p=>{const r=rng(108);p.fill('#9a5a3c');p.rect(0,0,16,2,'#b8714c').rect(0,13,16,3,'#7a4430');speckle(p,r,['#8a4e34','#a8664a'],.12);},
  stonePot:V2_BLOCK_PAINT['block/stone_bricks'],
  shrub:V2_BLOCK_PAINT['block/oak_leaves'],
  blossom:V2_BLOCK_PAINT['block/cherry_leaves'],
  ivy:p=>{const r=rng(109);p.clear();for(let i=0;i<46;i++){const x=Math.floor(r()*15),y=Math.floor(r()*15);p.rect(x,y,2,2,pick(r,['#4e8a3a','#68a64a','#376a2c']));}for(let i=0;i<8;i++)p.px(Math.floor(r()*16),Math.floor(r()*16),pick(r,['#f2a7c0','#fbd3df','#e0e070']));},
  // 芦苇帘：竖向细杆，留缝（阳光从缝里漏下来）。
  blind:p=>{p.clear();for(let x=0;x<16;x+=2){p.rect(x,0,1,16,x%4?'#c9b07a':'#b39a64');}p.rect(0,7,16,1,'#6a4a2a');},
  rope:p=>{p.fill('#a0844f');for(let y=0;y<16;y+=2)p.px(0,y,'#7a6038');},
  iron:p=>{p.fill('#3a3a3e');p.rect(0,0,16,1,'#55555c');},
};
const M=(k:V2Kit,name:keyof typeof PROP_PAINT,o?:Parameters<V2Kit['mat']>[2])=>k.mat(name,PROP_PAINT[name],o);

/** 八角桌：石砌桌座 + 木颈 + 厚桌面，桌面外圈一道浅色镶边。原点在地面中心。 */
export function octagonTable(k:V2Kit,r:number,height:number){
  const g=new THREE.Group();g.name='v2-octagon-table';
  k.prism(g,.62,.12,8,M(k,'stonePot'),0,.06,0);k.prism(g,.46,.5,8,M(k,'stonePot'),0,.37,0);
  k.prism(g,.34,.2,8,k.mat('frame-log',V2_BLOCK_PAINT['block/stripped_dark_oak_log']),0,.72,0);
  k.prism(g,r*.72,.06,8,k.mat('frame-planks',V2_BLOCK_PAINT['block/dark_oak_planks']),0,height-.15,0);
  k.prism(g,r,.12,8,[M(k,'tableEdge'),M(k,'tableTop'),M(k,'tableTop')],0,height-.06,0);
  return g;
}
/** 木椅：白桦框架、三根横档的靠背、布垫（颜色因座位而异）。朝 +z 坐，原点在地面中心。 */
export function chair(k:V2Kit,fabric:string){
  const g=new THREE.Group(),w=M(k,'chairWood'),c=M(k,'cushion',{color:fabric});
  for(const x of [-.21,.21])for(const z of [-.19,.19])k.box(g,.07,.45,.07,w,x,.225,z);
  k.box(g,.5,.06,.48,w,0,.47,0);k.box(g,.46,.07,.44,c,0,.535,.01);
  for(const x of [-.21,.21])k.box(g,.07,.6,.07,w,x,.8,-.2);
  for(const y of [.7,.86])k.box(g,.42,.05,.04,w,0,y,-.2);k.box(g,.52,.07,.07,w,0,1.1,-.2);
  // 靠背上一块小靠垫，同色。
  k.box(g,.36,.24,.05,c,0,.82,-.16);
  return g;
}
/** 桌上的茶具：托盘、茶壶、给每个座位一只茶杯，少数座位一卷纸。 */
export function teaSet(k:V2Kit,seats:Array<[number,number]>,cx:number,cz:number,top:number,tableR=1.45){
  /** 杯子、便笺、纸卷离桌心的距离跟着桌子半径走 */const sr=tableR/1.45;
  const g=new THREE.Group();g.name='v2-tea';
  // 小件的贴图按物件大小整张铺上（px = 16 / 尺寸），不然一只杯子上只剩一两个像素的花纹。
  k.box(g,.62,.03,.42,M(k,'tray'),cx,top+.015,cz,40);
  const pot=M(k,'teapot');k.box(g,.2,.15,.2,pot,cx-.08,top+.105,cz,80);k.box(g,.1,.04,.1,pot,cx-.08,top+.2,cz,160);k.box(g,.03,.03,.03,pot,cx-.08,top+.235,cz,500);
  const spout=k.box(g,.12,.035,.035,pot,cx+.06,top+.15,cz,130);spout.rotation.z=.6;k.box(g,.03,.1,.03,pot,cx-.2,top+.11,cz,160);
  for(const [dx,dz] of [[.15,.1],[.15,-.08]])k.box(g,.07,.06,.07,M(k,'ceramic'),cx+dx,top+.06,cz+dz,230);
  seats.forEach(([x,z],i)=>{const dx=x-cx,dz=z-cz,l=Math.hypot(dx,dz),ux=dx/l,uz=dz/l,yaw=Math.atan2(dx,dz);
    k.box(g,.11,.012,.11,M(k,'tray'),cx+ux*.98*sr-uz*.24,top+.006,cz+uz*.98*sr+ux*.24,140);k.box(g,.07,.07,.07,M(k,'ceramic'),cx+ux*.98*sr-uz*.24,top+.047,cz+uz*.98*sr+ux*.24,230);
    const sheet=k.box(g,.3,.01,.22,M(k,'note'),cx+ux*.9*sr+uz*.1,top+.005,cz+uz*.9*sr-ux*.1,53);sheet.rotation.y=yaw+(i%2?.12:-.1);
    if(i%3===0){const s=k.box(g,.36,.06,.06,M(k,'scrollRoll'),cx+ux*.62*sr,top+.03,cz+uz*.62*sr,44);s.rotation.y=yaw;}});
  return g;
}
/** 纸灯笼：上下深木盖、四面发光纸，原点在灯笼顶部挂点。 */
export function paperLantern(k:V2Kit,size=.36,glow=1.4){
  const g=new THREE.Group(),h=size*1.35,f=M(k,'lanternFrame');
  k.box(g,size+.06,.05,size+.06,f,0,-.025,0);k.box(g,size+.06,.05,size+.06,f,0,-h-.025,0);
  k.box(g,size,h,size,M(k,'lanternPaper',{glow}),0,-h/2-.025,0);
  for(const x of [-1,1])for(const z of [-1,1])k.box(g,.035,h,.035,f,x*size/2,-h/2-.025,z*size/2);
  return g;
}
/** 吊杆：从挂点往上到梁底的一根细绳。 */
export function cord(k:V2Kit,length:number){const g=new THREE.Group();k.box(g,.025,length,.025,M(k,'rope'),0,length/2,0);return g;}
/** 壁炉里的火：几根原木、一层炭火、两片交叉的火焰（逐帧闪动）。原点在炉膛地面中心，朝 -x 开口。 */
export function hearthFire(k:V2Kit){
  const g=new THREE.Group();g.name='v2-fire';const bark=k.mat('bark',V2_BLOCK_PAINT['block/dark_oak_log']);
  k.box(g,.9,.06,.7,M(k,'ember',{glow:1.2}),0,.03,0);
  for(const [z,yaw] of [[-.12,.25],[.14,-.2],[0,0]] as const){const l=k.box(g,.18,.16,.9,[bark,bark,bark,bark,M(k,'logEnd'),M(k,'logEnd')],0,.12+(yaw===0?.12:0),z);l.rotation.y=Math.PI/2+yaw;}
  const flameMat=M(k,'flame',{glow:2.4,transparent:true,side:THREE.DoubleSide});flameMat.depthWrite=false;
  const flames:THREE.Mesh[]=[];for(const yaw of [0,Math.PI/2,Math.PI/4]){const f=new THREE.Mesh(new THREE.PlaneGeometry(.8,.75),flameMat);f.position.set(0,.5,0);f.rotation.y=yaw;f.renderOrder=2;f.castShadow=false;g.add(f);flames.push(f);}
  g.userData.flicker=(now:number)=>{flames.forEach((f,i)=>{const s=1+.12*Math.sin(now/90+i*2.1)+.06*Math.sin(now/37+i);f.scale.set(1,s,1);f.position.y=.5*s-.02;});flameMat.emissiveIntensity=2.2+.5*Math.sin(now/70)+.3*Math.sin(now/23);};
  return g;
}
/** 盆栽：方形陶盆或石盆里一丛方块叶团，可带花。原点在地面中心。 */
export function pottedShrub(k:V2Kit,s:number,stone=false,flowers=false,seed=1){
  const g=new THREE.Group(),r=rng(seed),pot=stone?M(k,'stonePot'):M(k,'pot');
  k.box(g,.5*s,.42*s,.5*s,pot,0,.21*s,0);k.box(g,.56*s,.06*s,.56*s,pot,0,.42*s,0);
  const leaf=M(k,'shrub',{transparent:false}),bloom=M(k,'blossom');
  for(let i=0;i<5;i++){const w=(.36+r()*.22)*s;k.box(g,w,w*.8,w,flowers&&i%2?bloom:leaf,(r()-.5)*.3*s,.5*s+w*.4+i*.09*s,(r()-.5)*.3*s);}
  return g;
}
/** 垂吊花篮：铁环吊篮 + 往下垂的常春藤和小花。原点在挂点。 */
export function hangingBasket(k:V2Kit,len=.7){
  const g=new THREE.Group();g.add(cord(k,len).translateY(-len));
  k.box(g,.42,.18,.42,M(k,'pot'),0,-len-.09,0);
  const ivy=M(k,'ivy',{side:THREE.DoubleSide});for(let i=0;i<5;i++){const a=i/5*Math.PI*2,h=.5+(i%3)*.18;const p=new THREE.Mesh(new THREE.PlaneGeometry(.22,h),ivy);p.position.set(Math.sin(a)*.2,-len-.05-h/2,Math.cos(a)*.2);p.rotation.y=a;p.castShadow=true;g.add(p);}
  k.box(g,.46,.16,.46,M(k,'shrub'),0,-len+.04,0);
  return g;
}
/**
 * 一枝垂下来的樱花（前景框景用）：几段深色细枝 + 每个枝节一团小方块花簇（三种粉、少量白），
 * 方块边长 3.5–8 厘米，远看是一簇簇花而不是一片片纸。原点在挂点，枝条往 +x 伸、往下垂。
 */
export function blossomSpray(k:V2Kit,len:number,droop:number,seed=1){
  const g=new THREE.Group();g.name='v2-blossom-spray';const r=rng(seed),bark=new THREE.Color(PAL.bark.dark),cb=new ColorBoxes();
  const pinks=[PAL.cherry.base,PAL.cherry.light,PAL.cherry.dark,PAL.cherry.base,'#fff4f6'].map(c=>new THREE.Color(c));
  const nodes:Array<[number,number,number]>=[];
  const limb=(x0:number,y0:number,z0:number,dx:number,dy:number,dz:number,steps:number,th:number)=>{let x=x0,y=y0,z=z0;for(let i=0;i<steps;i++){const nx=x+dx*(.8+r()*.4),ny=y+dy*(.7+r()*.6),nz=z+dz+(r()-.5)*.08;
    cb.add(Math.min(x,nx)-th/2,Math.min(y,ny)-th/2,Math.min(z,nz)-th/2,Math.max(x,nx)+th/2,Math.max(y,ny)+th/2,Math.max(z,nz)+th/2,bark,bark);x=nx;y=ny;z=nz;nodes.push([x,y,z]);}return [x,y,z] as [number,number,number];};
  const n=Math.max(3,Math.round(len/.2));limb(0,0,0,len/n,-droop/n,0,n,.06);
  const main=nodes.length;for(let i=1;i<main-1;i+=2){const [x,y,z]=nodes[i];limb(x,y,z,(r()-.3)*.18,-.16-r()*.14,(r()-.5)*.2,2+Math.floor(r()*2),.035);}
  for(const [x,y,z] of nodes){const m=10+Math.floor(r()*8);for(let j=0;j<m;j++){const s=.035+r()*.045,px=x+(r()-.5)*.26,py=y+(r()-.6)*.22,pz=z+(r()-.5)*.26,c=pinks[Math.floor(r()*pinks.length)];
    cb.add(px-s/2,py-s/2,pz-s/2,px+s/2,py+s/2,pz+s/2,c,c.clone().multiplyScalar(.86),c.clone().multiplyScalar(.72),false);}}
  const mesh=new THREE.Mesh(cb.geometry(),k.flat('#ffffff',{vertex:true}));mesh.castShadow=true;g.add(mesh);
  return g;
}
/**
 * 茶台（厅西南角、默认机位左下的前景）：一块草席、一张矮几（几上两只茶罐、一只茶盘）、一只石炭炉（炭火 + 铁壶）、两个坐垫。
 * 原点在地面中心，长边沿 z。
 */
export function teaStation(k:V2Kit){
  const g=new THREE.Group();g.name='v2-tea-station';const wood=M(k,'tableTop'),edge=M(k,'tableEdge');
  k.box(g,1.3,.02,1.7,M(k,'matEdge'),0,.01,0);k.box(g,1.16,.02,1.56,M(k,'mat'),0,.02,0);
  for(const x of [-.24,.24])for(const z of [-.42,.42])k.box(g,.06,.32,.06,edge,x,.19,z-.1);
  k.box(g,.6,.06,1.04,[edge,edge,wood,wood,edge,edge],0,.38,-.1);
  k.box(g,.34,.02,.24,M(k,'tray'),0,.42,-.3,40);
  for(const [x,z,h] of [[-.14,.12,.16],[-.02,.2,.12]] as const)k.box(g,.09,h,.09,M(k,'ceramic'),x,.41+h/2,z,180);
  // 炭炉：石身、上面一层炭火、铁壶。
  const stone=M(k,'stonePot');k.box(g,.38,.34,.38,stone,0,.19,.6);k.box(g,.3,.02,.3,M(k,'ember',{glow:1.6}),0,.365,.6);
  const pot=M(k,'iron');k.box(g,.22,.17,.22,pot,0,.47,.6,80);k.box(g,.1,.04,.1,pot,0,.575,.6,160);const sp=k.box(g,.12,.035,.035,pot,-.13,.5,.6,130);sp.rotation.z=-.6;
  for(const [x,z,i] of [[.48,-.3,0],[.48,.25,1]] as const)k.box(g,.44,.09,.44,M(k,'cushion',{color:PAL.fabric[i===0?3:6]}),x,.065,z);
  return g;
}
/** 芦苇帘：卷起的帘轴 + 放下一段的帘面（有缝，阳光从缝里漏进来）。原点在顶部中心，帘面在 x-y 平面。 */
export function reedBlind(k:V2Kit,width:number,drop:number){
  const g=new THREE.Group();k.box(g,width,.1,.1,M(k,'chairWood'),0,-.05,0);
  if(drop>0){const m=M(k,'blind',{side:THREE.DoubleSide}),geo=new THREE.PlaneGeometry(width,drop),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*width,uv.getY(i)*drop);const p=new THREE.Mesh(geo,m);p.position.y=-.1-drop/2;p.castShadow=true;p.receiveShadow=true;g.add(p);}
  return g;
}
/** 八角草编席，深色包边。原点在地面中心。 */
export function octagonMat(k:V2Kit,r:number){const g=new THREE.Group();k.prism(g,r,.02,8,M(k,'matEdge'),0,.012,0);k.prism(g,r-.14,.02,8,M(k,'mat'),0,.02,0);return g;}
export {place};
