/**
 * 把一份造型拼成网格：躯干、胳膊、大腿、头、头发和配件合进一个蒙皮网格（8 根骨头），小腿 + 鞋是两块挂在膝盖上的普通网格。
 * 所有零件共用一张 256×256 的贴图集（1 像素 = 1 T）。坐标全部从 rig.ts 的尺寸推出来（身体：脚底 y=0；头：颈部 y=0）。
 * 头发：大发团的每个面按“同一个平面一张贴图”画发丝（hair.ts 的 hairTexel），同一平面上的几块发团共用这张图的不同部分，
 * 所以一缕头发跨过几个盒子也是连着的，贴图集也省地方。
 */
import * as THREE from 'three';
import {Atlas,mix,tone,type Pen,type Rect} from './paint';
import {Mesher,type Faces} from './mesh';
import {planHair,hairTexel,hairColors,type HairBox,type FaceKey} from './hair';
import {paintFace,FACE_W,FACE_H,type FaceState} from './face';
import {resolveLook,type Resolved} from './resolve';
import {RIG,T,HIP_Y,NECK_Y,HEAD} from './rig';
import type {Look} from './types';

export interface Avatar {geometry:THREE.BufferGeometry;shins:[THREE.BufferGeometry,THREE.BufferGeometry];atlas:Atlas;texture:THREE.CanvasTexture;resolved:Resolved;face(st:FaceState):void}
const TEAM:Record<string,string>={pro:'#4e79a1',con:'#c45f53'};
const FACES:FaceKey[]=['px','nx','py','ny','pz','nz'];

/** 先用 256×256 的贴图集，放不下（发团特别多的发型 + 配件）就换 512×512 重来一遍。 */
export function buildAvatar(input:Look,side='host'):Avatar{
  try{return build(input,side,256);}catch(e){if(!String(e).includes('放不下'))throw e;return build(input,side,512);}
}
function build(input:Look,side:string,size:number):Avatar{
  const res=resolveLook(input),L=res.look,atlas=new Atlas(size),m=new Mesher(atlas.size);
  const HY=HIP_Y,NY=NECK_Y,{hx,hz,h:hh,fx,cut}=HEAD,tw=RIG.torso.w,th=RIG.torso.h,td=RIG.torso.d;
  const skin=L.skin,hairC=L.hair.color,top=L.top.color,trim=L.top.trim??tone(top,1.3);
  const outer=L.outer,oc=outer?.color??top,otrim=outer?.trim??tone(oc,.75);
  const bottomC=L.bottom.color;
  const solid=(c:string)=>atlas.solid(c);
  const panel=(w:number,h:number,paint:(p:Pen)=>void):Rect=>{const r=atlas.alloc(w,h);paint(atlas.pen(r));return r;};
  /** 立体纯色块：顶面亮一档、底面暗一档（体素画的明暗） */
  const V=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,bone:number,c:string)=>{const s=solid(c),t=solid(tone(c,1.08)),b=solid(tone(c,.8));m.box(x0,y0,z0,x1,y1,z1,bone,{px:s,nx:s,pz:s,nz:s,py:t,ny:b},true);};

  // ——图案
  const pattern=(p:Pen,c:string,w:number,h:number)=>{const k=L.top.pattern;
    if(k==='stripe')for(let y=1;y<h;y+=3)p.rect(0,y,w,1,tone(c,.8));
    if(k==='plaid'){for(let x=1;x<w;x+=5)p.rect(x,0,2,h,tone(c,.86),.8);for(let y=2;y<h;y+=5)p.rect(0,y,w,2,tone(c,.86),.8);for(let x=1;x<w;x+=5)for(let y=2;y<h;y+=5)p.rect(x,y,2,2,tone(c,.72));for(let y=4;y<h;y+=5)p.rect(0,y,w,1,trim,.5);}
    if(k==='knit')for(let x=0;x<w;x+=2)p.rect(x,0,1,h,tone(c,.9));};
  // ——躯干（内层上衣）：18×17，第 0 行是领口，最后两行是下摆 / 腰带
  const k=L.top.kind;
  const tucked=['shirt','polo','blouse'].includes(k)&&L.bottom.kind!=='skirt';
  const torsoFront=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);
    if(k==='tee'){p.rect(6,0,6,1,skin).rect(7,1,4,1,skin).px(5,0,tone(top,.78)).px(12,0,tone(top,.78)).rect(6,2,6,1,tone(top,.86));p.rect(0,th-1,tw,1,tone(top,.84));}
    if(k==='shirt'||k==='polo'||k==='blouse'){const pl=k==='polo'?6:th;p.rect(8,0,2,pl,tone(top,1.1));for(let y=k==='polo'?2:3;y<(k==='polo'?6:th-2);y+=4)p.px(9,y,tone(top,.6));
      if(k==='shirt')p.rect(11,3,4,4,tone(top,.93)).rect(11,3,4,1,tone(top,.8));if(k==='blouse')p.rect(7,0,1,th,tone(top,.9)).rect(10,0,1,th,tone(top,.9));}
    if(k==='sweater'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.9));for(let y=2;y<th-3;y+=3)p.px(8,y,tone(top,1.12)).px(9,y+1,tone(top,1.12)).px(9,y,tone(top,.8)).px(8,y+1,tone(top,.8));for(let x=0;x<tw;x+=2)p.rect(x,th-3,1,3,tone(top,.78));p.rect(5,0,8,1,trim);}
    if(k==='hoodie'){p.rect(3,9,12,5,tone(top,.9)).rect(3,9,12,1,tone(top,.78)).rect(3,9,1,5,tone(top,.82)).rect(14,9,1,5,tone(top,.82));p.rect(6,0,1,6,trim).rect(11,0,1,6,trim).px(6,6,tone(trim,.8)).px(11,6,tone(trim,.8));p.rect(0,th-2,tw,2,tone(top,.84));p.rect(5,0,8,1,tone(top,.75));}
    if(k==='turtleneck'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.92));p.rect(0,th-2,tw,2,tone(top,.85));}
    if(tucked){p.rect(0,th-2,tw,2,bottomC);p.rect(0,th-2,tw,1,'#3a2a22');p.rect(8,th-2,2,1,'#c9a65a');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,5,12,th-5,o).rect(3,5,12,1,tone(o,1.12)).rect(6,7,6,4,tone(o,.88)).rect(6,7,6,1,tone(o,.75));p.rect(2,0,2,6,o).rect(14,0,2,6,o).px(3,5,'#d8c070').px(14,5,'#d8c070');}
    if(L.outer?.kind==='apron'){const o=L.outer.color;p.rect(3,4,12,th-4,o).rect(3,4,12,1,tone(o,1.12)).rect(5,8,8,4,tone(o,.9));p.rect(4,0,1,4,tone(o,.8)).rect(13,0,1,4,tone(o,.8));}
  });
  const torsoBack=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);p.rect(0,3,tw,1,tone(top,.9));p.rect(8,4,2,th-4,tone(top,.95));if(tucked){p.rect(0,th-2,tw,2,bottomC).rect(0,th-2,tw,1,'#3a2a22');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,6,12,th-6,o).rect(5,0,2,7,o).rect(11,0,2,7,o);}
    if(L.outer?.kind==='apron'){p.rect(5,th-6,8,1,tone(L.outer.color,.85));}});
  const torsoSide=panel(td,th,p=>{p.fill(tone(top,.97));pattern(p,top,td,th);p.rect(4,0,1,th,tone(top,.88));if(tucked)p.rect(0,th-2,td,2,bottomC).rect(0,th-2,td,1,'#3a2a22');});
  const torsoBottom=panel(tw,td,p=>p.fill(tone(bottomC,.8)));
  m.box(-tw/2,HY,-td/2,tw/2,NY,td/2,2,{pz:torsoFront,nz:torsoBack,px:torsoSide,nx:torsoSide,py:null,ny:torsoBottom});

  // ——外套壳（比躯干大 1 T，前襟开口处透明）
  const sleeveOuter=outer&&!['vest','apron','overalls'].includes(outer.kind);
  const OW=tw+2,OH=th+1,OD=td+2;
  if(outer&&!['apron','overalls'].includes(outer.kind)){
    const k2=outer.kind;
    const front=panel(OW,OH,p=>{p.fill(oc);
      // 开口：开衫 / 拉链衫整条开，西装 / 马甲 V 领，夹克 / 棒球服拉到胸口
      const open=(y:number)=>k2==='cardigan'||k2==='zip'?3:k2==='blazer'||k2==='vest'?Math.max(0,Math.round(5-y*.55)):k2==='coat'?Math.max(0,Math.round(3-y*.45)):k2==='jacket'||k2==='varsity'?(y<6?Math.max(1,3-Math.floor(y/2)):1):0;
      for(let y=0;y<OH;y++){const o=open(y);if(o>0){p.clear(OW/2-o,y,o*2,1);p.px(OW/2-o-1,y,tone(oc,k2==='blazer'||k2==='coat'?.72:.85)).px(OW/2+o,y,tone(oc,k2==='blazer'||k2==='coat'?.72:.85));}}
      if(k2==='cardigan'){for(let y=3;y<OH-2;y+=4)p.px(OW/2+3,y,trim);for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,tone(oc,.82));p.rect(2,10,4,4,tone(oc,.9)).rect(OW-6,10,4,4,tone(oc,.9)).rect(2,10,4,1,tone(oc,.8)).rect(OW-6,10,4,1,tone(oc,.8));}
      if(k2==='blazer'){p.rect(2,12,5,1,tone(oc,.75)).rect(OW-7,12,5,1,tone(oc,.75));p.rect(OW-7,4,4,1,tone(oc,.75));if(outer.trim)p.rect(OW-6,3,2,1,outer.trim);p.px(OW/2-1,11,'#d8c070').px(OW/2-1,14,'#d8c070');for(let y=0;y<8;y++){p.px(OW/2-6+Math.floor(y/2),y,tone(oc,.8));p.px(OW/2+5-Math.floor(y/2),y,tone(oc,.8));}}
      if(k2==='vest'){p.px(OW/2-1,10,'#d8c070').px(OW/2-1,13,'#d8c070').px(OW/2-1,16,'#d8c070');p.rect(2,11,4,1,tone(oc,.78)).rect(OW-6,11,4,1,tone(oc,.78));}
      if(k2==='coat'){for(const y of [5,9]){p.px(OW/2-3,y,tone(oc,.6)).px(OW/2+2,y,tone(oc,.6));}p.rect(0,13,OW,2,otrim).px(OW/2-1,13,'#d8c070').px(OW/2,14,'#d8c070');}
      if(k2==='jacket'){p.rect(OW/2,3,1,OH-3,'#c9c9c9');p.rect(2,5,5,4,tone(oc,.9)).rect(2,5,5,1,tone(oc,.78));p.rect(OW-7,11,5,4,tone(oc,.9)).rect(OW-7,11,5,1,tone(oc,.78));p.rect(0,OH-2,OW,2,tone(oc,.8));}
      if(k2==='zip'){p.rect(OW/2-4,OH-8,2,6,tone(oc,.85)).rect(OW/2+2,OH-8,2,6,tone(oc,.85));p.rect(0,OH-2,OW,2,tone(oc,.82));}
      if(k2==='varsity'){for(let x=0;x<OW;x+=2){p.rect(x,OH-2,1,2,otrim);}p.rect(0,OH-3,OW,1,trim);p.rect(3,4,4,5,otrim).rect(4,5,2,3,oc);for(let y=4;y<OH-3;y+=3)p.px(OW/2+2,y,'#e8e0d0');}
    });
    const back=panel(OW,OH,p=>{p.fill(oc);p.rect(0,3,OW,1,tone(oc,.88));p.rect(OW/2,4,1,OH-4,tone(oc,.9));if(k2==='varsity'){for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,otrim);p.rect(4,4,OW-8,5,tone(oc,.88));}if(k2==='coat')p.rect(0,13,OW,2,otrim);if(k2==='cardigan'||k2==='zip')for(let x=0;x<OW;x+=2)p.rect(x,OH-2,1,2,tone(oc,.82));});
    const sideP=panel(OD,OH,p=>{p.fill(tone(oc,.96));p.rect(OD/2,0,1,OH,tone(oc,.86));if(k2==='coat')p.rect(0,13,OD,2,otrim);});
    const bot=solid(tone(oc,.55));
    m.box(-OW/2,HY-1,-OD/2,OW/2,NY,OD/2,2,{pz:front,nz:back,px:sideP,nx:sideP,py:null,ny:bot});
    // 翻领 / 衣领体素
    if(k2==='blazer'||k2==='coat'){V(-6,NY-5,OD/2,-2.5,NY,OD/2+1,2,tone(oc,.85));V(2.5,NY-5,OD/2,6,NY,OD/2+1,2,tone(oc,.85));}
    if(k2==='varsity'||k2==='jacket'||k2==='zip')V(-7,NY-2,-7,7,NY+.4,7,2,k2==='varsity'?otrim:tone(oc,.9));
    // 长外套下摆：后半片挂在髋上，前两片挂在大腿上（坐下时搭在腿上）
    if(res.coatHem){const c=tone(oc,.97);V(-10.5,HY-7,-6.5,10.5,HY,0,1,c);V(-10.5,HY-7,0,-.6,HY,6.5,6,c);V(.6,HY-7,0,10.5,HY,6.5,7,c);}
  }
  // 背带裤 / 围裙：胸前一块立体的兜
  if(outer?.kind==='overalls'){V(-3,HY+8,td/2,3,HY+12,td/2+1,2,tone(outer.color,.92));}
  if(outer?.kind==='apron'){V(-7,HY+3,td/2,7,NY-3,td/2+.7,2,outer.color);V(-7,HY-11,RIG.leg.d/2,-.6,HY,RIG.leg.d/2+.7,6,outer.color);V(.6,HY-11,RIG.leg.d/2,7,HY,RIG.leg.d/2+.7,7,outer.color);}

  // ——衣领、帽兜堆、高领
  if((k==='shirt'||k==='polo'||k==='blouse')&&!res.hood){const c=k==='polo'?trim:k==='blouse'?'#fbf6ee':mix(top,'#ffffff',.55);V(-6,NY-2.5,td/2-.5,-.6,NY,td/2+1.6,2,c);V(.6,NY-2.5,td/2-.5,6,NY,td/2+1.6,2,c);}
  if(k==='turtleneck')V(-7,NY-3,-6,7,NY,6.5,2,tone(top,.92));
  if(k==='hoodie'&&!res.longBack&&!res.hood&&!res.has('scarf')){V(-8,NY-6,-9,8,NY,-5,2,tone(top,.9));V(-6,NY-5,-10,6,NY-1,-9,2,tone(top,.8));}

  // ——胳膊：7×17，长袖到第 14 行，手 3 行
  const aw=RIG.arm.w,ah=RIG.arm.h,sleeveC=sleeveOuter?oc:top,sleeve=sleeveOuter?'long':L.top.sleeve??(k==='tee'||k==='polo'?'short':'long');
  const cuff=sleeveOuter&&['blazer','coat'].includes(outer!.kind)?(['shirt','blouse'].includes(k)?mix(top,'#ffffff',.5):top):null;
  const armPanel=(face:'front'|'side'|'back')=>panel(aw,ah,p=>{p.fill(skin);const sc=face==='side'?tone(sleeveC,.96):sleeveC;
    const len=sleeve==='long'?ah-3:sleeve==='rolled'?9:6;p.rect(0,0,aw,len,sc);
    if(sleeve==='long'){p.rect(0,len-2,aw,2,sleeveOuter&&outer!.kind==='varsity'?otrim:tone(sc,.84));if(k==='sweater'||outer?.kind==='cardigan')for(let x=0;x<aw;x+=2)p.rect(x,len-2,1,2,tone(sc,.72));if(cuff)p.rect(0,len-1,aw,1,cuff);}
    else if(sleeve==='rolled'){p.rect(0,len-2,aw,2,tone(sc,1.12));}else p.rect(0,len-1,aw,1,tone(sc,.84));
    if(k==='sweater'&&!sleeveOuter)for(let x=1;x<aw;x+=2)p.rect(x,0,1,len-2,tone(sc,.9));
    if(sleeveOuter&&outer!.kind==='varsity')p.rect(0,0,aw,len-2,otrim);
    if(face==='side'&&sleeve!=='long')p.rect(0,len,1,ah-len,tone(skin,.94));
    p.rect(0,ah-1,aw,1,tone(skin,.9));if(face==='front')p.px(3,ah-2,tone(skin,.9));});
  const armF=armPanel('front'),armS=armPanel('side'),armB=armPanel('back'),shoulder=solid(sleeveC),hand=solid(tone(skin,.95));
  const ax=RIG.arm.x;
  for(const [sx,bone] of [[-1,4],[1,5]] as const){const x0=sx*ax-aw/2,x1=sx*ax+aw/2;m.box(x0,NY-ah,-aw/2,x1,NY,aw/2,bone,{pz:armF,nz:armB,px:armS,nx:armS,py:shoulder,ny:hand});
    if(k==='blouse'&&!sleeveOuter)V(x0-.6,NY-5,-aw/2-.6,x1+.6,NY+.3,aw/2+.6,bone,tone(top,1.04));}
  if(res.has('watch'))V(ax-aw/2-.4,NY-ah+3,-aw/2-.4,ax+aw/2+.4,NY-ah+4.5,aw/2+.4,5,'#3a3640');

  // ——大腿（多出 4 T 伸到膝盖下面，坐下时是膝盖前面那块）
  const lw=RIG.leg.w,ld=RIG.leg.d,thighH=RIG.leg.thigh+4,b=L.bottom;
  const legSkin=b.kind==='shorts'||b.kind==='skirt';
  const thighPanel=(face:'front'|'side'|'back')=>panel(lw,thighH,p=>{const c=face==='side'?tone(bottomC,.95):bottomC;p.fill(c);
    if(b.kind==='jeans'){p.rect(face==='side'?3:0,0,1,thighH,tone(c,1.15));if(face==='front')p.rect(1,1,3,1,tone(c,1.12));}
    if(b.kind==='cargo'&&face==='front')p.rect(0,5,lw,1,tone(c,.85));
    if(b.kind==='shorts'){p.rect(0,7,lw,thighH-7,skin);p.rect(0,6,lw,1,tone(c,.82));}
    if(b.kind==='skirt'){p.fill(b.socks??skin);}
    if(face==='back'&&!legSkin)p.rect(0,0,lw,1,tone(c,.85));});
  const thF=thighPanel('front'),thS=thighPanel('side'),thB=thighPanel('back'),knee=solid(legSkin?b.socks??skin:bottomC);
  for(const [sx,bone] of [[-1,6],[1,7]] as const){const cx=sx*RIG.leg.x;m.box(cx-lw/2,HY-thighH,-ld/2,cx+lw/2,HY,ld/2,bone,{pz:thF,nz:thB,px:thS,nx:thS,py:null,ny:knee});
    if(b.kind==='cargo')V(cx+sx*lw/2-(sx>0?0:1),HY-9,-2.5,cx+sx*lw/2+(sx>0?1:0),HY-4,2.5,bone,tone(bottomC,.9));}
  // 裙子：后半片在髋上，前两片在大腿上
  if(b.kind==='skirt'){const sk=panel(20,8,p=>{p.fill(bottomC);for(let x=1;x<20;x+=3)p.rect(x,0,1,8,tone(bottomC,.82));p.rect(0,7,20,1,tone(bottomC,.75));p.rect(0,0,20,1,tone(bottomC,1.1));});
    const skS=panel(6,8,p=>{p.fill(tone(bottomC,.95));for(let x=1;x<6;x+=3)p.rect(x,0,1,8,tone(bottomC,.8));p.rect(0,7,6,1,tone(bottomC,.75));});const und=solid(tone(bottomC,.6));
    m.box(-10,HY-7,-6,10,HY+1,0,1,{nz:sk,px:skS,nx:skS,ny:und,pz:null,py:null});
    m.box(-10,HY-7,0,0,HY+1,6,6,{pz:sk,nx:skS,ny:und,px:null,py:solid(bottomC)});m.box(0,HY-7,0,10,HY+1,6,7,{pz:sk,px:skS,ny:und,nx:null,py:solid(bottomC)});}

  // ——头（正面是脸，会按表情重画）
  const plan=planHair(L.hair.style,{hat:res.hat,hood:res.hood,glasses:!!res.glasses,ahoge:res.ahoge,tuck:L.hair.tuck});
  const hc=hairColors(hairC,L.hair.tie??'#d94f5c',tone,mix);
  const faceRect=atlas.alloc(FACE_W,FACE_H);
  // 头的侧面：靠脸的一半亮、靠后脑的一半暗一档，下面一条从下巴斜着升到耳下的下颌线，侧面不是一块平板
  const sidePanel=(frontAtLeft:boolean)=>panel(RIG.head.d-cut,hh,p=>{const D=RIG.head.d-cut;p.fill(skin);p.rect(0,0,D,12,hc[3]);
    for(let u=0;u<D;u++){const back=frontAtLeft?u/(D-1):1-u/(D-1),col=frontAtLeft?u:u;if(back>.55)p.rect(col,12,1,hh-12,tone(skin,.95));const jaw=Math.round(hh-3-back*7);p.rect(col,jaw,1,hh-jaw,tone(skin,.9));p.px(col,jaw,tone(skin,.86));}});
  const headSideP=sidePanel(true),headSideN=sidePanel(false);
  const headBack=panel(RIG.head.w,hh,p=>{p.fill(hc[3]);p.rect(0,hh-8,RIG.head.w,8,tone(skin,.92));p.rect(0,hh-8,RIG.head.w,1,tone(hc[3],.9));});
  // 头 = 后面一大块（两侧面到 hz-cut 为止）+ 前面一块脸板（宽 ±fx），两侧竖棱各切掉 cut
  m.box(-hx,NY,-hz,hx,NY+hh,hz-cut,3,{pz:solid(tone(skin,.92)),nz:headBack,px:headSideP,nx:headSideN,py:solid(hc[3]),ny:solid(tone(skin,.84))});
  m.box(-fx,NY,hz-cut,fx,NY+hh,hz,3,{pz:faceRect,nz:null,px:solid(tone(skin,.95)),nx:solid(tone(skin,.95)),py:solid(hc[3]),ny:solid(tone(skin,.84))});
  // 耳朵（侧发盖住时被头发挡掉）
  // 耳朵：小一点（4×7），外侧只有一块很淡的耳窝和亮一档的上沿，不画成一圈一圈的框
  const ear=panel(4,7,p=>{p.fill(tone(skin,.95));p.rect(1,2,2,3,tone(skin,.88)).rect(0,0,4,1,tone(skin,1.02));});
  for(const sx of [-1,1]){const x0=sx>0?hx:-hx-1.5,x1=sx>0?hx+1.5:-hx;m.box(x0,NY+10,-2,x1,NY+17,2,3,{px:ear,nx:ear,pz:solid(skin),nz:solid(tone(skin,.86)),py:solid(skin),ny:solid(tone(skin,.82))});}

  // ——头发：纯色的小件直接画；大发团按平面分组，一个平面一张发丝贴图
  type Plane={f:FaceKey;at:number;items:Array<{b:HairBox;u0:number;u1:number;v0:number;v1:number}>};
  const span=(f:FaceKey,b:HairBox):[number,number,number,number]=>f==='pz'?[b.x0,b.x1,-b.y1,-b.y0]:f==='nz'?[-b.x1,-b.x0,-b.y1,-b.y0]:f==='px'?[-b.z1,-b.z0,-b.y1,-b.y0]:f==='nx'?[b.z0,b.z1,-b.y1,-b.y0]:f==='py'?[b.x0,b.x1,b.z0,b.z1]:[b.x0,b.x1,-b.z1,-b.z0];
  const at=(f:FaceKey,b:HairBox)=>f==='px'?b.x1:f==='nx'?b.x0:f==='py'?b.y1:f==='ny'?b.y0:f==='pz'?b.z1:b.z0;
  const point=(f:FaceKey,a:number,u:number,v:number):[number,number,number]=>f==='pz'?[u,-v,a]:f==='nz'?[-u,-v,a]:f==='px'?[a,-v,-u]:f==='nx'?[a,-v,u]:f==='py'?[u,a,v]:[u,a,-v];
  const planes=new Map<string,Plane>(),faceOf=new Map<HairBox,Faces>();
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
      const [X,Y,Z]=point(pl.f,pl.at,u,v);p.px(i,j,hc[hairTexel(plan,pl.f,X,Y,Z,it.b)]);}
    for(const it of pl.items)(faceOf.get(it.b) as Record<string,Rect>)[pl.f]={x:r.x+it.u0-U0,y:r.y+it.v0-V0,w:it.u1-it.u0,h:it.v1-it.v0};
  }
  for(const [hb,fc] of faceOf){for(const f of FACES)if(!(f in fc))(fc as Record<string,Rect|null>)[f]=null;m.box(hb.x0,NY+hb.y0,hb.z0,hb.x1,NY+hb.y1,hb.z1,3,fc);}

  // ——配件（头部局部坐标，y 从颈部算）
  const H=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,c:string,bone=3)=>V(x0,NY+y0,z0,x1,NY+y1,z1,bone,c);
  const sideOut=hx+plan.outer.side,backOut=hz+plan.outer.back,topOut=hh+plan.outer.top;
  const accColor=(kind:string,def:string)=>res.acc.find(a=>a.kind===kind)?.color??def;
  if(res.glasses){const c=accColor(res.glasses==='round'?'roundGlasses':'glasses','#2d2a33'),z0=hz,z1=hz+1.2,round=res.glasses==='round';
    // 镜框套住眼睛（眼睛在贴图第 18–26 行、6–12 / 23–29 列 → 头部 y 9–18，x -12…-5 / 5…12）
    for(const [a,bb] of [[-13,-4],[4,13]] as const){
      H(a+(round?1:0),18,z0,bb-(round?1:0),19,z1,c);H(a+(round?1:0),8,z0,bb-(round?1:0),9,z1,c);H(a,round?9.5:8,z0,a+1,round?17.5:19,z1,c);H(bb-1,round?9.5:8,z0,bb,round?17.5:19,z1,c);
      if(round){H(a+.5,9,z0,a+1.5,10,z1,c);H(bb-1.5,9,z0,bb-.5,10,z1,c);H(a+.5,17,z0,a+1.5,18,z1,c);H(bb-1.5,17,z0,bb-.5,18,z1,c);}
      const sx=a<0?-1:1,ox=sx<0?a:bb;H(sx<0?-hx-.4:ox,15,z0-.6,sx<0?ox:hx+.4,16,z0+.4,c);H(sx<0?-hx-.8:hx,15,2,sx<0?-hx:hx+.8,16,z0,c);}
    H(-4,14.5,z0,4,15.5,z1,c);}
  // 帽子的帽顶分两级、四角切掉：从背后、侧面看是圆顶，不是一只盒子
  const crown=(y0:number,y1:number,X:number,Zb:number,Zf:number,c:string)=>{const m=Math.max(y0+(y1-y0)*.55,topOut+.6);H(-X+2,y0,-Zb,X-2,m,Zf,c);for(const s of [-1,1])H(s>0?X-2:-X,y0,-Zb+2,s>0?X:-X+2,m,Zf-1,c);H(-X+2.5,m,-Zb+2.5,X-2.5,y1,Zf-1.2,c);for(const s of [-1,1])H(s>0?X-2.5:-X+1,m,-Zb+4,s>0?X-1:-X+2.5,y1-1,Zf-2.5,tone(c,.97));};
  if(res.hat==='beanie'){const c=accColor('beanie','#c0503a'),hx2=sideOut+.8,hb=backOut+.8;crown(24,topOut+5,hx2,hb,hz+3.4,c);H(-hx2-.8,23,-hb-.8,hx2+.8,28,hz+4.2,tone(c,.82));
    for(let x=-hx2+2;x<hx2-1;x+=4)H(x,23.2,hz+4.2,x+1,27.8,hz+4.5,tone(c,.7));H(-4.5,topOut+5,-4.5,4.5,topOut+11,4.5,mix(c,'#ffffff',.6));}
  if(res.hat==='cap'){const c=accColor('cap','#3f6a9a'),hx2=sideOut+.7,hb=backOut+.7;crown(26,topOut+5,hx2,hb,hz+3.4,c);H(-14,25,hz+3.4,14,27,hz+12,tone(c,.85));H(-1.5,topOut+5,-1.5,1.5,topOut+6.5,1.5,tone(c,1.2));H(-5,26,-hb-.3,5,30,-hb,tone(c,.7));
    H(-hx2-.2,26,-hb-.2,hx2+.2,27.5,-hb+8,tone(c,.75));}
  if(res.hat==='beret'){const c=accColor('beret','#7a2e3a'),hx2=sideOut+.6,hb=backOut+.6;H(-hx2-4,topOut-1,-hb-1.5,hx2+1,topOut+4,hz+2,c);H(-hx2,topOut-3,-hb,hx2,topOut-1,hz+1.4,tone(c,.82));H(-1,topOut+4,-1,1,topOut+6,1,tone(c,.7));}
  if(res.hood){const c=accColor('hood',oc),r=tone(c,.85),X=hx+4,Zb=-hz-4,Zf=hz+1.5;
    H(-X,hh+.5,Zb,X,hh+5,Zf,c);for(const s of [-1,1])H(s>0?hx:-X,-2,Zb,s>0?X:-hx,hh+.5,Zf,c);H(-hx,-2,Zb,hx,hh+.5,-hz,c);
    H(-X,hh-1.5,Zf,X,hh+5,Zf+2,r);for(const s of [-1,1])H(s>0?hx-1.5:-X,-2,Zf,s>0?X:-hx+1.5,hh-1.5,Zf+2,r);
    V(-6,NY-9,td/2,-5,NY-1,td/2+1.2,2,'#e8e2d6');V(5,NY-9,td/2,6,NY-1,td/2+1.2,2,'#e8e2d6');}
  const phoneC=accColor(res.phones==='set'?'headset':res.phones==='neck'?'neckphones':'headphones','#2e3440');
  if(res.phones==='head'||res.phones==='set'){const so=res.hat?sideOut+1.4:sideOut,to=res.hat?topOut+6:topOut+1;
    H(-so-2,to,-2,so+2,to+2,2,phoneC);
    for(const sx of [-1,1]){
      if(res.phones==='set'&&sx>0){H(so,16,-1.5,so+1.5,to,1.5,phoneC);H(so,10,-3,so+2,16,3,phoneC);continue;}
      const x0=sx>0?so:-so-2,x1=sx>0?so+2:-so;H(x0,18,-2,x1,to,2,phoneC);const c0=sx>0?so:-so-4,c1=sx>0?so+4:-so;H(c0,7,-5,c1,19,5,phoneC);H(sx>0?c1:c0-.8,8,-4,sx>0?c1+.8:c0,18,4,mix(phoneC,'#ffffff',.25));}
    if(res.phones==='set'){H(-so-3,7,4,-so-1,9,15,'#3a3a40');H(-so-1,6,15,-7,8,17,'#3a3a40');H(-8,5,15,-5,9,18,'#1e1e22');}}
  if(res.phones==='neck'){for(const sx of [-1,1]){const x0=sx>0?6:-12,x1=sx>0?12:-6;V(x0,NY-7,3,x1,NY-.5,8.5,2,phoneC);V(x0+1,NY-6,8.5,x1-1,NY-1.5,9.3,2,mix(phoneC,'#ffffff',.25));}V(-11,NY-2,-7,11,NY,-4,2,phoneC);}
  if(res.has('scarf')){const c=accColor('scarf','#c9573f'),c2=tone(c,.78);V(-10.5,NY-5,-6.5,10.5,NY-3,7.5,2,c);V(-10.5,NY-3,-6.5,10.5,NY-1.5,7.5,2,c2);V(-10.5,NY-1.5,-6.5,10.5,NY,7.5,2,c);
    V(1.5,NY-12,6.5,5.5,NY-5,8.5,2,c);V(1.5,NY-14,6.5,5.5,NY-12,8.5,2,c2);V(1.5,NY-16,6.5,5.5,NY-14,8.5,2,c);for(let x=1.5;x<5.5;x+=1.4)V(x,NY-17.4,7,x+.8,NY-16,8,2,c2);}
  const tieZ=td/2;
  if(res.has('tie')){const c=accColor('tie','#7a2e3a');V(-1.2,NY-3,tieZ,1.2,NY-.5,tieZ+1.4,2,tone(c,.85));V(-1.5,NY-12,tieZ,1.5,NY-3,tieZ+.9,2,c);V(-1,NY-13,tieZ,1,NY-12,tieZ+.9,2,c);}
  if(res.has('bowtie')){const c=accColor('bowtie','#2e2a3a');V(-3.6,NY-3,td/2,-.6,NY-.4,td/2+1.3,2,c);V(.6,NY-3,td/2,3.6,NY-.4,td/2+1.3,2,c);V(-.7,NY-2.7,td/2,.7,NY-.7,td/2+1.7,2,tone(c,.8));}
  if(res.has('ribbon')){const c=accColor('ribbon','#c94a5a');V(-5,NY-3.5,td/2,-1,NY-.5,td/2+1.6,2,c);V(1,NY-3.5,td/2,5,NY-.5,td/2+1.6,2,c);V(-1,NY-3.2,td/2,1,NY-.8,td/2+2,2,tone(c,.8));V(-2.6,NY-8,td/2,-.6,NY-3.5,td/2+1,2,c);V(.6,NY-8,td/2,2.6,NY-3.5,td/2+1,2,c);}
  for(const a of res.acc){const sx=a.side??1;
    if(a.kind==='clip'){const c=a.color??'#f0c44c',x=sx>0?sideOut-1:-sideOut-.6;H(x,24,8,x+1.6,26,13,c);H(x,26,9,x+1.6,27,10,tone(c,.8));}
    if(a.kind==='bow'){const c=a.color??'#d9535f',cx=sx*11,t=topOut-2;H(cx-6,t,-2,cx-1,t+4,2,c);H(cx+1,t,-2,cx+6,t+4,2,c);H(cx-1,t+.5,-2.4,cx+1,t+3.5,2.4,tone(c,.8));}
    if(a.kind==='pen'){const c=a.color??'#2b3550',x=sx>0?sideOut-.4:-sideOut-.8;H(x,16,-6,x+1.2,17.2,8,c);H(x,16,8,x+1.2,17.2,10,'#d8c070');}
    if(a.kind==='earring'){const x=sx>0?hx+.2:-hx-1.2;H(x,7,0,x+1,9,1,a.color??'#e0c060');}
    // 胡子：下巴上一块、往下收窄的一撮、嘴上一道小胡子；两颊只有贴着脸板边缘的细鬓（不再突出成两块砖）
    if(a.kind==='beard'){const c=a.color??tone(hairC,.95);H(-10,-3,hz-4,10,5.4,hz+2.2,c);H(-7,-6,hz-3.5,7,-3,hz+1.6,tone(c,.92));H(-4,-8,hz-3,4,-6,hz+1,tone(c,.86));H(-6,7.4,hz,6,8.6,hz+1.4,c);
      for(const s of [-1,1])H(s>0?fx-1.5:-fx,2,hz-1,s>0?fx:-fx+1.5,11,hz+.6,tone(c,.94));}
  }
  // 队别胸牌（旧皮肤上的挂绳胸牌，保留语义：正方蓝、反方红、其他金）
  const badge=TEAM[side]??'#c9973a',bz=outer&&!['apron','overalls'].includes(outer.kind)?OD/2:td/2;
  V(-6.5,NY-9,bz,-3,NY-5.5,bz+.8,2,'#f4efe4');V(-6.5,NY-6,bz,-3,NY-5.5,bz+.9,2,badge);

  // ——小腿 + 鞋（膝盖局部，y 向下）：小腿 28 T，鞋 5 T（靴子 8 T）
  const shin=()=>{const sm=new Mesher(atlas.size),w=lw/2-.15,boots=L.shoes.kind==='boots',sh=boots?9:RIG.leg.shoe,len=RIG.leg.shin-sh;
    const shinP=(face:'front'|'side')=>panel(lw,len,p=>{const c=face==='side'?tone(bottomC,.95):bottomC;
      if(legSkin){p.fill(skin);if(b.socks)p.rect(0,4,lw,len-4,b.socks).rect(0,4,lw,1,tone(b.socks,.85));else p.rect(0,len-3,lw,3,'#f2efe8');p.rect(0,0,lw,1,tone(skin,.93));}
      else{p.fill(c);p.rect(0,0,lw,2,tone(c,.92));
        if(b.kind==='jeans'){p.rect(face==='side'?4:0,0,1,len-3,tone(c,1.15)).rect(0,len-3,lw,3,tone(c,1.2)).rect(0,len-3,lw,1,tone(c,1.32));p.rect(2,4,4,1,tone(c,1.1));}
        else{if(face==='front')p.rect(4,2,1,len-4,tone(c,1.06));p.rect(0,len-2,lw,2,b.kind==='cargo'?tone(c,.78):tone(c,.86));}}});
    const sf=shinP('front'),ss=shinP('side');sm.box(-w,-RIG.leg.shin+sh-.01,-w,w,0,w,0,{pz:sf,nz:sf,px:ss,nx:ss,py:null,ny:null});
    const sc=L.shoes.color,sk=L.shoes.kind,sole=sk==='sneakers'?'#f4f1ea':tone(sc,.55);
    const shoeSide=panel(12,sh,p=>{p.fill(sc);p.rect(0,sh-1,12,1,sole);if(sk==='sneakers'){p.rect(0,sh-2,12,1,sole).rect(3,1,6,1,'#f4f1ea',.85).px(1,sh-3,tone(sc,.85));}if(boots){p.rect(0,0,12,1,tone(sc,1.15));p.rect(0,sh-2,12,1,tone(sc,.8));for(let y=2;y<sh-3;y+=2)p.px(2,y,tone(sc,.7));}if(sk==='loafers')p.rect(0,0,12,1,tone(sc,.8)).rect(0,sh-2,12,1,tone(sc,.7));});
    const shoeFront=panel(10,sh,p=>{p.fill(tone(sc,1.04));p.rect(0,sh-1,10,1,sole);if(sk==='sneakers')p.rect(0,sh-2,10,1,sole).rect(2,sh-4,6,1,tone(sc,1.12));if(sk==='loafers')p.rect(0,sh-2,10,1,tone(sc,.7));});
    const shoeTop=panel(10,12,p=>{p.fill(sc);if(sk==='sneakers'){p.rect(2,0,6,6,tone(sc,.92));for(let y=1;y<6;y+=2)p.rect(3,y,4,1,'#f4f1ea');}if(sk==='loafers')p.rect(3,5,4,2,tone(sc,.7));if(sk==='slippers')p.rect(1,4,8,3,tone(sc,1.15));if(boots)p.rect(1,0,8,3,tone(sc,.85));});
    sm.box(-lw/2-.4,-RIG.leg.shin,-5,lw/2+.4,-RIG.leg.shin+sh,6.6,0,{pz:shoeFront,nz:shoeFront,px:shoeSide,nx:shoeSide,py:shoeTop,ny:solid('#2a2626')});
    const g=sm.geometry(false);g.scale(T,T,T);return g;};
  const shins:[THREE.BufferGeometry,THREE.BufferGeometry]=[shin(),shin()];

  // ——脸
  const pen=atlas.pen(faceRect);const opts={hat:!!res.hat,glasses:!!res.glasses,hood:res.hood,beard:res.has('beard'),hairline:plan.hairline,hairDeep:hc[3]};
  const texture=new THREE.CanvasTexture(atlas.canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  let last='';
  const face=(st:FaceState)=>{const sig=JSON.stringify(st);if(sig===last)return;last=sig;paintFace(pen,L,st,opts);atlas.bleed(faceRect);texture.needsUpdate=true;};
  face({expression:L.tendency.expression==='happy'?'neutral':L.tendency.expression,speak:0,blink:false});
  atlas.bleed();
  const geometry=m.geometry(true);geometry.scale(T,T,T);
  return {geometry,shins,atlas,texture,resolved:res,face};
}
