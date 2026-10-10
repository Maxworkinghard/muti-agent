/**
 * 把一份造型拼成网格：躯干、胳膊、大腿、头、头发和配件合进一个蒙皮网格（8 根骨头）；小腿和鞋分开挂（鞋在脚踝上，
 * 坐下小腿往前斜的时候鞋底仍是平的）；双肩包单独一块（站着背在背上，坐下挂到椅背后面，由 player.ts 摆）。
 * 所有零件共用一张贴图集（1 像素 = 1 T）。尺寸全部来自这个人的体型（body.ts）：身体脚底 y=0，头颈部 y=0。
 * 头发：大发团每个面按“同一平面一张贴图”画发丝（hair.ts 的 hairTexel），一缕头发跨过几个盒子也是连着的。
 */
import * as THREE from 'three';
import {Atlas,mix,tone,type Pen,type Rect} from './paint';
import {Mesher,type Faces} from './mesh';
import {planHair,hairTexel,hairColors,type HairBox,type FaceKey} from './hair';
import {paintFace,paintAnimeFace,ANIME_SCALE,FACE_H,type FaceState} from './face';
import {resolveLook,type Resolved} from './resolve';
import {T,HEAD} from './rig';
import {makeBody,sitPose,type Body,type SitPose} from './body';
import {EMBLEM} from './emblem';
import type {Accessory,Emblem,Look} from './types';

export interface Avatar {geometry:THREE.BufferGeometry;shins:[THREE.BufferGeometry,THREE.BufferGeometry];shoes:[THREE.BufferGeometry,THREE.BufferGeometry];
  /** 双肩包（没有就是 null）：原点在包的背面中心 */pack:THREE.BufferGeometry|null;
  atlas:Atlas;texture:THREE.CanvasTexture;resolved:Resolved;body:Body;sit:SitPose;face(st:FaceState):void}
const TEAM:Record<string,string>={pro:'#4e79a1',con:'#c45f53'};
const FACES:FaceKey[]=['px','nx','py','ny','pz','nz'];

/** 先用 256×256 的贴图集，放不下（发团特别多的发型 + 配件）就换 512×512 重来一遍。 */
export function buildAvatar(input:Look,side='host'):Avatar{
  try{return build(input,side,256);}catch(e){if(!String(e).includes('放不下'))throw e;return build(input,side,512);}
}
function build(input:Look,side:string,size:number):Avatar{
  const res=resolveLook(input),L=res.look,atlas=new Atlas(size),m=new Mesher(atlas.size);
  const body=makeBody(L.body.type,L.body.head),outerBack=!!L.outer&&!['apron','overalls'].includes(L.outer.kind),sit=sitPose(body,L.body.sit,outerBack);
  const HY=body.hipY,NY=body.neckY,{hx,hz,h:hh}=HEAD,cut=body.head.cut,fx=hx-cut,jaw=body.head.jaw;
  const tw=body.torso.w,th=body.torso.h,td=body.torso.d,cx=Math.round(tw/2);
  const skin=L.skin,hairC=L.hair.color,top=L.top.color,trim=L.top.trim??tone(top,1.3);
  const outer=L.outer,oc=outer?.color??top,otrim=outer?.trim??tone(oc,.75);
  const bottomC=L.bottom.color;
  const solid=(c:string)=>atlas.solid(c);
  const panel=(w:number,h:number,paint:(p:Pen)=>void):Rect=>{const r=atlas.alloc(w,h);paint(atlas.pen(r));return r;};
  /** 立体纯色块：顶面亮一档、底面暗一档（体素画的明暗） */
  const V=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,bone:number,c:string,mesh=m)=>{const s=solid(c),t=solid(tone(c,1.08)),b=solid(tone(c,.8));mesh.box(x0,y0,z0,x1,y1,z1,bone,{px:s,nx:s,pz:s,nz:s,py:t,ny:b},true);};

  // ——图案
  const pattern=(p:Pen,c:string,w:number,h:number)=>{const k=L.top.pattern;
    if(k==='stripe')for(let y=1;y<h;y+=3)p.rect(0,y,w,1,tone(c,.8));
    if(k==='plaid'){for(let x=1;x<w;x+=5)p.rect(x,0,2,h,tone(c,.86),.8);for(let y=2;y<h;y+=5)p.rect(0,y,w,2,tone(c,.86),.8);for(let x=1;x<w;x+=5)for(let y=2;y<h;y+=5)p.rect(x,y,2,2,tone(c,.72));for(let y=4;y<h;y+=5)p.rect(0,y,w,1,trim,.5);}
    if(k==='knit')for(let x=0;x<w;x+=2)p.rect(x,0,1,h,tone(c,.9));};
  // ——躯干（内层上衣）：第 0 行是领口，最后两行是下摆 / 腰带；花样按躯干中线 cx 摆
  const k=L.top.kind;
  const tucked=['shirt','polo','blouse'].includes(k)&&L.bottom.kind!=='skirt';
  const torsoFront=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);
    if(k==='tee'){p.rect(cx-3,0,6,1,skin).rect(cx-2,1,4,1,skin).px(cx-4,0,tone(top,.78)).px(cx+3,0,tone(top,.78)).rect(cx-3,2,6,1,tone(top,.86));p.rect(0,th-1,tw,1,tone(top,.84));}
    if(k==='shirt'||k==='polo'||k==='blouse'){const pl=k==='polo'?6:th;p.rect(cx-1,0,2,pl,tone(top,1.1));for(let y=k==='polo'?2:3;y<(k==='polo'?6:th-2);y+=4)p.px(cx,y,tone(top,.6));
      if(k==='shirt')p.rect(cx+2,3,4,4,tone(top,.93)).rect(cx+2,3,4,1,tone(top,.8));if(k==='blouse')p.rect(cx-2,0,1,th,tone(top,.9)).rect(cx+1,0,1,th,tone(top,.9));}
    if(k==='sweater'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.9));for(let y=2;y<th-3;y+=3)p.px(cx-1,y,tone(top,1.12)).px(cx,y+1,tone(top,1.12)).px(cx,y,tone(top,.8)).px(cx-1,y+1,tone(top,.8));for(let x=0;x<tw;x+=2)p.rect(x,th-3,1,3,tone(top,.78));p.rect(cx-4,0,8,1,trim);}
    if(k==='hoodie'){const py=th-8;p.rect(3,py,tw-6,5,tone(top,.9)).rect(3,py,tw-6,1,tone(top,.78)).rect(3,py,1,5,tone(top,.82)).rect(tw-4,py,1,5,tone(top,.82));p.rect(cx-3,0,1,6,trim).rect(cx+2,0,1,6,trim).px(cx-3,6,tone(trim,.8)).px(cx+2,6,tone(trim,.8));p.rect(0,th-2,tw,2,tone(top,.84));p.rect(cx-4,0,8,1,tone(top,.75));}
    if(k==='turtleneck'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.92));p.rect(0,th-2,tw,2,tone(top,.85));}
    if(tucked){p.rect(0,th-2,tw,2,bottomC);p.rect(0,th-2,tw,1,'#3a2a22');p.rect(cx-1,th-2,2,1,'#c9a65a');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,5,tw-6,th-5,o).rect(3,5,tw-6,1,tone(o,1.12)).rect(cx-3,7,6,4,tone(o,.88)).rect(cx-3,7,6,1,tone(o,.75));p.rect(2,0,2,6,o).rect(tw-4,0,2,6,o).px(3,5,'#d8c070').px(tw-4,5,'#d8c070');}
    if(L.outer?.kind==='apron'){const o=L.outer.color;p.rect(3,4,tw-6,th-4,o).rect(3,4,tw-6,1,tone(o,1.12)).rect(cx-4,8,8,4,tone(o,.9));p.rect(4,0,1,4,tone(o,.8)).rect(tw-5,0,1,4,tone(o,.8));}
  });
  const torsoBack=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);p.rect(0,3,tw,1,tone(top,.9));p.rect(cx-1,4,2,th-4,tone(top,.95));if(tucked){p.rect(0,th-2,tw,2,bottomC).rect(0,th-2,tw,1,'#3a2a22');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,6,tw-6,th-6,o).rect(cx-4,0,2,7,o).rect(cx+2,0,2,7,o);}
    if(L.outer?.kind==='apron'){p.rect(cx-4,th-6,8,1,tone(L.outer.color,.85));}});
  const torsoSide=panel(td,th,p=>{p.fill(tone(top,.97));pattern(p,top,td,th);p.rect(Math.floor(td/2),0,1,th,tone(top,.88));if(tucked)p.rect(0,th-2,td,2,bottomC).rect(0,th-2,td,1,'#3a2a22');});
  const torsoBottom=panel(tw,td,p=>p.fill(tone(bottomC,.8)));
  m.box(-tw/2,HY,-td/2,tw/2,NY,td/2,2,{pz:torsoFront,nz:torsoBack,px:torsoSide,nx:torsoSide,py:null,ny:torsoBottom});

  // ——外套壳（比躯干大 1 T，前襟开口处透明）；长外套型的下摆长到膝盖
  const sleeveOuter=outer&&!['vest','apron','overalls'].includes(outer.kind);
  const OW=tw+2,OH=th+1,OD=td+2,ocx=OW/2;
  if(outer&&!['apron','overalls'].includes(outer.kind)){
    const k2=outer.kind;
    const front=panel(OW,OH,p=>{p.fill(oc);
      // 开口：开衫 / 拉链衫整条开，西装 / 马甲 V 领，夹克 / 棒球服拉到胸口
      // 精修的长风衣领口开得更深（V 字到胸口下面，露出里面的高领）
      const open=(y:number)=>k2==='cardigan'||k2==='zip'?3:k2==='blazer'||k2==='vest'?Math.max(0,Math.round(5-y*.55)):k2==='coat'?(body.family==='refined'?(y<13?Math.max(1,Math.round(4.6-y*.3)):0):Math.max(0,Math.round(3-y*.45))):k2==='jacket'||k2==='varsity'?(y<6?Math.max(1,3-Math.floor(y/2)):1):0;
      for(let y=0;y<OH;y++){const o=open(y);if(o>0){p.clear(ocx-o,y,o*2,1);p.px(ocx-o-1,y,tone(oc,k2==='blazer'||k2==='coat'?.72:.85)).px(ocx+o,y,tone(oc,k2==='blazer'||k2==='coat'?.72:.85));}}
      if(k2==='cardigan'){for(let y=3;y<OH-2;y+=4)p.px(ocx+3,y,trim);for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,tone(oc,.82));p.rect(2,OH-8,4,4,tone(oc,.9)).rect(OW-6,OH-8,4,4,tone(oc,.9)).rect(2,OH-8,4,1,tone(oc,.8)).rect(OW-6,OH-8,4,1,tone(oc,.8));}
      if(k2==='blazer'){p.rect(2,OH-6,5,1,tone(oc,.75)).rect(OW-7,OH-6,5,1,tone(oc,.75));p.rect(OW-7,4,4,1,tone(oc,.75));if(outer.trim)p.rect(OW-6,3,2,1,outer.trim);p.px(ocx-1,OH-7,'#d8c070').px(ocx-1,OH-4,'#d8c070');for(let y=0;y<8;y++){p.px(ocx-6+Math.floor(y/2),y,tone(oc,.8));p.px(ocx+5-Math.floor(y/2),y,tone(oc,.8));}}
      if(k2==='vest'){p.px(ocx-1,OH-8,'#d8c070').px(ocx-1,OH-5,'#d8c070').px(ocx-1,OH-2,'#d8c070');p.rect(2,OH-7,4,1,tone(oc,.78)).rect(OW-6,OH-7,4,1,tone(oc,.78));}
      if(k2==='coat'){for(const y of [5,9]){p.px(ocx-3,y,tone(oc,.6)).px(ocx+2,y,tone(oc,.6));}p.rect(0,OH-5,OW,2,otrim).px(ocx-1,OH-5,'#d8c070').px(ocx,OH-4,'#d8c070');}
      if(k2==='jacket'){p.rect(ocx,3,1,OH-3,'#c9c9c9');p.rect(2,5,5,4,tone(oc,.9)).rect(2,5,5,1,tone(oc,.78));p.rect(OW-7,OH-7,5,4,tone(oc,.9)).rect(OW-7,OH-7,5,1,tone(oc,.78));p.rect(0,OH-2,OW,2,tone(oc,.8));}
      if(k2==='zip'){p.rect(ocx-4,OH-8,2,6,tone(oc,.85)).rect(ocx+2,OH-8,2,6,tone(oc,.85));p.rect(0,OH-2,OW,2,tone(oc,.82));}
      if(k2==='varsity'){for(let x=0;x<OW;x+=2){p.rect(x,OH-2,1,2,otrim);}p.rect(0,OH-3,OW,1,trim);p.rect(3,4,4,5,otrim).rect(4,5,2,3,oc);for(let y=4;y<OH-3;y+=3)p.px(ocx+2,y,'#e8e0d0');}
    });
    const back=panel(OW,OH,p=>{p.fill(oc);p.rect(0,3,OW,1,tone(oc,.88));p.rect(ocx,4,1,OH-4,tone(oc,.9));if(k2==='varsity'){for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,otrim);p.rect(4,4,OW-8,5,tone(oc,.88));}if(k2==='coat')p.rect(0,OH-5,OW,2,otrim);if(k2==='cardigan'||k2==='zip')for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,tone(oc,.82));});
    const sideP=panel(OD,OH,p=>{p.fill(tone(oc,.96));p.rect(OD/2,0,1,OH,tone(oc,.86));if(k2==='coat')p.rect(0,OH-5,OD,2,otrim);});
    const bot=solid(tone(oc,.55));
    m.box(-OW/2,HY-1,-OD/2,OW/2,NY,OD/2,2,{pz:front,nz:back,px:sideP,nx:sideP,py:null,ny:bot});
    // 翻领 / 衣领体素；宽肩型的外套肩头多一道垫肩
    if(k2==='blazer'||k2==='coat'){V(-6,NY-5,OD/2,-2.5,NY,OD/2+1,2,tone(oc,.85));V(2.5,NY-5,OD/2,6,NY,OD/2+1,2,tone(oc,.85));}
    // 精修体型的长风衣：一对长翻领（镶边色，一级级往里收成 V 字，到胸口下面），领口露出里面的高领
    if(k2==='coat'&&body.family==='refined')for(const s of [-1,1])for(const [a,b,y0,y1] of [[2.4,6.4,NY-4,NY+.3],[1.9,5.4,NY-8,NY-4],[1.3,4.2,NY-11.5,NY-8]] as const){
      const [x0,x1]=s>0?[a,b]:[-b,-a];V(x0,y0,OD/2,x1,y1,OD/2+.9,2,otrim);V(s>0?x1-.6:x0,y0,OD/2+.9,s>0?x1:x0+.6,y1,OD/2+1.1,2,tone(otrim,1.15));}
    if(k2==='varsity'||k2==='jacket'||k2==='zip')V(-7,NY-2,-7,7,NY+.4,7,2,k2==='varsity'?otrim:tone(oc,.9));
    if(body.type==='broad')for(const s of [-1,1])V(s>0?OW/2-4:-OW/2,NY-1,-OD/2,s>0?OW/2:-OW/2+4,NY+.6,OD/2,2,tone(oc,1.04));
    // 外套下摆：后半片挂在髋上，前两片挂在大腿上（坐下时搭在腿上）；长外套型的前片一直盖到膝盖
    // 长外套型和精修修长型的前片一直盖过膝盖
    const longHem=body.type==='longcoat'||body.type==='elegant';
    if(res.coatHem){const c=tone(oc,.97),len=longHem?body.leg.thigh+3:7,hx2=OW/2+.5;V(-hx2,HY-Math.min(len,9),-OD/2-.5,hx2,HY,0,1,c);V(-hx2,HY-len,0,-.6,HY,OD/2+.5,6,c);V(.6,HY-len,0,hx2,HY,OD/2+.5,7,c);
      if(longHem)for(const [s,bone] of [[-1,6],[1,7]] as const)V(s>0?.6:-hx2,HY-len-.01,OD/2-.5,s>0?hx2:-.6,HY-len+1.2,OD/2+.6,bone,otrim);}
  }
  // 背带裤 / 围裙：胸前一块立体的兜
  if(outer?.kind==='overalls'){V(-3,HY+8,td/2,3,HY+12,td/2+1,2,tone(outer.color,.92));}
  if(outer?.kind==='apron'){V(-(tw/2-2),HY+3,td/2,tw/2-2,NY-3,td/2+.7,2,outer.color);V(-(tw/2-2),HY-11,body.leg.d/2,-.6,HY,body.leg.d/2+.7,6,outer.color);V(.6,HY-11,body.leg.d/2,tw/2-2,HY,body.leg.d/2+.7,7,outer.color);}

  // ——衣领、帽兜堆、高领；厚毛衣型的毛衣下摆和领口多一圈粗罗纹
  if((k==='shirt'||k==='polo'||k==='blouse')&&!res.hood){const c=k==='polo'?trim:k==='blouse'?'#fbf6ee':mix(top,'#ffffff',.55);V(-6,NY-2.5,td/2-.5,-.6,NY,td/2+1.6,2,c);V(.6,NY-2.5,td/2-.5,6,NY,td/2+1.6,2,c);}
  if(k==='turtleneck')V(-7,NY-3,-(td/2+1),7,NY,td/2+1.5,2,tone(top,.92));
  if(k==='hoodie'&&!res.longBack&&!res.hood&&!res.has('scarf')&&!res.has('backpack')){V(-8,NY-6,-(td/2+4),8,NY,-td/2,2,tone(top,.9));V(-6,NY-5,-(td/2+5),6,NY-1,-(td/2+4),2,tone(top,.8));}
  if(body.type==='bulky'&&k==='sweater'&&!outer){V(-tw/2-.6,HY-.5,-td/2-.6,tw/2+.6,HY+2.5,td/2+.6,2,tone(top,.82));V(-6,NY-2,-td/2+1,6,NY+.5,td/2+.8,2,tone(top,.86));}

  // ——胳膊：长袖到倒数第 3 行，手 3 行
  const aw=body.arm.w,ah=body.arm.h,ap=Math.round(aw),sleeveC=sleeveOuter?oc:top,sleeve=sleeveOuter?'long':L.top.sleeve??(k==='tee'||k==='polo'?'short':'long');
  const cuff=sleeveOuter&&['blazer','coat'].includes(outer!.kind)?(['shirt','blouse'].includes(k)?mix(top,'#ffffff',.5):top):null;
  const armPanel=(face:'front'|'side'|'back')=>panel(ap,ah,p=>{p.fill(skin);const sc=face==='side'?tone(sleeveC,.96):sleeveC;
    const len=sleeve==='long'?ah-3:sleeve==='rolled'?9:6;p.rect(0,0,ap,len,sc);
    if(sleeve==='long'){p.rect(0,len-2,ap,2,sleeveOuter&&outer!.kind==='varsity'?otrim:tone(sc,.84));if(k==='sweater'||outer?.kind==='cardigan')for(let x=0;x<ap;x+=2)p.rect(x,len-2,1,2,tone(sc,.72));if(cuff)p.rect(0,len-1,ap,1,cuff);}
    else if(sleeve==='rolled'){p.rect(0,len-2,ap,2,tone(sc,1.12));}else p.rect(0,len-1,ap,1,tone(sc,.84));
    if(k==='sweater'&&!sleeveOuter)for(let x=1;x<ap;x+=2)p.rect(x,0,1,len-2,tone(sc,.9));
    if(sleeveOuter&&outer!.kind==='varsity')p.rect(0,0,ap,len-2,otrim);
    if(face==='side'&&sleeve!=='long')p.rect(0,len,1,ah-len,tone(skin,.94));
    p.rect(0,ah-1,ap,1,tone(skin,.9));if(face==='front')p.px(Math.floor(ap/2),ah-2,tone(skin,.9));});
  const armF=armPanel('front'),armS=armPanel('side'),armB=armPanel('back'),shoulder=solid(sleeveC),hand=solid(tone(skin,.95));
  const ax=body.arm.x;
  for(const [sx,bone] of [[-1,4],[1,5]] as const){const x0=sx*ax-aw/2,x1=sx*ax+aw/2;m.box(x0,NY-ah,-aw/2,x1,NY,aw/2,bone,{pz:armF,nz:armB,px:armS,nx:armS,py:shoulder,ny:hand});
    if(k==='blouse'&&!sleeveOuter)V(x0-.6,NY-5,-aw/2-.6,x1+.6,NY+.3,aw/2+.6,bone,tone(top,1.04));}
  if(res.has('watch'))V(ax-aw/2-.4,NY-ah+3,-aw/2-.4,ax+aw/2+.4,NY-ah+4.5,aw/2+.4,5,'#3a3640');

  // ——大腿（多出 4 T 伸到膝盖下面，坐下时是膝盖前面那块）
  const lw=body.leg.w,lp=Math.round(lw),ld=body.leg.d,thighH=body.leg.thigh+4,b=L.bottom;
  const legSkin=b.kind==='shorts'||b.kind==='skirt';
  const thighPanel=(face:'front'|'side'|'back')=>panel(lp,Math.round(thighH),p=>{const c=face==='side'?tone(bottomC,.95):bottomC;p.fill(c);
    if(b.kind==='jeans'){p.rect(face==='side'?3:0,0,1,thighH,tone(c,1.15));if(face==='front')p.rect(1,1,3,1,tone(c,1.12));}
    if(b.kind==='cargo'&&face==='front')p.rect(0,5,lp,1,tone(c,.85));
    if(b.kind==='shorts'){p.rect(0,7,lp,thighH-7,skin);p.rect(0,6,lp,1,tone(c,.82));}
    if(b.kind==='skirt'){p.fill(b.socks??skin);}
    if(face==='back'&&!legSkin)p.rect(0,0,lp,1,tone(c,.85));});
  const thF=thighPanel('front'),thS=thighPanel('side'),thB=thighPanel('back'),knee=solid(legSkin?b.socks??skin:bottomC);
  for(const [sx,bone] of [[-1,6],[1,7]] as const){const lx=sx*body.leg.x;m.box(lx-lw/2,HY-thighH,-ld/2,lx+lw/2,HY,ld/2,bone,{pz:thF,nz:thB,px:thS,nx:thS,py:null,ny:knee});
    if(b.kind==='cargo')V(lx+sx*lw/2-(sx>0?0:1),HY-9,-2.5,lx+sx*lw/2+(sx>0?1:0),HY-4,2.5,bone,tone(bottomC,.9));}
  // 裙子：后半片在髋上，前两片在大腿上
  if(b.kind==='skirt'){const SW=Math.round(tw+2),sk=panel(SW,8,p=>{p.fill(bottomC);for(let x=1;x<SW;x+=3)p.rect(x,0,1,8,tone(bottomC,.82));p.rect(0,7,SW,1,tone(bottomC,.75));p.rect(0,0,SW,1,tone(bottomC,1.1));});
    const skS=panel(6,8,p=>{p.fill(tone(bottomC,.95));for(let x=1;x<6;x+=3)p.rect(x,0,1,8,tone(bottomC,.8));p.rect(0,7,6,1,tone(bottomC,.75));});const und=solid(tone(bottomC,.6)),X=SW/2;
    m.box(-X,HY-7,-td/2-1,X,HY+1,0,1,{nz:sk,px:skS,nx:skS,ny:und,pz:null,py:null});
    m.box(-X,HY-7,0,0,HY+1,ld/2+2,6,{pz:sk,nx:skS,ny:und,px:null,py:solid(bottomC)});m.box(0,HY-7,0,X,HY+1,ld/2+2,7,{pz:sk,px:skS,ny:und,nx:null,py:solid(bottomC)});}

  // ——头（正面是脸，会按表情重画）。头型：脸板两侧切 cut、下巴两侧收 jaw
  const plan=planHair(L.hair.style,{hat:res.hat,hood:res.hood,glasses:!!res.glasses,ahoge:res.ahoge,tuck:L.hair.tuck});
  const hc=hairColors(hairC,L.hair.tie??'#d94f5c',tone,mix,L.hair.streak);
  // 精修脸：脸部那一块贴图按两倍像素密度画（其他面仍是 1 像素 = 1 T）
  const anime=L.face.style==='anime',fs=anime?ANIME_SCALE:1;
  const FW=2*fx,faceRect=atlas.alloc(FW*fs,FACE_H*fs);
  // 头的侧面：靠脸的一半亮、靠后脑的一半暗一档，下面一条从下巴斜着升到耳下的下颌线，侧面不是一块平板
  const sidePanel=(frontAtLeft:boolean)=>panel(HEAD.d-cut,hh,p=>{const D=HEAD.d-cut;p.fill(skin);p.rect(0,0,D,12,hc[3]);
    for(let u=0;u<D;u++){const back=frontAtLeft?u/(D-1):1-u/(D-1);if(back>.55)p.rect(u,12,1,hh-12,tone(skin,.95));const jw=Math.round(hh-3-back*7);p.rect(u,jw,1,hh-jw,tone(skin,.9));p.px(u,jw,tone(skin,.86));}});
  const headSideP=sidePanel(true),headSideN=sidePanel(false);
  const headBack=panel(HEAD.w,hh,p=>{p.fill(hc[3]);p.rect(0,hh-8,HEAD.w,8,tone(skin,.92));p.rect(0,hh-8,HEAD.w,1,tone(hc[3],.9));});
  // 头 = 后面一大块（两侧面到 hz-cut 为止）+ 前面一块脸板（宽 ±fx）；圆脸 / 长脸的下巴两侧再收 jaw（脸板下面 5 T 窄一点）
  m.box(-hx,NY,-hz,hx,NY+hh,hz-cut,3,{pz:solid(tone(skin,.92)),nz:headBack,px:headSideP,nx:headSideN,py:solid(hc[3]),ny:solid(tone(skin,.84))});
  const skinSide=solid(tone(skin,.95)),chin=solid(tone(skin,.84));
  if(jaw>0){const jh=5,lower={x:faceRect.x+jaw*fs,y:faceRect.y+(FACE_H-jh)*fs,w:(FW-2*jaw)*fs,h:jh*fs},upper={x:faceRect.x,y:faceRect.y,w:FW*fs,h:(FACE_H-jh)*fs};
    m.box(-fx,NY+jh,hz-cut,fx,NY+hh,hz,3,{pz:upper,nz:null,px:skinSide,nx:skinSide,py:solid(hc[3]),ny:chin});
    m.box(-fx+jaw,NY,hz-cut,fx-jaw,NY+jh,hz,3,{pz:lower,nz:null,px:skinSide,nx:skinSide,py:null,ny:chin});}
  else m.box(-fx,NY,hz-cut,fx,NY+hh,hz,3,{pz:faceRect,nz:null,px:skinSide,nx:skinSide,py:solid(hc[3]),ny:chin});
  // 耳朵：小一点（4×7），外侧只有一块很淡的耳窝和亮一档的上沿
  const ear=panel(4,7,p=>{p.fill(tone(skin,.95));p.rect(1,2,2,3,tone(skin,.88)).rect(0,0,4,1,tone(skin,1.02));});
  for(const sx of [-1,1]){const x0=sx>0?hx:-hx-1.5,x1=sx>0?hx+1.5:-hx;m.box(x0,NY+10,-2,x1,NY+17,2,3,{px:ear,nx:ear,pz:solid(skin),nz:solid(tone(skin,.86)),py:solid(skin),ny:solid(tone(skin,.82))});}

  // ——头发：纯色的小件直接画；大发团按平面分组，一个平面一张发丝贴图
  type Plane={f:FaceKey;at:number;items:Array<{b:HairBox;u0:number;u1:number;v0:number;v1:number}>};
  const span=(f:FaceKey,hb:HairBox):[number,number,number,number]=>f==='pz'?[hb.x0,hb.x1,-hb.y1,-hb.y0]:f==='nz'?[-hb.x1,-hb.x0,-hb.y1,-hb.y0]:f==='px'?[-hb.z1,-hb.z0,-hb.y1,-hb.y0]:f==='nx'?[hb.z0,hb.z1,-hb.y1,-hb.y0]:f==='py'?[hb.x0,hb.x1,hb.z0,hb.z1]:[hb.x0,hb.x1,-hb.z1,-hb.z0];
  const at=(f:FaceKey,hb:HairBox)=>f==='px'?hb.x1:f==='nx'?hb.x0:f==='py'?hb.y1:f==='ny'?hb.y0:f==='pz'?hb.z1:hb.z0;
  const point=(f:FaceKey,a:number,u:number,v:number):[number,number,number]=>f==='pz'?[u,-v,a]:f==='nz'?[-u,-v,a]:f==='px'?[a,-v,-u]:f==='nx'?[a,-v,u]:f==='py'?[u,a,v]:[u,a,-v];
  const planes=new Map<string,Plane>(),faceOf=new Map<HairBox,Faces>(),streak=!!L.hair.streak;
  for(const hb of plan.boxes){
    if(hb.look!=='paint'){V(hb.x0,NY+hb.y0,hb.z0,hb.x1,NY+hb.y1,hb.z1,3,hc[hb.look]);continue;}
    const fc:Faces={};faceOf.set(hb,fc);
    for(const f of FACES){if(hb.hide?.includes(f))continue;const [u0,u1,v0,v1]=span(f,hb);
      // 窄面（发团的侧边、厚度方向）不值得单独画一张：给一个整色（底面最暗，顶面本色，其余按高低取本色或暗一档）
      if(u1-u0<2.9||v1-v0<2.9){(fc as Record<string,Rect>)[f]=solid(hc[f==='ny'?3:f==='py'?0:(hb.y0+hb.y1)/2<12?1:0]);continue;}
      const key=f+'@'+at(f,hb).toFixed(2);let pl=planes.get(key);if(!pl)planes.set(key,pl={f,at:at(f,hb),items:[]});pl.items.push({b:hb,u0,u1,v0,v1});}
  }
  for(const pl of planes.values()){
    const U0=Math.floor(Math.min(...pl.items.map(i=>i.u0))+1e-6),U1=Math.ceil(Math.max(...pl.items.map(i=>i.u1))-1e-6),V0=Math.floor(Math.min(...pl.items.map(i=>i.v0))+1e-6),V1=Math.ceil(Math.max(...pl.items.map(i=>i.v1))-1e-6);
    const r=atlas.alloc(U1-U0,V1-V0),p=atlas.pen(r);
    for(let j=0;j<V1-V0;j++)for(let i=0;i<U1-U0;i++){const u=U0+i+.5,v=V0+j+.5,it=pl.items.find(t=>u>=t.u0-1e-6&&u<=t.u1+1e-6&&v>=t.v0-1e-6&&v<=t.v1+1e-6)??pl.items.find(t=>u>=t.u0-.5&&u<=t.u1+.5&&v>=t.v0-.5&&v<=t.v1+.5);if(!it)continue;
      const [X,Y,Z]=point(pl.f,pl.at,u,v);p.px(i,j,hc[hairTexel(plan,pl.f,X,Y,Z,it.b,streak)]);}
    for(const it of pl.items)(faceOf.get(it.b) as Record<string,Rect>)[pl.f]={x:r.x+it.u0-U0,y:r.y+it.v0-V0,w:it.u1-it.u0,h:it.v1-it.v0};
  }
  for(const [hb,fc] of faceOf){for(const f of FACES)if(!(f in fc))(fc as Record<string,Rect|null>)[f]=null;m.box(hb.x0,NY+hb.y0,hb.z0,hb.x1,NY+hb.y1,hb.z1,3,fc);}

  // ——配件（头部局部坐标，y 从颈部算）
  const H=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,c:string,bone=3)=>V(x0,NY+y0,z0,x1,NY+y1,z1,bone,c);
  const sideOut=hx+plan.outer.side,backOut=hz+plan.outer.back,topOut=hh+plan.outer.top,frontOut=hz+plan.outer.front;
  const accColor=(kind:string,def:string)=>res.acc.find(a=>a.kind===kind)?.color??def;
  if(res.glasses){const c=accColor(res.glasses==='round'?'roundGlasses':'glasses','#2d2a33'),z0=hz,z1=hz+1.2,round=res.glasses==='round';
    // 镜框套住眼睛（眼睛在头部 y 9–18，x -12…-5 / 5…12）
    for(const [a,bb] of [[-13,-4],[4,13]] as const){
      H(a+(round?1:0),18,z0,bb-(round?1:0),19,z1,c);H(a+(round?1:0),8,z0,bb-(round?1:0),9,z1,c);H(a,round?9.5:8,z0,a+1,round?17.5:19,z1,c);H(bb-1,round?9.5:8,z0,bb,round?17.5:19,z1,c);
      if(round){H(a+.5,9,z0,a+1.5,10,z1,c);H(bb-1.5,9,z0,bb-.5,10,z1,c);H(a+.5,17,z0,a+1.5,18,z1,c);H(bb-1.5,17,z0,bb-.5,18,z1,c);}
      const sx=a<0?-1:1,ox=sx<0?a:bb;H(sx<0?-hx-.4:ox,15,z0-.6,sx<0?ox:hx+.4,16,z0+.4,c);H(sx<0?-hx-.8:hx,15,2,sx<0?-hx:hx+.8,16,z0,c);}
    H(-4,14.5,z0,4,15.5,z1,c);}
  // 单片镜：右眼一圈细框 + 一条垂到领口的链子
  if(res.has('monocle')){const c=accColor('monocle','#c9a14a'),z0=hz,z1=hz+1.2;H(-13,18,z0,-4,19,z1,c);H(-13,8,z0,-4,9,z1,c);H(-13,9,z0,-12,18,z1,c);H(-5,9,z0,-4,18,z1,c);
    H(-5,9.5,hz+.6,-4.6,10.2,hz+1.6,'#f4f0e0');for(let i=0;i<6;i++)H(-12.5+i*.4,7-i*1.6,hz+.4,-11.7+i*.4,8.4-i*1.6,hz+1.1,tone(c,.85));}
  // 帽子的帽顶分两级、四角切掉：从背后、侧面看是圆顶，不是一只盒子
  const crown=(y0:number,y1:number,X:number,Zb:number,Zf:number,c:string)=>{const mid=Math.max(y0+(y1-y0)*.55,topOut+.6);H(-X+2,y0,-Zb,X-2,mid,Zf,c);for(const s of [-1,1])H(s>0?X-2:-X,y0,-Zb+2,s>0?X:-X+2,mid,Zf-1,c);H(-X+2.5,mid,-Zb+2.5,X-2.5,y1,Zf-1.2,c);for(const s of [-1,1])H(s>0?X-2.5:-X+1,mid,-Zb+4,s>0?X-1:-X+2.5,y1-1,Zf-2.5,tone(c,.97));};
  if(res.hat==='beanie'){const c=accColor('beanie','#c0503a'),hx2=sideOut+.8,hb=backOut+.8;crown(24,topOut+5,hx2,hb,hz+3.4,c);H(-hx2-.8,23,-hb-.8,hx2+.8,28,hz+4.2,tone(c,.82));
    for(let x=-hx2+2;x<hx2-1;x+=4)H(x,23.2,hz+4.2,x+1,27.8,hz+4.5,tone(c,.7));H(-4.5,topOut+5,-4.5,4.5,topOut+11,4.5,mix(c,'#ffffff',.6));}
  if(res.hat==='cap'){const c=accColor('cap','#3f6a9a'),hx2=sideOut+.7,hb=backOut+.7;crown(26,topOut+5,hx2,hb,hz+3.4,c);H(-14,25,hz+3.4,14,27,hz+12,tone(c,.85));H(-1.5,topOut+5,-1.5,1.5,topOut+6.5,1.5,tone(c,1.2));H(-5,26,-hb-.3,5,30,-hb,tone(c,.7));
    H(-hx2-.2,26,-hb-.2,hx2+.2,27.5,-hb+8,tone(c,.75));}
  if(res.hat==='beret'){const c=accColor('beret','#7a2e3a'),hx2=sideOut+.6,hb=backOut+.6;H(-hx2-4,topOut-1,-hb-1.5,hx2+1,topOut+4,hz+2,c);H(-hx2,topOut-3,-hb,hx2,topOut-1,hz+1.4,tone(c,.82));H(-1,topOut+4,-1,1,topOut+6,1,tone(c,.7));}
  if(res.hood){const c=accColor('hood',oc),r=tone(c,.85),X=hx+4,Zb=-hz-4,Zf=hz+1.5;
    H(-X,hh+.5,Zb,X,hh+5,Zf,c);for(const s of [-1,1])H(s>0?hx:-X,-2,Zb,s>0?X:-hx,hh+.5,Zf,c);H(-hx,-2,Zb,hx,hh+.5,-hz,c);
    H(-X,hh-1.5,Zf,X,hh+5,Zf+2,r);for(const s of [-1,1])H(s>0?hx-1.5:-X,-2,Zf,s>0?X:-hx+1.5,hh-1.5,Zf+2,r);
    V(-6,NY-9,td/2,-5,NY-1,td/2+1.2,2,'#e8e2d6');V(5,NY-9,td/2,6,NY-1,td/2+1.2,2,'#e8e2d6');}
  // 护目镜：推在额头 / 帽子上，一圈松紧带 + 两只圆镜片（戴帽子时跟着帽檐往上挪）
  if(res.has('goggles')){const c=accColor('goggles','#5a4a3a'),y0=res.hat?27.5:25.5,X=(res.hat?sideOut+1.2:sideOut+.4),Zb=(res.hat?backOut+1.2:backOut+.4),Zf=Math.max(frontOut,hz+(res.hat?3.6:2.6))+.3;
    H(-X,y0,-Zb,X,y0+1.6,-Zb+1,tone(c,.8));for(const s of [-1,1])H(s>0?X-1:-X,y0,-Zb,s>0?X:-X+1,y0+1.6,Zf-1,tone(c,.8));H(-X,y0,Zf-1.2,X,y0+1.6,Zf,tone(c,.8));
    for(const s of [-1,1]){const x0=s>0?2:-10,x1=s>0?10:-2;H(x0,y0-1.5,Zf,x1,y0+3.5,Zf+1.4,c);H(x0+1,y0-.5,Zf+1.4,x1-1,y0+2.5,Zf+1.8,'#8fc3d6');H(x0+1.5,y0+1.5,Zf+1.8,x0+3,y0+2.3,Zf+1.9,'#e8f6fa');}}
  // 发箍、发间小花
  if(res.has('headband')){const c=accColor('headband','#e05a6a');H(-sideOut-.6,topOut-2.4,-1,sideOut+.6,topOut+.6,1.5,c);for(const s of [-1,1])H(s>0?sideOut:-sideOut-.6,18,-1,s>0?sideOut+.6:-sideOut,topOut-2.4,1.5,c);}
  for(const a of res.acc)if(a.kind==='flower'){const c=a.color??'#f2a7c0',sx=a.side??1,x=sx>0?sideOut-1.2:-sideOut-1.8,y=26;H(x,y-1.5,7,x+3,y+1.5,11,c);H(x-.6,y-.6,8,x+3.6,y+.6,10,c);H(x+.6,y-2.1,8,x+2.4,y+2.1,10,c);H(x+.8,y-.6,9.6,x+2.2,y+.6,11.4,'#f2c14e');}
  const phoneC=accColor(res.phones==='set'?'headset':res.phones==='neck'?'neckphones':'headphones','#2e3440');
  if(res.phones==='head'||res.phones==='set'){const so=res.hat?sideOut+1.4:sideOut,to=res.hat?topOut+6:topOut+1;
    H(-so-2,to,-2,so+2,to+2,2,phoneC);
    for(const sx of [-1,1]){
      if(res.phones==='set'&&sx>0){H(so,16,-1.5,so+1.5,to,1.5,phoneC);H(so,10,-3,so+2,16,3,phoneC);continue;}
      const x0=sx>0?so:-so-2,x1=sx>0?so+2:-so;H(x0,18,-2,x1,to,2,phoneC);const c0=sx>0?so:-so-4,c1=sx>0?so+4:-so;H(c0,7,-5,c1,19,5,phoneC);H(sx>0?c1:c0-.8,8,-4,sx>0?c1+.8:c0,18,4,mix(phoneC,'#ffffff',.25));}
    if(res.phones==='set'){H(-so-3,7,4,-so-1,9,15,'#3a3a40');H(-so-1,6,15,-7,8,17,'#3a3a40');H(-8,5,15,-5,9,18,'#1e1e22');}}
  if(res.phones==='neck'){for(const sx of [-1,1]){const x0=sx>0?6:-12,x1=sx>0?12:-6;V(x0,NY-7,3,x1,NY-.5,td/2+3.5,2,phoneC);V(x0+1,NY-6,td/2+3.5,x1-1,NY-1.5,td/2+4.3,2,mix(phoneC,'#ffffff',.25));}V(-11,NY-2,-(td/2+2),11,NY,-(td/2-1),2,phoneC);}
  if(res.has('scarf')){const c=accColor('scarf','#c9573f'),c2=tone(c,.78),X=Math.min(tw/2+1.5,12),Z0=-(td/2+1.5),Z1=td/2+2.5;V(-X,NY-5,Z0,X,NY-3,Z1,2,c);V(-X,NY-3,Z0,X,NY-1.5,Z1,2,c2);V(-X,NY-1.5,Z0,X,NY,Z1,2,c);
    V(1.5,NY-12,Z1-1,5.5,NY-5,Z1+1,2,c);V(1.5,NY-14,Z1-1,5.5,NY-12,Z1+1,2,c2);V(1.5,NY-16,Z1-1,5.5,NY-14,Z1+1,2,c);for(let x=1.5;x<5.5;x+=1.4)V(x,NY-17.4,Z1-.5,x+.8,NY-16,Z1+.5,2,c2);}
  // 披肩：搭在肩上一圈，前襟两片往下垂、中间开口（不盖到胳膊外侧，手势时不穿插）
  if(res.has('shawl')){const c=accColor('shawl','#b8a07a'),X=tw/2+1.2,Z=td/2+(outerBack?1.6:1);V(-X,NY-5,-Z,X,NY+.6,-Z+1.2,2,c);for(const s of [-1,1]){V(s>0?X-1.2:-X,NY-5,-Z,s>0?X:-X+1.2,NY+.6,Z,2,c);V(s>0?2:-X,NY-9,Z-1.2,s>0?X:-2,NY+.6,Z,2,tone(c,s>0?.94:1));}
    for(let x=-X+.5;x<X-.5;x+=2)V(x,NY-10.2,Z-1,x+1,NY-9,Z-.2,2,tone(c,.82));}
  const tieZ=outerBack?OD/2-.5:td/2;
  if(res.has('tie')){const c=accColor('tie','#7a2e3a');V(-1.2,NY-3,tieZ,1.2,NY-.5,tieZ+1.4,2,tone(c,.85));V(-1.5,NY-th+5,tieZ,1.5,NY-3,tieZ+.9,2,c);V(-1,NY-th+4,tieZ,1,NY-th+5,tieZ+.9,2,c);}
  if(res.has('bowtie')){const c=accColor('bowtie','#2e2a3a');V(-3.6,NY-3,tieZ,-.6,NY-.4,tieZ+1.3,2,c);V(.6,NY-3,tieZ,3.6,NY-.4,tieZ+1.3,2,c);V(-.7,NY-2.7,tieZ,.7,NY-.7,tieZ+1.7,2,tone(c,.8));}
  // 腰带：外套（没有外套就是上衣）腰上一圈，正中一块铜扣，右边垂下一截带头
  if(res.has('belt')){const c=accColor('belt','#4a3426'),X=(outerBack?OW:tw)/2+.35,Z=(outerBack?OD:td)/2+.35,y0=HY+5;V(-X,y0,-Z,X,y0+1.8,Z,2,c);V(-1.6,y0-.2,Z-.1,1.6,y0+2,Z+.5,2,'#c9a35a');V(-1,y0+.3,Z+.4,1,y0+1.5,Z+.7,2,c);V(2,y0-6,Z-.2,3.4,y0,Z+.4,2,c);}
  if(res.has('ribbon')){const c=accColor('ribbon','#c94a5a');V(-5,NY-3.5,tieZ,-1,NY-.5,tieZ+1.6,2,c);V(1,NY-3.5,tieZ,5,NY-.5,tieZ+1.6,2,c);V(-1,NY-3.2,tieZ,1,NY-.8,tieZ+2,2,tone(c,.8));V(-2.6,NY-8,tieZ,-.6,NY-3.5,tieZ+1,2,c);V(.6,NY-8,tieZ,2.6,NY-3.5,tieZ+1,2,c);}
  // ——小标志：胸针（扁的一块，正面是 5×5 的图案）、挂件（小立体）、项链坠
  const frontZ=outerBack?OD/2:outer&&['apron','overalls'].includes(outer.kind)?td/2+.7:td/2;
  const emblemPanel=(e:Emblem,bg:string)=>{const d=EMBLEM[e];return panel(5,5,p=>{p.fill(bg);if(!d)return;d.px.forEach((row,y)=>[...row].forEach((ch,x)=>{if(ch==='1')p.px(x,y,d.main);else if(ch==='2')p.px(x,y,d.sub??tone(d.main,.7));}));});};
  const emblemBox=(e:Emblem,bg:string,x0:number,y0:number,z0:number,s:number,dz:number,bone:number)=>{const f=emblemPanel(e,bg),edge=solid(tone(bg,.8));m.box(x0,y0,z0,x0+s,y0+s,z0+dz,bone,{pz:f,nz:edge,px:edge,nx:edge,py:solid(tone(bg,1.06)),ny:edge});};
  for(const a of res.acc){const sx=a.side??1;
    if(a.kind==='clip'){const c=a.color??'#f0c44c',x=sx>0?sideOut-1:-sideOut-.6;H(x,24,8,x+1.6,26,13,c);H(x,26,9,x+1.6,27,10,tone(c,.8));}
    if(a.kind==='bow'){const c=a.color??'#d9535f',bx=sx*11,t=topOut-2;H(bx-6,t,-2,bx-1,t+4,2,c);H(bx+1,t,-2,bx+6,t+4,2,c);H(bx-1,t+.5,-2.4,bx+1,t+3.5,2.4,tone(c,.8));}
    if(a.kind==='pen'){const c=a.color??'#2b3550',x=sx>0?sideOut-.4:-sideOut-.8;H(x,16,-6,x+1.2,17.2,8,c);H(x,16,8,x+1.2,17.2,10,'#d8c070');}
    if(a.kind==='earring'){const x=sx>0?hx+.2:-hx-1.2;H(x,7,0,x+1,9,1,a.color??'#e0c060');}
    // 胡子：下巴上一块、往下收窄的一撮、嘴上一道小胡子；两颊只有贴着脸板边缘的细鬓
    if(a.kind==='beard'){const c=a.color??tone(hairC,.95);H(-10,-3,hz-4,10,5.4,hz+2.2,c);H(-7,-6,hz-3.5,7,-3,hz+1.6,tone(c,.92));H(-4,-8,hz-3,4,-6,hz+1,tone(c,.86));H(-6,7.4,hz,6,8.6,hz+1.4,c);
      for(const s of [-1,1])H(s>0?fx-1.5:-fx,2,hz-1,s>0?fx:-fx+1.5,11,hz+.6,tone(c,.94));}
    // 胸针：左胸（胸牌在右胸）
    if(a.kind==='pin'&&a.shape){const s=5;emblemBox(a.shape,a.color??'#d8c070',2.5,NY-10,frontZ,s,.7,2);}
    // 项链：两条斜着的细链到胸口，坠子是一个小标志
    if(a.kind==='necklace'){const c=a.color??'#d8c070',z=frontZ+.1;for(let i=0;i<4;i++){V(-5.5+i*1.1,NY-1-i*1.6,z,-4.5+i*1.1,NY-i*1.6,z+.5,2,c);V(4.5-i*1.1,NY-1-i*1.6,z,5.5-i*1.1,NY-i*1.6,z+.5,2,c);}
      if(a.shape)emblemBox(a.shape,tone(c,1.05),-2,NY-11.5,z,4,.8,2);else V(-1.2,NY-9,z,1.2,NY-6.6,z+.9,2,c);}
    // 挂件：腰带一侧挂一个小立体（玩偶熊、磁带机、手柄、小炮仗……），正面画标志
    if(a.kind==='charm'&&a.shape){const c=a.color??'#c89a6a',x=sx>0?tw/2-4.5:-tw/2+.5,y=HY-4,z=frontZ+.2;V(x+1.6,HY-.5,z,x+2.4,HY+1.5,z+.6,1,'#8a8478');
      if(a.shape==='bear'){V(x,y,z,x+4,y+3.5,z+2.4,1,c);V(x+.4,y+3.5,z+.2,x+3.6,y+6.5,z+2.2,1,c);V(x,y+6,z+.8,x+1.2,y+7.2,z+1.8,1,tone(c,.85));V(x+2.8,y+6,z+.8,x+4,y+7.2,z+1.8,1,tone(c,.85));V(x+1.2,y+4.4,z+2.2,x+2.8,y+5.6,z+2.6,1,'#2b2136');}
      else emblemBox(a.shape,c,x,y,z,4,2.2,1);}
    // 工具：扳手插在围裙兜里、放大镜挂在腰侧、画笔夹在耳后、卷轴别在腰带上
    if(a.kind==='tool'&&a.shape){const c=a.color??'#9aa3ad';
      if(a.shape==='wrench'){const x=-tw/2+3,z=frontZ+.4;V(x,HY+3,z,x+1.4,HY+11,z+1,2,c);V(x-1,HY+10.5,z,x+2.4,HY+13,z+1,2,c);V(x-.2,HY+12,z,x+1.6,HY+13.2,z+1.2,2,tone(c,.7));}
      if(a.shape==='magnifier'){const x=sx>0?tw/2-3:-tw/2-1,z=frontZ+.3;V(x+1.3,HY-3,z,x+2.3,HY+1,z+1,1,'#6a4630');V(x,HY-8,z,x+3.6,HY-7,z+1,1,c);V(x,HY-4,z,x+3.6,HY-3,z+1,1,c);V(x,HY-7,z,x+1,HY-4,z+1,1,c);V(x+2.6,HY-7,z,x+3.6,HY-4,z+1,1,c);V(x+1,HY-7,z+.4,x+2.6,HY-4,z+.7,1,'#bfe0ec');}
      if(a.shape==='brush'){const x=sx>0?sideOut-.4:-sideOut-.8;H(x,16,-7,x+1.2,17.2,7,'#c89a5a');H(x,15.8,7,x+1.2,17.4,8.6,'#9aa3ad');H(x-.2,15.6,8.6,x+1.4,17.6,11,c);}
      if(a.shape==='scroll'){const x=sx>0?tw/2-6:-tw/2+1,z=frontZ+.2;V(x,HY-1,z,x+5,HY+1.6,z+1.6,1,'#efe4c8');V(x-.6,HY-1.3,z-.2,x,HY+1.9,z+1.8,1,'#6a4630');V(x+5,HY-1.3,z-.2,x+5.6,HY+1.9,z+1.8,1,'#6a4630');V(x+2.2,HY-1.2,z,x+2.8,HY+1.8,z+1.8,1,'#b8452f');}
      if(a.shape==='extinguisher'){const x=sx>0?tw/2-4:-tw/2+.5,z=frontZ+.2;V(x,HY-6,z,x+2.6,HY-1,z+2.4,1,'#d8463a');V(x+.6,HY-1,z+.6,x+2,HY+.6,z+1.8,1,'#3a3a3a');V(x+2,HY,z+1,x+3.4,HY+.6,z+1.4,1,'#3a3a3a');}}
  }
  // ——包：斜挎包（左肩到右胯一条斜带 + 右胯一只包）、腰包（腰带 + 前面一个小包）
  if(res.has('shoulderBag')){const c=accColor('shoulderBag','#8a6a4a'),strap=tone(c,.8),z=frontZ+.15,steps=8;
    for(let i=0;i<steps;i++){const t=i/(steps-1),x=tw/2-2.5-t*(tw-3),y=NY-1-t*(th-4);V(x-1,y-1.6,z,x+1,y+.2,z+.6,2,strap);V(x-1,y-1.6,-td/2-(outerBack?1.6:.6),x+1,y+.2,-td/2-(outerBack?1:0),2,strap);}
    const bx=-tw/2-3.2;V(bx,HY-3,-3,bx+3.4,HY+4,3.4,1,c);V(bx-.3,HY+2.6,-3.3,bx+3.7,HY+4.4,3.7,1,tone(c,.86));V(bx-.4,HY+.2,-.6,bx,HY+1.6,.6,1,'#d8c070');}
  if(res.has('waistBag')){const c=accColor('waistBag','#5a6a4a'),z=frontZ;V(-tw/2-.4,HY-.4,-td/2-.4,tw/2+.4,HY+1.2,td/2+.4,1,tone(c,.75));V(1,HY-2,z,8,HY+3,z+3,1,c);V(1.2,HY+1.8,z+3,7.8,HY+2.6,z+3.4,1,tone(c,.8));V(4,HY-.5,z+3,5,HY+1.4,z+3.3,1,'#d8c070');}
  // 旧 Q 版保留队别胸牌（正方蓝、反方红、其他金）。精修样板不挂这块米白板，它会盖住衣服，也不是这两个样板的造型。
  if(body.family!=='refined'){const badge=TEAM[side]??'#c9973a';
    V(-6.5,NY-9,frontZ,-3,NY-5.5,frontZ+.8,2,'#f4efe4');V(-6.5,NY-6,frontZ,-3,NY-5.5,frontZ+.9,2,badge);}

  // ——双肩包：单独一块（原点在包的背面中心、贴背的那一面），站着背在背上，坐下挂到椅背后面
  let pack:THREE.BufferGeometry|null=null;
  if(res.has('backpack')){const pm=new Mesher(atlas.size),c=accColor('backpack','#4a6a8a'),W=Math.min(tw-2,16),Hh=th-1,Dp=6;
    const PV=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,col:string)=>V(x0,y0,z0,x1,y1,z1,0,col,pm);
    PV(-W/2,0,-Dp,W/2,Hh,0,c);PV(-W/2+1,1,-Dp-2,W/2-1,Hh*.55,-Dp,tone(c,.9));PV(-W/2+1.5,Hh*.55-.8,-Dp-2.2,W/2-1.5,Hh*.55,-Dp-1.6,tone(c,.75));PV(-W/2-.4,Hh-3,-Dp-.4,W/2+.4,Hh+.6,.2,tone(c,.82));PV(-1,Hh+.6,-2.5,1,Hh+2,-1.5,'#2b2136');
    pack=pm.geometry(false);pack.scale(T,T,T);
    // 背带：从包顶绕过肩到胸前（这两条挂在身上，坐下也不摘）
    for(const s of [-1,1]){const x=s*(tw/2-3.5);V(x-1,NY-th+3,frontZ,x+1,NY+.4,frontZ+.6,2,tone(c,.75));V(x-1,NY-1,-td/2-.6,x+1,NY+.4,frontZ,2,tone(c,.75));}}

  // ——小腿（膝盖局部，y 向下，长 shin-shoe）和鞋（脚踝局部：鞋跟和小腿后面齐平，鞋头往前伸）
  const shoeH=L.shoes.kind==='boots'?9:body.leg.shoe,shinLen=body.leg.shin-shoeH,hw=lw/2-.15;
  const shinGeo=()=>{const sm=new Mesher(atlas.size);
    const shinP=(face:'front'|'side')=>panel(lp,shinLen,p=>{const c=face==='side'?tone(bottomC,.95):bottomC;
      if(legSkin){p.fill(skin);if(b.socks)p.rect(0,4,lp,shinLen-4,b.socks).rect(0,4,lp,1,tone(b.socks,.85));else p.rect(0,shinLen-3,lp,3,'#f2efe8');p.rect(0,0,lp,1,tone(skin,.93));}
      else{p.fill(c);p.rect(0,0,lp,2,tone(c,.92));
        if(b.kind==='jeans'){p.rect(face==='side'?Math.floor(lp/2):0,0,1,shinLen-3,tone(c,1.15)).rect(0,shinLen-3,lp,3,tone(c,1.2)).rect(0,shinLen-3,lp,1,tone(c,1.32));p.rect(2,4,4,1,tone(c,1.1));}
        else{if(face==='front')p.rect(Math.floor(lp/2),2,1,shinLen-4,tone(c,1.06));p.rect(0,shinLen-2,lp,2,b.kind==='cargo'?tone(c,.78):tone(c,.86));}}});
    const sf=shinP('front'),ss=shinP('side');sm.box(-hw,-shinLen-.01,-hw,hw,0,hw,0,{pz:sf,nz:sf,px:ss,nx:ss,py:null,ny:null});
    const g=sm.geometry(false);g.scale(T,T,T);return g;};
  const shoeGeo=()=>{const sm=new Mesher(atlas.size),sc=L.shoes.color,sk=L.shoes.kind,boots=sk==='boots',sole=sk==='sneakers'?'#f4f1ea':tone(sc,.55),SL=Math.round(lw/2+7),SW=Math.round(lw+.8);
    const shoeSide=panel(SL,shoeH,p=>{p.fill(sc);p.rect(0,shoeH-1,SL,1,sole);if(sk==='sneakers'){p.rect(0,shoeH-2,SL,1,sole).rect(3,1,6,1,'#f4f1ea',.85).px(1,shoeH-3,tone(sc,.85));}if(boots){p.rect(0,0,SL,1,tone(sc,1.15));p.rect(0,shoeH-2,SL,1,tone(sc,.8));for(let y=2;y<shoeH-3;y+=2)p.px(2,y,tone(sc,.7));}if(sk==='loafers')p.rect(0,0,SL,1,tone(sc,.8)).rect(0,shoeH-2,SL,1,tone(sc,.7));});
    const shoeFront=panel(SW,shoeH,p=>{p.fill(tone(sc,1.04));p.rect(0,shoeH-1,SW,1,sole);if(sk==='sneakers')p.rect(0,shoeH-2,SW,1,sole).rect(2,shoeH-4,SW-4,1,tone(sc,1.12));if(sk==='loafers')p.rect(0,shoeH-2,SW,1,tone(sc,.7));});
    const shoeTop=panel(SW,SL,p=>{p.fill(sc);if(sk==='sneakers'){p.rect(2,0,SW-4,6,tone(sc,.92));for(let y=1;y<6;y+=2)p.rect(3,y,SW-6,1,'#f4f1ea');}if(sk==='loafers')p.rect(3,SL-7,SW-6,2,tone(sc,.7));if(sk==='slippers')p.rect(1,SL-8,SW-2,3,tone(sc,1.15));if(boots)p.rect(1,0,SW-2,3,tone(sc,.85));});
    sm.box(-lw/2-.4,-shoeH,-lw/2,lw/2+.4,0,7,0,{pz:shoeFront,nz:shoeFront,px:shoeSide,nx:shoeSide,py:shoeTop,ny:solid('#2a2626')});
    const g=sm.geometry(false);g.scale(T,T,T);return g;};
  const shins:[THREE.BufferGeometry,THREE.BufferGeometry]=[shinGeo(),shinGeo()],shoes:[THREE.BufferGeometry,THREE.BufferGeometry]=[shoeGeo(),shoeGeo()];

  // ——脸
  const pen=atlas.pen(faceRect);const opts={hat:!!res.hat,glasses:!!res.glasses,hood:res.hood,beard:res.has('beard'),hairline:plan.hairline,hairDeep:hc[3]};
  const texture=new THREE.CanvasTexture(atlas.canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  let last='';
  const face=(st:FaceState)=>{const sig=JSON.stringify(st);if(sig===last)return;last=sig;(anime?paintAnimeFace:paintFace)(pen,L,st,opts);atlas.bleed(faceRect);texture.needsUpdate=true;};
  face({expression:L.tendency.expression==='happy'?'neutral':L.tendency.expression,speak:0,blink:false});
  atlas.bleed();
  const geometry=m.geometry(true);geometry.scale(T,T,T);
  return {geometry,shins,shoes,pack,atlas,texture,resolved:res,body,sit,face};
}
export type {Accessory};
