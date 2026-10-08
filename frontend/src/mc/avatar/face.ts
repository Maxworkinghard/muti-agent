/**
 * 脸（头部正面 32×30 像素，每像素 1 T）：大眼睛（6×7，两点高光）、小嘴、腮红。保持旧接口：face(mind,t,speaking,reduced,extra)。
 * 眼型 6 种、眉型 6 种、默认嘴型 6 种；表情：neutral / happy / surprised / thinking / angry / shy，
 * 说话三帧嘴型，眨眼。表情由旧的触发词映射过来（shock→surprised、cheer/happy→happy、brows/frown→angry、think、shy）。
 */
import type {Pen} from './paint';
import {mix,tone} from './paint';
import type {EyeType,BrowType,MouthType,Expression,Look} from './types';
import {HAIR} from './hair';
export const FACE_W=32,FACE_H=30;
const EYES:[number,number]=[6,20],EYE_Y=13;
export interface FaceState {expression:Expression;speak:number;blink:boolean;sleepy?:boolean;grin?:boolean;blush?:boolean;sweat?:boolean;raise?:boolean}
export function paintFace(p:Pen,look:Look,st:FaceState,opts:{hat:boolean;glasses:boolean;hood:boolean;beard:boolean}){
  const skin=look.skin,hair=look.hair.color,lash=mix('#24181f',hair,.2),iris=look.face.iris;
  const shade=tone(skin,.9),lip=mix(tone(skin,.62),'#b8504a',.35),mouthDark='#6a2a2c',tongue='#e07a78',white='#fffaf6';
  p.fill(skin);
  // 下颌两侧和下巴一点暗部
  p.rect(0,18,1,12,shade).rect(31,18,1,12,shade).rect(1,27,30,3,tone(skin,.96)).rect(2,29,28,1,shade);
  // 发际线：和体素刘海同一条轮廓（刘海体素在脸前 1 格，这里画的是它后面的头皮/头发，侧面看不露缝）
  const shape=HAIR[look.hair.style].shape;
  for(let c=0;c<32;c++){const x=2*Math.floor((c-16)/2)+1;let f=shape.fringe(x);if(opts.glasses&&f<20)f=20;if(opts.hat&&f<18)f=18;const rows=Math.max(opts.hood?3:2,Math.min(17,30-f));p.rect(c,0,1,rows,hair);p.px(c,rows-1,tone(hair,.75));}
  const e=st.expression;
  // ——眉
  const brow=tone(hair,.62),bt=look.face.brows,by=st.raise||e==='surprised'?9:10;
  for(const [i,ex] of EYES.entries()){const inner=i===0?ex+5:ex,outer=i===0?ex:ex+5,dir=i===0?1:-1;
    if(e==='angry'){p.rect(Math.min(inner,inner-dir*4),by,5,1,brow);p.px(inner,by+1,brow).px(inner-dir,by+1,brow);p.px(outer,by-1,brow);}
    else if(e==='shy'||bt==='worried'){p.rect(Math.min(inner,inner-dir*4),by,5,1,brow);p.px(inner,by-1,brow);p.px(outer,by+1,brow);}
    else if(e==='thinking'&&i===1){p.rect(ex,by-1,6,1,brow);p.px(ex+5,by,brow);}
    else if(bt==='thick'){p.rect(ex,by-1,6,2,brow);}
    else if(bt==='sharp'){p.rect(ex,by,6,1,brow);p.px(outer,by-1,brow);}
    else if(bt==='arched'){p.rect(ex+1,by-1,4,1,brow);p.px(ex,by,brow).px(ex+5,by,brow);}
    else if(bt==='straight'){p.rect(ex,by,6,1,brow);}
    else {p.rect(ex+1,by,4,1,brow);p.px(outer,by+1,brow,.6);}
  }
  // ——眼
  const type:EyeType=st.sleepy?'sleepy':look.face.eyes;
  for(const [i,ex] of EYES.entries()){const y=EYE_Y,outer=i===0?ex:ex+5,inner=i===0?ex+5:ex,dir=i===0?-1:1;
    if(st.blink||e==='happy'&&!st.speak){ // 闭眼：眨眼是一道线，开心是 ^ 形弯眼
      if(e==='happy'){p.px(ex,y+4,lash).px(ex+1,y+3,lash).rect(ex+2,y+2,2,1,lash).px(ex+4,y+3,lash).px(ex+5,y+4,lash);}
      else p.rect(ex,y+4,6,1,lash).px(outer,y+5,lash);
      continue;}
    const irisD=tone(iris,.55),irisL=mix(iris,'#ffffff',.38);
    let top=y+1,bot=y+6;
    if(type==='sleepy'){top=y+3;}
    if(type==='narrow'||e==='angry'){top=y+2;bot=y+5;}
    if(e==='surprised'){top=y;bot=y+7;}
    // 白眼仁只在惊讶时露一圈
    if(e==='surprised'){p.rect(ex,top,6,bot-top+1,white);p.rect(ex+1,top+1,4,bot-top-1,iris);p.rect(ex+2,top+2,2,2,irisD);p.px(ex+1,top+1,white);}
    else{
      p.rect(ex,top,6,bot-top+1,iris);p.rect(ex,top,6,Math.min(2,bot-top),irisD);p.rect(ex,bot,6,1,irisL);
      // 瞳孔：想事情往上看，害羞往下看
      const look_=e==='thinking'?-1:e==='shy'?1:0,shift=e==='thinking'?dir:e==='shy'?-dir:0;
      p.rect(ex+2+shift,Math.max(top,y+3+look_),2,2,tone(iris,.35));
      // 两点高光：左上一大块、右下一小点（光从左上来，两只眼睛同侧）
      if(bot-top>=3){p.rect(ex+1,top+1,2,2,white);p.px(ex+4,bot-1,white,.9);}else p.px(ex+1,top,white);
      if(type==='sparkle'){p.px(ex+4,top+1,white).px(ex+3,top+2,white,.6);}
      // 眼角：圆眼两角收一个像素
      if(type==='round'||type==='sparkle'){p.px(ex,bot,skin).px(ex+5,bot,skin);}
    }
    // 上眼线（加粗外眼角），下垂眼外角往下，锐眼外角往上挑
    p.rect(ex,top-1,6,1,lash);
    if(type==='sharp'||e==='angry'){p.px(outer,top-2,lash).px(outer+dir,top-2,lash);p.px(inner,top,lash);}
    else if(type==='droopy'){p.px(outer+dir,top,lash).px(outer+dir,top+1,lash);}
    else p.px(outer+dir,top-1,lash).px(outer+dir,top,lash,.7);
    if(type==='sleepy')p.rect(ex,top-3,6,2,tone(skin,.88));
    if(e==='angry'){p.px(inner,top,skin).px(inner-dir,top,skin,.0);p.rect(inner+(i===0?-1:0),top,2,1,lash);}
  }
  // ——腮红、雀斑、汗
  if(st.blush||e==='shy'){const a=e==='shy'?.95:.7;for(const x of [3,24]){p.rect(x,20,5,2,'#ec8f8a',a);if(e==='shy')for(let k=0;k<3;k++)p.px(x+1+k*1.5|0,20,'#d8605e',.8);}}
  if(look.face.marks?.includes('freckles'))for(const [x,y] of [[5,21],[7,22],[25,21],[27,22],[6,20],[26,20]])p.px(x,y,tone(skin,.78));
  if(look.face.marks?.includes('mole'))p.px(22,24,tone(skin,.55));
  if(st.sweat||look.face.marks?.includes('sweat')&&e!=='happy'){p.rect(28,8,2,3,'#9fd3f2').px(28,11,'#9fd3f2').px(28,8,'#ffffff',.8);}
  // ——鼻子：一个像素的阴影
  p.px(15,20,tone(skin,.82));
  // ——嘴
  const m:MouthType=st.grin?'grin':look.face.mouth,mx=15,my=23;
  if(opts.beard){ /* 胡子挡住下半张脸，只画说话时的一条缝 */ if(st.speak)p.rect(mx-1,my,4,1,mouthDark);return;}
  if(st.speak){const f=st.speak-1;
    if(f===0)p.rect(mx,my,2,2,mouthDark).px(mx,my+1,tongue);
    else if(f===1)p.rect(mx-1,my-1,4,3,mouthDark).rect(mx,my+1,2,1,tongue);
    else p.rect(mx-1,my,4,1,mouthDark).rect(mx-1,my,4,1,'#ffffff',.5);
    return;}
  if(e==='happy'){p.rect(mx-2,my-1,6,1,mouthDark).rect(mx-1,my,4,1,mouthDark).rect(mx,my+1,2,1,mouthDark).rect(mx-1,my,4,1,tongue,.0).px(mx,my,tongue).px(mx+1,my,tongue);return;}
  if(e==='surprised'){p.rect(mx,my-1,2,3,mouthDark).px(mx-1,my,mouthDark).px(mx+2,my,mouthDark);return;}
  if(e==='angry'){p.rect(mx-2,my,6,1,lip).px(mx-2,my+1,lip).px(mx+3,my+1,lip).rect(mx-1,my,4,1,'#ffffff',.7);return;}
  if(e==='shy'){p.px(mx-2,my,lip).px(mx-1,my+1,lip).px(mx,my,lip).px(mx+1,my+1,lip).px(mx+2,my,lip);return;}
  if(e==='thinking'){p.rect(mx,my,3,1,lip).px(mx-1,my+1,lip);return;}
  if(m==='smile'){p.rect(mx-1,my+1,4,1,lip).px(mx-2,my,lip).px(mx+3,my,lip);}
  else if(m==='flat'){p.rect(mx-1,my,4,1,lip);}
  else if(m==='cat'){p.px(mx-2,my,lip).px(mx-1,my+1,lip).px(mx,my,lip).px(mx+1,my,lip).px(mx+2,my+1,lip).px(mx+3,my,lip);}
  else if(m==='smirk'){p.rect(mx-1,my+1,3,1,lip).px(mx+2,my,lip).px(mx+3,my-1,lip);}
  else if(m==='grin'){p.rect(mx-2,my,6,2,mouthDark).rect(mx-2,my,6,1,'#ffffff').px(mx-2,my+1,skin).px(mx+3,my+1,skin);}
  else p.rect(mx,my,2,1,lip);
}
