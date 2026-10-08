/**
 * 共用椅子族（docs/art/03-sample-log.md §椅子）：座面顶统一在 SEAT_H（0.50），原点在地面中心，朝 +z 坐。
 * Q 版人物的尺寸（T = 1/48 米）定下了椅子的形：
 *   - 躯干背面在 z = -0.104，长发片背面在 -0.125 → 靠背前面放在 z ≈ -0.135，人一坐下背就靠上；
 *   - 大腿只有 0.23 长，膝盖弯下去后小腿后侧在 z ≈ +0.146 → 座面前沿不超过 +0.14，小腿不穿座面；
 *   - 坐下后鞋底离地约 0.31 → 每把椅子在 z ≈ 0.16–0.30 处有脚踏（横档 / 脚踏圈 / 小脚凳），顶面在 0.29–0.30。
 * 所以座面只有 0.28 深（比真椅子浅），是 Q 版的矮胖椅子；宽度照常。人物的坐姿偏移、碰撞箱（physics）、椅子 id、slide 都不改。
 * 三种：会议木椅（圆桌用）、软包扶手椅、现代办公椅（后两种在 avatar-lab 展示）。
 */
import * as THREE from 'three';
import {SEAT_H} from '../avatar/rig';
import type {V2Kit} from '../v2/kit';
import {PROP_PAINT} from '../v2/roundtable/furnish';

export {SEAT_H};
/** 座面前沿、靠背前面、脚踏位置（z，米） */
export const CHAIR={front:.14,back:-.135,footZ:.22,footTop:.3} as const;
const SEAT_D=CHAIR.front-CHAIR.back,SEAT_Z=(CHAIR.front+CHAIR.back)/2;

/** 会议木椅：白桦框架，两根后柱通到靠背顶，三根横档的靠背带一块小靠垫；座面布垫；前腿往前伸出一截托着脚踏横档。 */
export function woodenChair(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-wooden';
  const w=k.mat('chair-wood',PROP_PAINT.chairWood),c=k.mat('chair-cushion',PROP_PAINT.cushion,{color:fabric}),dark=k.mat('chair-wood-dark',PROP_PAINT.chairWood,{color:'#b8a88a'});
  const L=.05,zb=CHAIR.back-.03,zf=CHAIR.front-.03;
  // 前腿两根、后柱两根（后柱一直到靠背顶）
  for(const x of [-.2,.2]){k.box(g,L,SEAT_H-.06,L,w,x,(SEAT_H-.06)/2,zf);k.box(g,L,SEAT_H+.5,L,w,x,(SEAT_H+.5)/2,zb);}
  // 座框 + 布垫（顶面正好 SEAT_H）
  k.box(g,.46,.05,SEAT_D+.02,w,0,SEAT_H-.06,SEAT_Z);k.box(g,.44,.04,SEAT_D-.01,c,0,SEAT_H-.02,SEAT_Z+.005);
  // 靠背：两根横档 + 顶横木 + 小靠垫（前面在 CHAIR.back）
  for(const y of [SEAT_H+.12,SEAT_H+.3])k.box(g,.36,.035,.035,w,0,y,zb);
  k.box(g,.5,.07,.065,w,0,SEAT_H+.47,zb);
  k.box(g,.32,.22,.03,c,0,SEAT_H+.22,CHAIR.back-.015);
  // 侧横档（低）伸到前面，托住脚踏横档；脚踏顶在 0.30
  for(const x of [-.2,.2])k.box(g,.04,.04,CHAIR.footZ+.03-zb,dark,x,CHAIR.footTop-.02,(zb+CHAIR.footZ+.03)/2);
  for(const x of [-.2,.2])k.box(g,.045,CHAIR.footTop,.045,w,x,CHAIR.footTop/2,CHAIR.footZ+.01);
  k.box(g,.44,.04,.06,dark,0,CHAIR.footTop-.02,CHAIR.footZ);
  return g;
}
/** 软包扶手椅：一整块软包底座、厚坐垫、高靠背，两侧宽扶手（内侧 ±0.345，人物手臂外沿 ±0.333）；前面配一只同色小脚凳。 */
export function armchair(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-armchair';
  const wood=k.mat('arm-wood',PROP_PAINT.chairWood,{color:'#8a6448'}),c=k.mat('arm-cush',PROP_PAINT.cushion,{color:fabric}),deep=k.mat('arm-deep',PROP_PAINT.cushion,{color:'#'+new THREE.Color(fabric).multiplyScalar(.82).getHexString()});
  const IN=.345,AW=.11,X=IN+AW/2;
  // 四只短木脚 + 底座（.08–.36）+ 坐垫（.36–.50）
  for(const x of [-(X),X])for(const z of [CHAIR.back-.1,CHAIR.front-.03])k.box(g,.06,.08,.06,wood,x,.04,z);
  k.box(g,2*IN,.28,SEAT_D+.1,deep,0,.22,SEAT_Z-.05);
  k.box(g,2*IN-.02,.14,SEAT_D,c,0,SEAT_H-.07,SEAT_Z);
  // 靠背：底座后面立起来，前面在 CHAIR.back；顶上圆一点（窄一档的顶垫）
  k.box(g,2*IN+2*AW,.46,.12,deep,0,.08+.28+.46/2+.04-.04,CHAIR.back-.06);
  k.box(g,2*IN,.08,.1,c,0,SEAT_H+.44,CHAIR.back-.06);
  // 扶手：内侧 ±IN，顶面高出座面 .18，前端圆头
  for(const s of [-1,1]){k.box(g,AW,.46,SEAT_D+.1,deep,s*X,.08+.23,SEAT_Z-.05);k.box(g,AW+.02,.06,SEAT_D+.12,c,s*X,.08+.46+.03,SEAT_Z-.05);}
  // 小脚凳：顶面 0.30，正好在鞋底下
  k.box(g,.42,CHAIR.footTop-.06,.18,deep,0,(CHAIR.footTop-.06)/2+.04,CHAIR.footZ+.03);k.box(g,.44,.06,.2,c,0,CHAIR.footTop-.03,CHAIR.footZ+.03);
  for(const x of [-.18,.18])for(const z of [CHAIR.footZ-.04,CHAIR.footZ+.1])k.box(g,.04,.04,.04,wood,x,.02,z);
  return g;
}
/** 现代办公椅：五星脚带脚轮、气压立柱、脚踏圈（顶面 0.30，半径 0.24，正好在鞋底下）、座垫、镂空靠背加腰垫、T 形扶手（内侧 ±0.345）。 */
export function officeChair(k:V2Kit,fabric:string){
  const g=new THREE.Group();g.name='chair-office';
  const metal=k.flat('#7a7f88',{rough:.4}),dark=k.flat('#2e3238',{rough:.5}),c=k.mat('office-cush',PROP_PAINT.cushion,{color:fabric}),plastic=k.flat('#3a3e46',{rough:.7});
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5+Math.PI/5,leg=k.box(g,.05,.04,.3,metal,Math.sin(a)*.15,.07,Math.cos(a)*.15);leg.rotation.y=a;k.box(g,.06,.05,.06,dark,Math.sin(a)*.29,.025,Math.cos(a)*.29);}
  k.prism(g,.05,.06,8,metal,0,.08,0);
  k.box(g,.05,SEAT_H-.12,.05,metal,0,(SEAT_H-.12)/2+.06,0);
  // 脚踏圈：顶面 0.30
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.24,.016,6,16),metal);ring.rotation.x=Math.PI/2;ring.position.set(0,CHAIR.footTop-.016,0);ring.castShadow=true;g.add(ring);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,sp=k.box(g,.02,.02,.22,metal,Math.sin(a)*.12,CHAIR.footTop-.016,Math.cos(a)*.12);sp.rotation.y=a;}
  // 座垫
  k.box(g,.42,.03,SEAT_D,plastic,0,SEAT_H-.085,SEAT_Z);k.box(g,.46,.07,SEAT_D+.04,c,0,SEAT_H-.035,SEAT_Z+.01);
  // 靠背：两根竖杆 + 上靠背 + 腰垫（前面在 CHAIR.back）
  for(const x of [-.17,.17])k.box(g,.04,.62,.04,plastic,x,SEAT_H+.2,CHAIR.back-.05);
  k.box(g,.42,.2,.05,c,0,SEAT_H+.42,CHAIR.back-.025);k.box(g,.36,.14,.04,c,0,SEAT_H+.14,CHAIR.back-.02);
  // T 形扶手：从座下支架伸出
  for(const s of [-1,1]){const x=s*(.345+.025);k.box(g,(.345+.025)-.2,.03,.04,metal,s*(.2+(.345+.025-.2)/2),SEAT_H-.09,SEAT_Z);k.box(g,.03,.22,.03,metal,x,SEAT_H+.02,SEAT_Z);k.box(g,.05,.03,.2,plastic,x,SEAT_H+.14,SEAT_Z+.01);}
  return g;
}
export type ChairKind='wooden'|'armchair'|'office';
export function makeChair(k:V2Kit,kind:ChairKind,fabric:string){
  return kind==='armchair'?armchair(k,fabric):kind==='office'?officeChair(k,fabric):woodenChair(k,fabric);
}
