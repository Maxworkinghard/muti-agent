/**
 * 把一份造型拼成网格：躯干、胳膊、大腿、头、头发和配件合进一个蒙皮网格（8 根骨头），小腿 + 鞋是两块挂在膝盖上的普通网格。
 * 所有零件共用一张 256×256 的贴图集（1 像素 = 1 T）。
 */
import * as THREE from 'three';
import {Atlas,mix,tone,type Pen,type Rect} from './paint';
import {Mesher,type Faces} from './mesh';
import {HAIR,hairExtras,hairShell,type HairVoxel} from './hair';
import {paintFace,FACE_W,FACE_H,type FaceState} from './face';
import {resolveLook,type Resolved} from './resolve';
import {RIG,T,HIP_Y,NECK_Y} from './rig';
import type {Look} from './types';

export interface Avatar {geometry:THREE.BufferGeometry;shins:[THREE.BufferGeometry,THREE.BufferGeometry];atlas:Atlas;texture:THREE.CanvasTexture;resolved:Resolved;face(st:FaceState):void}
const TEAM:Record<string,string>={pro:'#4e79a1',con:'#c45f53'};

export function buildAvatar(input:Look,side='host'):Avatar{
  const res=resolveLook(input),L=res.look,atlas=new Atlas(),m=new Mesher(atlas.size);
  const skin=L.skin,hairC=L.hair.color,top=L.top.color,trim=L.top.trim??tone(top,1.3);
  const outer=L.outer,oc=outer?.color??top,otrim=outer?.trim??tone(oc,.75);
  const bottomC=L.bottom.color;
  const solid=(c:string)=>atlas.solid(c);
  const panel=(w:number,h:number,paint:(p:Pen)=>void):Rect=>{const r=atlas.alloc(w,h);paint(atlas.pen(r));return r;};
  const S=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,bone:number,c:string)=>m.box(x0,y0,z0,x1,y1,z1,bone,solid(c),true);
  /** 立体纯色块：顶面亮一档、底面暗一档（体素画的明暗） */
  const V=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,bone:number,c:string)=>{const s=solid(c),t=solid(tone(c,1.08)),b=solid(tone(c,.8));m.box(x0,y0,z0,x1,y1,z1,bone,{px:s,nx:s,pz:s,nz:s,py:t,ny:b},true);};

  // ——图案
  const pattern=(p:Pen,c:string,w:number,h:number)=>{const k=L.top.pattern;
    if(k==='stripe')for(let y=1;y<h;y+=4)p.rect(0,y,w,1,tone(c,.82));
    if(k==='plaid'){for(let x=1;x<w;x+=5)p.rect(x,0,2,h,tone(c,.86),.8);for(let y=2;y<h;y+=5)p.rect(0,y,w,2,tone(c,.86),.8);for(let x=1;x<w;x+=5)for(let y=2;y<h;y+=5)p.rect(x,y,2,2,tone(c,.72));for(let y=4;y<h;y+=5)p.rect(0,y,w,1,trim,.5);}
    if(k==='knit')for(let x=0;x<w;x+=2)p.rect(x,0,1,h,tone(c,.9));};
  // ——躯干（内层上衣）
  const tw=RIG.torso.w,th=RIG.torso.h,td=RIG.torso.d;
  const tucked=['shirt','polo','blouse'].includes(L.top.kind)&&L.bottom.kind!=='skirt';
  const torsoFront=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);const k=L.top.kind;
    if(k==='tee'){p.rect(6,0,6,1,skin).rect(7,1,4,1,skin).px(5,0,tone(top,.8)).px(12,0,tone(top,.8)).rect(6,2,6,1,tone(top,.88));p.rect(0,th-1,tw,1,tone(top,.85));}
    if(k==='shirt'||k==='polo'||k==='blouse'){p.rect(8,0,2,k==='polo'?7:th,tone(top,1.1));for(let y=k==='polo'?2:3;y<(k==='polo'?7:th-2);y+=4)p.px(9,y,tone(top,.62));
      if(k==='shirt')p.rect(11,4,4,4,tone(top,.93)).rect(11,4,4,1,tone(top,.8));if(k==='blouse')p.rect(7,0,1,th,tone(top,.9)).rect(10,0,1,th,tone(top,.9));}
    if(k==='sweater'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.9));for(let y=2;y<th-3;y+=3)p.px(8,y,tone(top,1.12)).px(9,y+1,tone(top,1.12)).px(9,y,tone(top,.8)).px(8,y+1,tone(top,.8));for(let x=0;x<tw;x+=2)p.rect(x,th-3,1,3,tone(top,.78));p.rect(5,0,8,1,trim);}
    if(k==='hoodie'){p.rect(3,10,12,6,tone(top,.9)).rect(3,10,12,1,tone(top,.78)).rect(3,10,1,6,tone(top,.82)).rect(14,10,1,6,tone(top,.82));p.rect(6,0,1,6,trim).rect(11,0,1,6,trim).px(6,6,tone(trim,.8)).px(11,6,tone(trim,.8));p.rect(0,th-2,tw,2,tone(top,.84));p.rect(5,0,8,1,tone(top,.75));}
    if(k==='turtleneck'){for(let x=1;x<tw;x+=2)p.rect(x,0,1,th,tone(top,.92));p.rect(0,th-2,tw,2,tone(top,.85));}
    if(tucked){p.rect(0,th-2,tw,2,bottomC);p.rect(0,th-2,tw,1,'#3a2a22');p.rect(8,th-2,2,1,'#c9a65a');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,5,12,th-5,o).rect(3,5,12,1,tone(o,1.12)).rect(6,8,6,4,tone(o,.88)).rect(6,8,6,1,tone(o,.75));p.rect(2,0,2,6,o).rect(14,0,2,6,o).px(3,5,'#d8c070').px(14,5,'#d8c070');}
    if(L.outer?.kind==='apron'){const o=L.outer.color;p.rect(3,4,12,th-4,o).rect(3,4,12,1,tone(o,1.12)).rect(5,9,8,4,tone(o,.9));p.rect(4,0,1,4,tone(o,.8)).rect(13,0,1,4,tone(o,.8));}
  });
  const torsoBack=panel(tw,th,p=>{p.fill(top);pattern(p,top,tw,th);p.rect(0,3,tw,1,tone(top,.9));p.rect(8,4,2,th-4,tone(top,.95));if(tucked){p.rect(0,th-2,tw,2,bottomC).rect(0,th-2,tw,1,'#3a2a22');}
    if(L.outer?.kind==='overalls'){const o=L.outer.color;p.rect(3,6,12,th-6,o).rect(5,0,2,7,o).rect(11,0,2,7,o);}
    if(L.outer?.kind==='apron'){p.rect(5,th-6,8,1,tone(L.outer.color,.85));}});
  const torsoSide=panel(td,th,p=>{p.fill(tone(top,.97));pattern(p,top,td,th);p.rect(4,0,1,th,tone(top,.88));if(tucked)p.rect(0,th-2,td,2,bottomC).rect(0,th-2,td,1,'#3a2a22');});
  const torsoBottom=panel(tw,td,p=>p.fill(tone(bottomC,.8)));
  m.box(-tw/2,HIP_Y,-td/2,tw/2,NECK_Y,td/2,2,{pz:torsoFront,nz:torsoBack,px:torsoSide,nx:torsoSide,py:null,ny:torsoBottom});

  // ——外套壳（比躯干大 1 T，前襟开口处透明）
  const sleeveOuter=outer&&!['vest','apron','overalls'].includes(outer.kind);
  if(outer&&!['apron','overalls'].includes(outer.kind)){
    const W=tw+2,H=th+1,D=td+2,k=outer.kind;
    const front=panel(W,H,p=>{p.fill(oc);
      // 开口：开衫 / 拉链衫整条开，西装 / 马甲 V 领，夹克 / 棒球服拉到胸口
      const open=(y:number)=>k==='cardigan'||k==='zip'?3:k==='blazer'||k==='vest'?Math.max(0,Math.round(5-y*.5)):k==='coat'?Math.max(0,Math.round(3-y*.4)):k==='jacket'||k==='varsity'?(y<6?Math.max(1,3-Math.floor(y/2)):1):0;
      for(let y=0;y<H;y++){const o=open(y);if(o>0){p.clear(W/2-o,y,o*2,1);p.px(W/2-o-1,y,tone(oc,k==='blazer'||k==='coat'?.72:.85)).px(W/2+o,y,tone(oc,k==='blazer'||k==='coat'?.72:.85));}}
      if(k==='cardigan'){for(let y=3;y<H-2;y+=4)p.px(W/2+3,y,trim);for(let x=0;x<W;x+=2)p.rect(x,H-2,1,2,tone(oc,.82));p.rect(2,12,4,4,tone(oc,.9)).rect(W-6,12,4,4,tone(oc,.9));}
      if(k==='blazer'){p.rect(2,13,5,1,tone(oc,.75)).rect(W-7,13,5,1,tone(oc,.75));p.rect(W-7,5,4,1,tone(oc,.75));if(outer.trim)p.rect(W-6,4,2,1,outer.trim);p.px(W/2-1,12,'#d8c070').px(W/2-1,15,'#d8c070');for(let y=0;y<9;y++){p.px(W/2-6+Math.floor(y/2),y,tone(oc,.8));p.px(W/2+5-Math.floor(y/2),y,tone(oc,.8));}}
      if(k==='vest'){p.px(W/2-1,11,'#d8c070').px(W/2-1,14,'#d8c070').px(W/2-1,17,'#d8c070');p.rect(2,12,4,1,tone(oc,.78)).rect(W-6,12,4,1,tone(oc,.78));}
      if(k==='coat'){for(const y of [6,10,14]){p.px(W/2-3,y,tone(oc,.6)).px(W/2+2,y,tone(oc,.6));}p.rect(0,15,W,2,otrim).px(W/2-1,15,'#d8c070').px(W/2,16,'#d8c070');}
      if(k==='jacket'){p.rect(W/2,3,1,H-3,'#c9c9c9');p.rect(2,6,5,4,tone(oc,.9)).rect(2,6,5,1,tone(oc,.78));p.rect(W-7,13,5,4,tone(oc,.9)).rect(W-7,13,5,1,tone(oc,.78));p.rect(0,H-2,W,2,tone(oc,.8));}
      if(k==='zip'){p.rect(W/2-4,H-8,2,7,tone(oc,.85)).rect(W/2+2,H-8,2,7,tone(oc,.85));p.rect(0,H-2,W,2,tone(oc,.82));}
      if(k==='varsity'){for(let x=0;x<W;x+=2){p.rect(x,H-2,1,2,otrim);}p.rect(0,H-3,W,1,trim);p.rect(3,5,4,5,otrim).rect(4,6,2,3,oc);for(let y=4;y<H-3;y+=3)p.px(W/2+2,y,'#e8e0d0');}
    });
    const back=panel(W,H,p=>{p.fill(oc);p.rect(0,3,W,1,tone(oc,.88));p.rect(W/2,4,1,H-4,tone(oc,.9));if(k==='varsity'){for(let x=0;x<W;x+=2)p.rect(x,H-2,1,2,otrim);p.rect(4,5,W-8,5,tone(oc,.88));}if(k==='coat')p.rect(0,15,W,2,otrim);if(k==='cardigan'||k==='zip')for(let x=0;x<W;x+=2)p.rect(x,H-2,1,2,tone(oc,.82));});
    const sideP=panel(D,H,p=>{p.fill(tone(oc,.96));p.rect(D/2,0,1,H,tone(oc,.86));if(k==='coat')p.rect(0,15,D,2,otrim);});
    const bot=solid(tone(oc,.55));
    m.box(-W/2,HIP_Y-1,-D/2,W/2,NECK_Y,D/2,2,{pz:front,nz:back,px:sideP,nx:sideP,py:null,ny:bot});
    // 翻领 / 衣领体素
    if(k==='blazer'||k==='coat'){V(-6,38,6,-2.5,43,7,2,tone(oc,.85));V(2.5,38,6,6,43,7,2,tone(oc,.85));}
    if(k==='varsity'||k==='jacket'||k==='zip')V(-7,41,-7,7,43.5,7,2,k==='varsity'?otrim:tone(oc,.9));
    // 长外套下摆：后半片挂在髋上，前两片挂在大腿上（坐下时搭在腿上）
    if(res.coatHem){const c=tone(oc,.97);V(-10.5,17,-6.5,10.5,HIP_Y,0,1,c);V(-10.5,17,0,-.6,HIP_Y,6.5,6,c);V(.6,17,0,10.5,HIP_Y,6.5,7,c);}
  }
  // 背带裤 / 围裙：胸前一块立体的兜
  if(outer?.kind==='overalls'){V(-3,32,5,3,36,6,2,tone(outer.color,.92));}
  if(outer?.kind==='apron'){V(-7,27,5,7,40,5.7,2,outer.color);V(-7,13,4,-.6,24,4.7,6,outer.color);V(.6,13,4,7,24,4.7,7,outer.color);}

  // ——衣领、帽兜堆、高领
  const k=L.top.kind;
  if((k==='shirt'||k==='polo'||k==='blouse')&&!res.hood){const c=k==='polo'?trim:k==='blouse'?'#fbf6ee':mix(top,'#ffffff',.55);V(-6,40.5,4.5,-.6,43,6.6,2,c);V(.6,40.5,4.5,6,43,6.6,2,c);}
  if(k==='turtleneck')V(-7,40,-6,7,43,6.5,2,tone(top,.92));
  if(k==='hoodie'&&!res.longBack&&!res.hood&&!res.has('scarf')){V(-8,37,-9,8,43,-5,2,tone(top,.9));V(-6,38,-10,6,42,-9,2,tone(top,.8));}

  // ——胳膊
  const aw=RIG.arm.w,ah=RIG.arm.h,sleeveC=sleeveOuter?oc:top,sleeve=sleeveOuter?'long':L.top.sleeve??(k==='tee'||k==='polo'?'short':'long');
  const cuff=sleeveOuter&&['blazer','coat'].includes(outer!.kind)?(['shirt','blouse'].includes(k)?mix(top,'#ffffff',.5):top):null;
  const armPanel=(face:'front'|'side'|'back')=>panel(aw,ah,p=>{p.fill(skin);const sc=face==='side'?tone(sleeveC,.96):sleeveC;
    const len=sleeve==='long'?15:sleeve==='rolled'?10:7;p.rect(0,0,aw,len,sc);
    if(sleeve==='long'){p.rect(0,len-2,aw,2,sleeveOuter&&outer!.kind==='varsity'?otrim:tone(sc,.84));if(k==='sweater'||outer?.kind==='cardigan')for(let x=0;x<aw;x+=2)p.rect(x,len-2,1,2,tone(sc,.72));if(cuff)p.rect(0,len-1,aw,1,cuff);}
    else if(sleeve==='rolled'){p.rect(0,len-2,aw,2,tone(sc,1.12));}else p.rect(0,len-1,aw,1,tone(sc,.84));
    if(k==='sweater'&&!sleeveOuter)for(let x=1;x<aw;x+=2)p.rect(x,0,1,len-2,tone(sc,.9));
    if(sleeveOuter&&outer!.kind==='varsity')p.rect(0,0,aw,len-2,otrim);
    if(face==='side'&&sleeve!=='long')p.rect(0,len,1,ah-len,tone(skin,.94));
    p.rect(0,ah-1,aw,1,tone(skin,.9));if(face==='front')p.px(3,ah-2,tone(skin,.9));});
  const armF=armPanel('front'),armS=armPanel('side'),armB=armPanel('back'),shoulder=solid(sleeveC),hand=solid(tone(skin,.95));
  const ax=RIG.arm.x;
  for(const [sx,bone] of [[-1,4],[1,5]] as const){const x0=sx*ax-aw/2,x1=sx*ax+aw/2;m.box(x0,NECK_Y-ah,-aw/2,x1,NECK_Y,aw/2,bone,{pz:armF,nz:armB,px:armS,nx:armS,py:shoulder,ny:hand});
    if(k==='blouse'&&!sleeveOuter)V(x0-.6,NECK_Y-5,-aw/2-.6,x1+.6,NECK_Y+.3,aw/2+.6,bone,tone(top,1.04));}
  if(res.has('watch'))V(ax-aw/2-.4,28,-aw/2-.4,ax+aw/2+.4,29.5,aw/2+.4,5,'#3a3640');

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
  for(const [sx,bone] of [[-1,6],[1,7]] as const){const cx=sx*RIG.leg.x;m.box(cx-lw/2,HIP_Y-thighH,-ld/2,cx+lw/2,HIP_Y,ld/2,bone,{pz:thF,nz:thB,px:thS,nx:thS,py:null,ny:knee});
    if(b.kind==='cargo')V(cx+sx*lw/2-(sx>0?0:1),15,-2.5,cx+sx*lw/2+(sx>0?1:0),20,2.5,bone,tone(bottomC,.9));}
  // 裙子：后半片在髋上，前两片在大腿上
  if(b.kind==='skirt'){const sk=panel(20,8,p=>{p.fill(bottomC);for(let x=1;x<20;x+=3)p.rect(x,0,1,8,tone(bottomC,.82));p.rect(0,7,20,1,tone(bottomC,.75));p.rect(0,0,20,1,tone(bottomC,1.1));});
    const skS=panel(6,8,p=>{p.fill(tone(bottomC,.95));for(let x=1;x<6;x+=3)p.rect(x,0,1,8,tone(bottomC,.8));p.rect(0,7,6,1,tone(bottomC,.75));});const und=solid(tone(bottomC,.6));
    m.box(-10,17,-6,10,HIP_Y+1,0,1,{nz:sk,px:skS,nx:skS,ny:und,pz:null,py:null});
    m.box(-10,17,0,0,HIP_Y+1,6,6,{pz:sk,nx:skS,ny:und,px:null,py:solid(bottomC)});m.box(0,17,0,10,HIP_Y+1,6,7,{pz:sk,px:skS,ny:und,nx:null,py:solid(bottomC)});}

  // ——头（正面是脸，会按表情重画）
  const hw=RIG.head.w,hh=RIG.head.h,hd=RIG.head.d,shape={...HAIR[L.hair.style].shape,...(L.hair.tuck!==undefined?{tuck:L.hair.tuck}:{})};
  const faceRect=atlas.alloc(FACE_W,FACE_H);
  const headSide=panel(hd,hh,p=>{p.fill(skin);p.rect(0,0,hd,res.hood?hh:12,hairC);p.rect(hd-12,0,12,hh-6,hairC);p.rect(0,hh-2,hd,2,tone(skin,.92));});
  const headBack=panel(hw,hh,p=>{p.fill(hairC);p.rect(0,hh-3,hw,3,tone(hairC,.8));});
  const headTop=solid(hairC),chin=solid(tone(skin,.86));
  m.box(-hw/2,NECK_Y,-hd/2,hw/2,NECK_Y+hh,hd/2,3,{pz:faceRect,nz:headBack,px:headSide,nx:headSide,py:headTop,ny:chin});
  // 耳朵（侧发盖住时被头发挡掉）
  for(const sx of [-1,1]){const x0=sx>0?16:-17.5,x1=sx>0?17.5:-16;m.box(x0,NECK_Y+10,-1,x1,NECK_Y+17,3,3,{px:solid(tone(skin,.93)),nx:solid(tone(skin,.93)),pz:solid(skin),nz:solid(tone(skin,.85)),py:solid(skin),ny:solid(tone(skin,.8))},true);}

  // ——头发
  const hairTones=[hairC,tone(hairC,.86),mix(hairC,'#ffffff',.2),tone(hairC,.74),L.hair.tie??'#d94f5c'];
  const voxels:HairVoxel[]=[...hairShell(shape,{hat:!!res.hat,hood:res.hood,glasses:!!res.glasses}),...(res.hood?[]:hairExtras(L.hair.style,shape,{hat:!!res.hat,ahoge:res.ahoge}))];
  for(const v of voxels){const c=hairTones[v.tone];V(v.x0,NECK_Y+v.y0,v.z0,v.x1,NECK_Y+v.y1,v.z1,v.bone,c);}

  // ——配件（头部局部坐标，Y 从颈部算）
  const H=(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,c:string,bone=3)=>V(x0,NECK_Y+y0,z0,x1,NECK_Y+y1,z1,bone,c);
  const sideOut=res.hood?19:16+shape.side,backOut=res.hood?18:14+shape.back,topOut=30+(res.hat||res.hood?0:shape.top);
  const accColor=(kind:string,def:string)=>res.acc.find(a=>a.kind===kind)?.color??def;
  if(res.glasses){const c=accColor(res.glasses==='round'?'roundGlasses':'glasses','#2d2a33'),z0=14,z1=15.2;
    for(const sx of [-1,1]){const a=sx>0?4:-10,bb=sx>0?10:-4;const round=res.glasses==='round';
      H(a,17,z0,bb,18,z1,c);H(a,9,z0,bb,10,z1,c);H(a-1,round?10:9,z0,a,round?17:18,z1,c);H(bb,round?10:9,z0,bb+1,round?17:18,z1,c);
      H(sx>0?11:-16,15,z0,sx>0?16:-11,16,z1,c);H(sx>0?16:-17,15,2,sx>0?17:-16,16,z1,c);}
    H(-3,15,z0,3,16,z1,c);}
  if(res.hat==='beanie'){const c=accColor('beanie','#c0503a'),hx=sideOut+.6,hb=backOut+.6;H(-hx,23,-hb,hx,topOut+7,17,c);H(-hx-.8,21,-hb-.8,hx+.8,26,17.8,tone(c,.82));H(-4,topOut+7,-4,4,topOut+12,4,mix(c,'#ffffff',.6));}
  if(res.hat==='cap'){const c=accColor('cap','#3f6a9a'),hx=sideOut+.6,hb=backOut+.6;H(-hx,24,-hb,hx,topOut+6,16.6,c);H(-13,23,16.6,13,25,26,tone(c,.85));H(-1.5,topOut+6,-1.5,1.5,topOut+7.5,1.5,tone(c,1.2));H(-hx-.2,24,-hb-.2,hx+.2,26,-hb+6,tone(c,.75));}
  if(res.hat==='beret'){const c=accColor('beret','#7a2e3a'),hx=sideOut+.6,hb=backOut+.6;H(-hx-3,topOut-1,-hb-1,hx,topOut+4,17,c);H(-hx,topOut-3,-hb,hx,topOut-1,16.5,tone(c,.82));H(-1,topOut+4,-1,1,topOut+6,1,tone(c,.7));}
  if(res.hood){const c=accColor('hood',oc),r=tone(c,.85);H(-19,33,-18,19,37,15,c);H(-19,-2,-18,-16.5,33,15,c);H(16.5,-2,-18,19,33,15,c);H(-19,-2,-18,19,33,-14.5,c);
    H(-19,25,15,19,37,17,r);H(-19,-2,15,-13,25,17,r);H(13,-2,15,19,25,17,r);H(-9,-2,-13,9,0,14,tone(c,.75));
    V(-6,33,5,-5,41,6.2,2,'#e8e2d6');V(5,33,5,6,41,6.2,2,'#e8e2d6');}
  const phoneC=accColor(res.phones==='set'?'headset':res.phones==='neck'?'neckphones':'headphones','#2e3440');
  if(res.phones==='head'||res.phones==='set'){const so=res.hat?sideOut+1.4:sideOut,to=res.hat?topOut+(res.hat==='beanie'?8:7):topOut+1;
    H(-so-2,to,-2,so+2,to+2,2,phoneC);for(const sx of [-1,1]){if(res.phones==='set'&&sx>0){H(so,16,-1.5,so+1.5,to,1.5,phoneC);H(so,10,-3,so+2,16,3,phoneC);continue;}
      const x0=sx>0?so:-so-2,x1=sx>0?so+2:-so;H(x0,18,-2,x1,to,2,phoneC);const c0=sx>0?so:-so-4,c1=sx>0?so+4:-so;H(c0,7,-5,c1,19,5,phoneC);H(sx>0?c1:c0-0,8,-4,sx>0?c1+.8:c0,18,4,mix(phoneC,'#ffffff',.25));}
    if(res.phones==='set'){H(-so-3,7,4,-so-1,9,15,'#3a3a40');H(-so-1,6,15,-7,8,17,'#3a3a40');H(-8,5,15,-5,9,18,'#1e1e22');}}
  if(res.phones==='neck'){for(const sx of [-1,1]){const x0=sx>0?6:-12,x1=sx>0?12:-6;V(x0,36,3,x1,42.5,8.5,2,phoneC);V(x0+1,37,8.5,x1-1,41.5,9.3,2,mix(phoneC,'#ffffff',.25));}V(-11,41,-7,11,43,-4,2,phoneC);}
  if(res.has('scarf')){const c=accColor('scarf','#c9573f'),c2=tone(c,.78);V(-10.5,38,-6.5,10.5,40,7.5,2,c);V(-10.5,40,-6.5,10.5,41.5,7.5,2,c2);V(-10.5,41.5,-6.5,10.5,43,7.5,2,c);
    V(1.5,31,6.5,5.5,38,8.5,2,c);V(1.5,29,6.5,5.5,31,8.5,2,c2);V(1.5,27,6.5,5.5,29,8.5,2,c);for(let x=1.5;x<5.5;x+=1.4)V(x,25.6,7,x+.8,27,8,2,c2);}
  if(res.has('tie')){const c=accColor('tie','#7a2e3a');V(-1.2,40,5,1.2,42.5,6.4,2,tone(c,.85));V(-1.5,30,5,1.5,40,5.9,2,c);V(-1,29,5,1,30,5.9,2,c);}
  if(res.has('bowtie')){const c=accColor('bowtie','#2e2a3a');V(-3.6,40,5,-.6,42.6,6.3,2,c);V(.6,40,5,3.6,42.6,6.3,2,c);V(-.7,40.3,5,.7,42.3,6.7,2,tone(c,.8));}
  if(res.has('ribbon')){const c=accColor('ribbon','#c94a5a');V(-5,39.5,5,-1,42.5,6.6,2,c);V(1,39.5,5,5,42.5,6.6,2,c);V(-1,39.8,5,1,42.2,7,2,tone(c,.8));V(-2.6,35,5,-.6,39.5,6,2,c);V(.6,35,5,2.6,39.5,6,2,c);}
  for(const a of res.acc){const sx=a.side??1;
    if(a.kind==='clip'){const c=a.color??'#f0c44c',x=sx>0?sideOut-1:-sideOut-.6;H(x,19,8,x+1.6,21,13,c);H(x,21,9,x+1.6,22,10,tone(c,.8));}
    if(a.kind==='bow'){const c=a.color??'#d9535f',cx=sx*11,t=topOut-2;H(cx-6,t,-2,cx-1,t+4,2,c);H(cx+1,t,-2,cx+6,t+4,2,c);H(cx-1,t+.5,-2.4,cx+1,t+3.5,2.4,tone(c,.8));}
    if(a.kind==='pen'){const c=a.color??'#2b3550',x=sx>0?sideOut-.4:-sideOut-.8;H(x,17,-6,x+1.2,18.2,8,c);H(x,17,8,x+1.2,18.2,10,'#d8c070');}
    if(a.kind==='earring'){const x=sx>0?16.2:-17.2;H(x,7,0,x+1,9,1,a.color??'#e0c060');}
    if(a.kind==='beard'){const c=a.color??tone(hairC,.95);H(-10,-2,11,10,7,15.6,c);H(-7,-5,10,7,-2,15,tone(c,.9));H(-6,7,14,6,8.5,15.6,c);H(-16,4,-2,-12,12,12,c);H(12,4,-2,16,12,12,c);}
  }
  // 队别胸牌（旧皮肤上的挂绳胸牌，保留语义：正方蓝、反方红、其他金）
  const badge=TEAM[side]??'#c9973a',bz=outer&&!['apron','overalls'].includes(outer.kind)?6:5;
  V(-6.5,33,bz,-3,36.5,bz+.8,2,'#f4efe4');V(-6.5,36,bz,-3,36.5,bz+.9,2,badge);

  // ——小腿 + 鞋（膝盖局部，y 向下）
  const shin=(sx:number)=>{const sm=new Mesher(atlas.size),w=3.85,boots=L.shoes.kind==='boots',sh=boots?7:4;
    const shinP=(face:'front'|'side')=>panel(8,9,p=>{const c=face==='side'?tone(bottomC,.95):bottomC;if(legSkin){p.fill(skin);if(b.socks)p.rect(0,0,8,9,b.socks).rect(0,0,8,1,tone(b.socks,.85));else p.rect(0,6,8,3,'#f2efe8');}
      else{p.fill(c);if(b.kind==='jeans')p.rect(0,6,8,2,tone(c,1.2)).rect(face==='side'?3:0,0,1,6,tone(c,1.15));else p.rect(0,7,8,2,tone(c,.85));}});
    const sf=shinP('front'),ss=shinP('side');sm.box(-w,-RIG.leg.shin+sh-.01,-w,w,0,w,0,{pz:sf,nz:sf,px:ss,nx:ss,py:null,ny:null});
    const sc=L.shoes.color,shoeSide=panel(10,sh,p=>{p.fill(sc);p.rect(0,sh-1,10,1,L.shoes.kind==='sneakers'?'#f4f1ea':tone(sc,.55));if(L.shoes.kind==='sneakers')p.rect(2,1,6,1,'#f4f1ea',.85);if(boots)p.rect(0,0,10,1,tone(sc,1.15));});
    const shoeFront=panel(8,sh,p=>{p.fill(tone(sc,1.04));p.rect(0,sh-1,8,1,L.shoes.kind==='sneakers'?'#f4f1ea':tone(sc,.55));});
    const shoeTop=panel(8,10,p=>{p.fill(sc);if(L.shoes.kind==='sneakers'){for(let y=3;y<8;y+=2)p.rect(2,y,4,1,'#f4f1ea');}if(L.shoes.kind==='loafers')p.rect(2,5,4,2,tone(sc,.7));if(L.shoes.kind==='slippers')p.rect(1,4,6,3,tone(sc,1.15));});
    sm.box(-4.25,-RIG.leg.shin,-4.4,4.25,-RIG.leg.shin+sh,5.6,0,{pz:shoeFront,nz:shoeFront,px:shoeSide,nx:shoeSide,py:shoeTop,ny:solid('#2a2626')});
    const g=sm.geometry(false);g.scale(T,T,T);void sx;return g;};
  const shins:[THREE.BufferGeometry,THREE.BufferGeometry]=[shin(-1),shin(1)];

  // ——脸
  const pen=atlas.pen(faceRect);const opts={hat:!!res.hat,glasses:!!res.glasses,hood:res.hood,beard:res.has('beard')};
  const texture=new THREE.CanvasTexture(atlas.canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapNearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  let last='';
  const face=(st:FaceState)=>{const sig=JSON.stringify(st);if(sig===last)return;last=sig;paintFace(pen,L,st,opts);atlas.bleed(faceRect);texture.needsUpdate=true;};
  face({expression:L.tendency.expression==='happy'?'neutral':L.tendency.expression,speak:0,blink:false});
  atlas.bleed();
  const geometry=m.geometry(true);geometry.scale(T,T,T);
  return {geometry,shins,atlas,texture,resolved:res,face};
}
