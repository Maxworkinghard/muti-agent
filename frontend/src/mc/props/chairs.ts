/**
 * 共用椅子族：一套尺寸、六种场景款式。原点在地面上、座位锚点正下方，人朝 +z 坐。
 * 尺寸全部从 Q 版人物骨架（avatar/rig.ts）推出来，所有款式共用：
 *   - 座面顶 SEAT_H = 0.50（座位锚点 y=1.5 = 地面 1 + 0.5），人坐下大腿下沿正好贴座面；
 *   - 座面前沿 +0.095（avatar/body.ts 的 SEAT）：宽肩 / 厚毛衣的小腿更靠前，前沿再往外就会顶到小腿；
 *     脚在 z 0.10–0.35、x ±0.23 以内，离地 0–0.13 不能有脚踏、五爪脚或横档；
 *   - 靠背前面 -0.125：最厚的外套背面贴着靠背；
 *   - 靠背顶 0.75：软萌型大头往后仰 0.4 弧度时，后脑下沿大约在 0.76，再高会顶进后脑；
 *   - 扶手内侧 ±0.43：宽肩 / 厚毛衣的胳膊外沿约 ±0.40，手势往外摆还留 3 厘米。
 * 椅子 id、slide、碰撞箱（physics）都不在这里，房间照旧给。
 * 款式：meeting 会议木椅（自然木 + 低饱和布垫）、office 现代办公椅（雪橇底，脚下没有五爪）、classroom 浅木课椅、
 *       debate 稳重的正式座椅（深胡桃 + 软包 + 铜钉）、outdoor 户外木椅（风化木条）、lounge 软包扶手椅（播客）。
 */
import * as THREE from 'three';
import {SEAT_H} from '../avatar/rig';
import {SEAT} from '../avatar/body';
import {createV2Kit,type V2Kit} from '../v2/kit';
import {rng,tone,blend} from '../v2/pixel';
import type {Kit} from './furniture';
import type {Painter} from '../style';

export {SEAT_H};
/** 座面前沿、靠背前面、扶手内侧、靠背顶、座宽（米） */
export const CHAIR={front:SEAT.front,back:SEAT.back,armIn:SEAT.armIn,backTop:SEAT.backTop,width:SEAT.halfWidth*2} as const;
const D=CHAIR.front-CHAIR.back,ZC=(CHAIR.front+CHAIR.back)/2,S=SEAT_H,TOP=CHAIR.backTop;
/** 椅子的贴图密度：每米 32 像素（方块是 16，人物是 48），腿和横档上看得见木纹 */
const PX=32;

/** 木纹：顺着长边的细纹，深浅两档，偶尔一个节疤；v=竖纹（腿、立柱），h=横纹（座板、横档） */
const grain=(base:string,seed:number,v:boolean):Painter=>p=>{const r=rng(seed);p.fill(base);
  for(let i=0;i<10;i++){const len=4+Math.floor(r()*10),a=Math.floor(r()*16),b=Math.floor(r()*16),c=r()<.55?tone(base,.88):tone(base,1.08);if(v)p.rect(b,a,1,len,c);else p.rect(a,b,len,1,c);}
  if(r()<.6){const x=1+Math.floor(r()*13),y=1+Math.floor(r()*13);if(v)p.rect(x,y,1,2,tone(base,.72));else p.rect(x,y,2,1,tone(base,.72));}};
/** 软包：浅底（颜色由材质色乘上去）、拉扣的十字褶和扣子 */
const tufted:Painter=p=>{p.fill('#e6dfd0');for(let y=0;y<16;y+=8)for(let x=0;x<16;x+=8){const o=(y/8)%2*4;p.px(x+3+o,y+4,'#a89c86').px(x+2+o,y+4,'#d8cfbd').px(x+3+o,y+3,'#eee8dc');}p.rect(0,0,16,1,'#f4efe4');};
/** 网布靠背：深灰底、很淡的细网眼（贴图密度 64，网眼 1.5 厘米） */
const mesh:Painter=p=>{p.fill('#3f444b');for(let y=0;y<16;y+=2)for(let x=(y%4?1:0);x<16;x+=2)p.px(x,y,'#363a40');p.rect(0,0,16,1,'#4a5058');};
/** 布面：浅底（颜色由材质色乘上去），一道很淡的斜纹，没有砖缝一样的横竖线 */
const cloth:Painter=p=>{p.fill('#ede7db');for(let y=0;y<16;y++)for(let x=0;x<16;x++)if((x+y*3)%8===0)p.px(x,y,'#e1d9ca');for(let x=0;x<16;x+=8)p.px(x+3,(x*5)%16,'#f6f1e6');};

export type ChairKind='meeting'|'office'|'classroom'|'debate'|'outdoor'|'lounge';
/** 低饱和的布垫色（会议椅、办公椅）：灰过的砖红、灰蓝、麦黄、灰绿、灰紫、灰青、陶土、亚麻 */
export const SOFT_FABRIC=['#9a6c60','#62738a','#a4926a','#6f8269','#7c6a7a','#5f7c79','#a07a5e','#b9ae98'];

/** 每个道具 Kit 配一个 v2 工具（材质缓存、统一释放），椅子用它画像素贴图 */
const kits=new WeakMap<object,V2Kit>();
export const chairKit=(k:Kit|V2Kit)=>{if('flat' in k)return k as V2Kit;let x=kits.get(k);if(!x){x=createV2Kit(k.owned);kits.set(k,x);}return x;};

/** 会议木椅：自然橡木框，两根后柱通到靠背顶，两道横档 + 一块布靠垫，座板上一层布垫，侧面低处一道横撑。 */
function meeting(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-meeting';
  const woodV=k.mat('chair-oak-v',grain('#b08a5e',11,true)),woodH=k.mat('chair-oak-h',grain('#b08a5e',12,false)),cush=k.mat('chair-cloth',cloth,{color:fabric});
  const zf=CHAIR.front-.035,zb=CHAIR.back-.025,L=.045;
  for(const x of [-.2,.2]){k.box(g,L,S-.075,L,woodV,x,(S-.075)/2,zf,PX);k.box(g,L,TOP,L,woodV,x,TOP/2,zb,PX);}
  // 座框（前、左右三面裙板）+ 座板 + 布垫（顶面正好 S）
  k.box(g,.46,.05,.03,woodH,0,S-.085,zf+.005,PX);for(const x of [-.2,.2])k.box(g,.03,.05,D,woodH,x,S-.085,ZC,PX);
  k.box(g,.46,.03,D+.02,woodH,0,S-.055,ZC,PX);k.box(g,.43,.04,D-.01,cush,0,S-.02,ZC+.002,PX);
  // 靠背：两道横档、一块布靠垫（前面在 CHAIR.back）、顶上一根横木
  for(const y of [S+.13,S+.25])k.box(g,.36,.035,.03,woodH,0,y,zb,PX);
  k.box(g,.47,.05,.045,woodH,0,TOP-.025,zb,PX);
  k.box(g,.34,.16,.022,cush,0,S+.19,CHAIR.back-.011,PX);
  // 侧面低处的横撑（在脚后面，碰不到鞋）
  for(const x of [-.2,.2])k.box(g,.025,.025,zf-zb,woodH,x,.13,(zf+zb)/2,PX);
  k.box(g,.36,.025,.025,woodH,0,.13,zb,PX);
  return g;
}
/** 现代办公椅：雪橇式金属底（两根落地横杆在脚的两侧，脚下什么都没有）、软垫座、网布靠背带腰垫、T 形扶手。 */
function office(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-office';
  const metal=k.flat('#8f969f',{rough:.42}),dark=k.flat('#3a3f47',{rough:.6}),cush=k.mat('chair-cloth',cloth,{color:fabric}),net=k.mat('chair-mesh',mesh);
  const X=.245,T=.028;
  // 底：两根落地横杆、后横杆、前立杆、座下两根纵梁
  for(const s of [-1,1]){k.box(g,T,T,.33,metal,s*X,T/2,-.035);k.box(g,T,S-.08,T,metal,s*X,(S-.08)/2+T/2,.12);k.box(g,T,T,.33,metal,s*X,S-.075,-.035);}
  k.box(g,2*X+T,T,T,metal,0,T/2,-.2);
  // 座：塑料壳 + 软垫（顶面 S）
  k.box(g,.46,.02,D+.02,dark,0,S-.065,ZC);k.box(g,.47,.055,D,cush,0,S-.0275,ZC,PX);
  // 靠背：两根立杆在靠背后面，网布靠背 + 腰垫 + 顶上一道边框
  for(const s of [-1,1])k.box(g,.03,TOP-S+.05,.03,dark,s*.2,(TOP+S-.05)/2,CHAIR.back-.04);
  k.box(g,.4,.22,.02,net,0,S+.17,CHAIR.back-.01,64);k.box(g,.42,.03,.03,dark,0,TOP-.015,CHAIR.back-.015);
  k.box(g,.34,.07,.02,cush,0,S+.09,CHAIR.back-.008,PX);
  // T 形扶手：座下伸出的支架 → 立柱 → 扶手垫（内侧 ±0.37）
  for(const s of [-1,1]){const ax=s*(CHAIR.armIn+.025);k.box(g,CHAIR.armIn+.025-X,.025,.03,metal,s*(X+(CHAIR.armIn+.025-X)/2),S-.075,.04);k.box(g,.028,.2,.028,metal,ax,S+.05,.04);k.box(g,.05,.03,.22,dark,ax,S+.165,-.01);}
  return g;
}
/** 浅木课椅：浅灰金属管腿、桦木座板和弯一点的靠背板，座下一个放书的铁丝筐。 */
function classroom(k:V2Kit){
  const g=new THREE.Group();g.name='chair-classroom';
  const birch=k.mat('chair-birch-h',grain('#c9b083',21,false)),birchV=k.mat('chair-birch-v',grain('#c9b083',22,true)),tube=k.flat('#8d949c',{rough:.45}),T=.028;
  const zf=CHAIR.front-.03,zb=CHAIR.back-.03;
  for(const x of [-.19,.19]){k.box(g,T,S-.03,T,tube,x,(S-.03)/2,zf);k.box(g,T,TOP-.05,T,tube,x,(TOP-.05)/2,zb);k.box(g,T,T,zf-zb,tube,x,.12,(zf+zb)/2);k.box(g,T,T,zf-zb,tube,x,S-.04,(zf+zb)/2);}
  k.box(g,.42,.025,D+.01,birch,0,S-.0125,ZC,PX);
  // 靠背板：中间一块，两侧各往前折一点（弧形靠背的方块画法）
  k.box(g,.26,.13,.02,birchV,0,S+.2,CHAIR.back-.01,PX);for(const s of [-1,1]){const w=k.box(g,.08,.13,.02,birchV,s*.165,S+.2,CHAIR.back-.002,PX);w.rotation.y=-s*.35;}
  // 书筐：座下一圈细铁丝（在小腿后面）
  k.box(g,.36,.015,.18,tube,0,S-.15,ZC-.02);for(const s of [-1,1])k.box(g,.012,.09,.18,tube,s*.18,S-.1,ZC-.02);
  return g;
}
/** 稳重的正式座椅：深胡桃方腿和扶手、软包座和靠背（拉扣，颜色按阵营），座框前沿一排铜钉。 */
function debate(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-debate';
  const walV=k.mat('chair-walnut-v',grain('#5e3d29',31,true)),walH=k.mat('chair-walnut-h',grain('#5e3d29',32,false)),pad=k.mat('chair-tufted',tufted,{color:fabric}),brass=k.flat('#c9a14a',{rough:.35});
  const zf=CHAIR.front-.045,zb=CHAIR.back-.05,L=.06;
  for(const x of [-.21,.21]){k.box(g,L,S-.13,L,walV,x,(S-.13)/2,zf,PX);k.box(g,L,TOP,L,walV,x,TOP/2,zb,PX);}
  // 座框 + 软包座（顶面 S）+ 前沿铜钉
  k.box(g,.5,.07,D+.03,walH,0,S-.115,ZC,PX);k.box(g,.48,.08,D,pad,0,S-.04,ZC,PX);
  for(let x=-.21;x<=.211;x+=.06)k.box(g,.014,.014,.01,brass,x,S-.115,CHAIR.front+.012);
  // 靠背：胡桃框 + 软包板（前面在 CHAIR.back）
  k.box(g,.48,.04,.06,walH,0,TOP-.02,zb,PX);k.box(g,.4,.22,.045,pad,0,S+.16,CHAIR.back-.0225,PX);
  // 扶手：前立柱 + 胡桃扶手（内侧 ±0.37）+ 扶手上一条软包
  for(const s of [-1,1]){const ax=s*(CHAIR.armIn+.03);k.box(g,.045,.2,.045,walV,ax,S+.06,zf,PX);k.box(g,.06,.04,zf-zb+.06,walH,ax,S+.18,(zf+zb)/2,PX);k.box(g,.07,.035,zf-zb-.02,pad,ax,S+.217,(zf+zb)/2,PX);
    k.box(g,CHAIR.armIn+.03-.21,.04,.04,walH,s*(.21+(CHAIR.armIn+.03-.21)/2),S-.11,zf,PX);}
  return g;
}
/** 户外木椅：风化的灰褐木，粗方腿、四根座条、两根靠背条、宽扶手板。 */
function outdoor(k:V2Kit){
  const g=new THREE.Group();g.name='chair-outdoor';
  const wv=k.mat('chair-weather-v',grain('#86745c',41,true)),wh=k.mat('chair-weather-h',grain('#927f64',42,false)),L=.06;
  const zf=CHAIR.front-.045,zb=CHAIR.back-.04;
  for(const x of [-.21,.21]){k.box(g,L,S-.035,L,wv,x,(S-.035)/2,zf,PX);k.box(g,L,TOP,L,wv,x,TOP/2,zb,PX);}
  for(const x of [-.21,.21])k.box(g,.04,.06,zf-zb,wh,x,S-.065,(zf+zb)/2,PX);
  // 座：四根顺着 x 的木条，条间留缝
  for(let i=0;i<4;i++){const z=CHAIR.back+.03+i*(D-.02)/3.5;k.box(g,.47,.03,.05,wh,0,S-.015,Math.min(CHAIR.front-.025,z),PX);}
  // 靠背两根横条（前面在 CHAIR.back）
  for(const y of [S+.12,S+.24])k.box(g,.47,.075,.025,wh,0,y,CHAIR.back-.0125,PX);
  // 宽扶手板 + 前立柱
  for(const s of [-1,1]){const ax=s*(CHAIR.armIn+.045);k.box(g,.05,.19,.05,wv,ax,S-.015+.095-.02,zf,PX);k.box(g,.09,.03,zf-zb+.1,wh,ax,S+.17,(zf+zb)/2+.02,PX);
    k.box(g,CHAIR.armIn+.045-.21,.05,.04,wh,s*(.21+(CHAIR.armIn+.045-.21)/2),S-.08,zf,PX);}
  return g;
}
/** 软包扶手椅（播客间）：一整块软包底座、厚坐垫、厚靠背加顶上一条软枕、两侧宽扶手，四只短木脚。 */
function lounge(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-lounge';
  const wood=k.mat('chair-walnut-v',grain('#5e3d29',31,true)),c=k.mat('chair-cloth',cloth,{color:fabric}),deep=k.mat('chair-cloth',cloth,{color:blend(fabric,'#000000',.18)});
  const IN=CHAIR.armIn,AW=.11,X=IN+AW/2,zf=CHAIR.front-.01,zb=CHAIR.back-.12;
  for(const x of [-X,X])for(const z of [zb+.04,zf-.04])k.box(g,.05,.08,.05,wood,x,.04,z,PX);
  k.box(g,2*IN,.33,zf-zb,deep,0,.08+.165,(zf+zb)/2,PX);
  k.box(g,2*IN-.02,.09,D,c,0,S-.045,ZC,PX);
  k.box(g,2*IN+2*AW,TOP-.08-.08,.12,deep,0,.08+(TOP-.16)/2,CHAIR.back-.06,PX);k.box(g,2*IN,.08,.1,c,0,TOP-.04,CHAIR.back-.07,PX);
  for(const s of [-1,1]){k.box(g,AW,S+.1-.08,zf-zb,deep,s*X,.08+(S+.02)/2,(zf+zb)/2,PX);k.box(g,AW+.02,.06,zf-zb+.02,c,s*X,S+.13,(zf+zb)/2,PX);}
  return g;
}

/** 造一把椅子。fabric 是布面颜色（会议、办公、辩论、播客用；课椅、户外椅是纯木的，不用）。 */
export function makeChair(kit:Kit|V2Kit,kind:ChairKind,fabric='#8a8478'){
  const k=chairKit(kit);
  const g=kind==='office'?office(k,fabric):kind==='classroom'?classroom(k):kind==='debate'?debate(k,fabric):kind==='outdoor'?outdoor(k):kind==='lounge'?lounge(k,fabric):meeting(k,fabric);
  g.userData.chair={kind,seat:SEAT_H,front:CHAIR.front,back:CHAIR.back,armIn:CHAIR.armIn,top:CHAIR.backTop};
  return g;
}
