/**
 * 脸（头部正面 36×36 像素，每像素 1 T）：大眼睛（7×8，两点高光，眼睛落在脸的中下部）、小嘴、腮红。
 * 保持旧接口：skin.face(mind,t,speaking,reduced,extra) → avatar.face(FaceState)。
 * 眼型 6 种、眉型 6 种、默认嘴型 6 种；表情 6 种：neutral / happy / surprised / thinking / angry / shy，
 * 说话三帧嘴型，眨眼。表情由旧的触发词映射过来（shock→surprised、cheer/happy→happy、brows/frown→angry、think、shy）。
 * 版式（行从上往下数）：发际线以上画成刘海背后的暗部；眉 14–16；眼 18–26；鼻 27；嘴 29–31；腮红 26–27。
 */
import type {Pen} from './paint';
import {mix,tone} from './paint';
import type {EyeType,BrowType,MouthType,Expression,Look} from './types';
/** 脸板高 36、宽 = 36 - 2×切角（头型不同，30–34）；下面的版式按 36 宽设计，画的时候整体左移（两边各裁掉切角那几列，五官在头上的位置不变） */
export const FACE_W=32,FACE_H=36;
/** 两只眼睛最左一列（每只 7 宽），眼睛顶行（上眼线） */
export const EYE_COLS:[number,number]=[6,23],EYE_ROW=18;
export interface FaceState {expression:Expression;speak:number;blink:boolean;sleepy?:boolean;grin?:boolean;blush?:boolean;sweat?:boolean;raise?:boolean}
export interface FaceOpts {hat:boolean;glasses:boolean;hood:boolean;beard:boolean;hairline:(x:number)=>number;hairDeep:string}
/**
 * 精修脸（face.style='anime'）：脸部贴图每 T 两个像素（72×72 的版式，宽按头型裁掉两侧），仍是一格一格的像素画。
 * 和 Q 版脸同一套表情接口（6 种表情、三帧说话、眨眼、腮红 / 汗），五官在头上的位置不变（眼镜等配件照样对得上）：
 *   眼 16×16 像素（上眼线 2 像素加外眼角上挑的一笔、双眼皮一道淡线、虹膜上深下浅三档 + 底边一道反光、竖椭圆的瞳孔、
 *   左上一大一小两点高光、内外眼角一点眼白、下睫毛半截）；眉细，略带弧；鼻一点阴影；嘴小；腮红是动漫式的三道斜线 + 一层淡粉。
 */
export const ANIME_SCALE=2;
export function paintAnimeFace(pen:Pen,look:Look,st:FaceState,o:FaceOpts){
  const W=pen.w,SH=(W-72)/2;
  const p:Pen={w:W,h:pen.h,rect(x,y,w,h,c,a){pen.rect(x+SH,y,w,h,c,a);return p;},px(x,y,c,a){pen.px(x+SH,y,c,a);return p;},fill(c){pen.fill(c);return p;},clear(x,y,w,h){pen.clear(x+SH,y,w,h);return p;}};
  const skin=look.skin,hair=look.hair.color,iris=look.face.iris,e=st.expression;
  const lash=mix('#1f141a',hair,.2),lid=tone(skin,.86),white='#fffaf4',lip=mix(tone(skin,.62),'#b8505a',.42),mouthDark='#5a1f27',tongue='#d86a72';
  p.fill(skin);
  // 下颌两侧、下巴一圈很淡的暗部
  pen.rect(0,40,2,32,tone(skin,.93)).rect(W-2,40,2,32,tone(skin,.93)).rect(2,66,W-4,3,tone(skin,.97)).rect(2,69,W-4,3,tone(skin,.91));
  // 发际线（刘海背后的里层头发）
  for(let c=0;c<W;c++){const x=(c-W/2+.5)/2,rows=Math.max(o.hood?6:4,Math.min(44,Math.round((36-o.hairline(x))*2)));pen.rect(c,0,1,rows,o.hairDeep);pen.px(c,rows,tone(skin,.88));pen.px(c,rows+1,tone(skin,.94));}
  // ——眉（细，略带弧；按 brows 类型变化；表情会改）
  const hn=parseInt(hair.slice(1),16),lightHair=(.2126*((hn>>16)&255)+.7152*((hn>>8)&255)+.0722*(hn&255))/255>.45,brow=tone(hair,lightHair?.48:.62),bt=look.face.brows,raise=st.raise||e==='surprised'?-3:0;
  // 眼睛 16 像素宽（8 T），左眼从第 10 列、右眼从第 46 列起（版式 72 宽）；外眼角在两侧
  const EW=16,L=[10,46];
  L.forEach((x0,i)=>{const dir=i===0?-1:1,outerX=i===0?x0:x0+EW-1,y=28+raise;
    const at=(k:number)=>outerX-dir*k;// k=0 外端 … 内端
    for(let k=0;k<EW-1;k++){let yy=y;const t=k/(EW-2);
      if(e==='angry')yy=y-2+Math.round(t*5);
      else if(e==='shy'||bt==='worried')yy=y+2-Math.round(t*4);
      else if(e==='thinking'&&i===1)yy=y-2+(t>.7?1:0);
      else if(bt==='arched')yy=y+(t<.2?2-Math.round(t*10):t>.7?Math.round((t-.7)*5):0)-1;
      else if(bt==='sharp')yy=y+(t<.3?-1:0)+(t>.8?1:0);
      else if(bt==='straight')yy=y;
      else yy=y+(t<.15?1:0)-(t>.3&&t<.75?1:0);
      const thick=bt==='thick'?3:t>.6?2:1;p.rect(at(k),yy,1,thick,brow,k<2?.7:1);}});
  // ——眼
  const type=st.sleepy?'sleepy':look.face.eyes;
  L.forEach((x0,i)=>{const dir=i===0?-1:1,outerX=i===0?x0:x0+EW-1,innerX=i===0?x0+EW-1:x0;
    if(st.blink||(e==='happy'&&!st.speak)){
      if(e==='happy'&&!st.blink){for(let k=0;k<EW;k++){const yy=44-Math.round(Math.sin(k/(EW-1)*Math.PI)*4);p.rect(x0+k,yy,1,2,lash);}}
      else{for(let k=0;k<EW;k++)p.rect(x0+k,45+(k===0||k===EW-1?-1:0),1,2,lash);p.px(outerX+dir,44,lash).px(outerX+dir*2,43,lash,.7);}
      return;}
    let top=35,bot=51;
    if(type==='sleepy')top=41;if(type==='narrow')top=39,bot=49;if(type==='sharp')top=36;if(e==='angry')top=Math.max(top,39);if(e==='surprised')top=34,bot=52;
    // 眼白（只在两个眼角露一点；惊讶时整圈）
    if(e==='surprised')p.rect(x0,top+1,EW,bot-top-1,white);
    else{p.rect(x0,top+4,2,bot-top-6,white);p.rect(x0+EW-2,top+4,2,bot-top-6,white);}
    // 虹膜：上深、中本色、下浅，底边一道反光；四角修圆
    const ix0=x0+(e==='surprised'?4:1),iw=e==='surprised'?8:EW-2,dark=tone(iris,.5),mid=iris,low=mix(iris,'#ffffff',.38),rim=tone(iris,.68);
    for(let yy=top+1;yy<bot;yy++){const t=(yy-top-1)/Math.max(1,bot-top-2),inset=(yy===top+1||yy===bot-1)?2:(yy===top+2||yy===bot-2)?1:0;
      p.rect(ix0+inset,yy,iw-inset*2,1,t<.3?dark:t<.72?mid:t<.92?low:rim);}
    // 瞳孔：想事情往上一侧看，害羞往下看
    const gy=e==='thinking'?-2:e==='shy'?2:0,gx=e==='thinking'?2:e==='shy'?-dir*2:0,pc=ix0+Math.round(iw/2)-2+gx,py=Math.round((top+bot)/2)-3+gy;
    p.rect(pc,Math.max(top+2,py),4,7,tone(iris,.25));p.rect(pc+1,Math.max(top+2,py)+1,2,5,tone(iris,.18));
    // 高光：左上一大块、右下一小点（两只眼睛同一侧，光从左上来）；亮晶晶的眼多两点
    p.rect(ix0+2,top+2,4,3,white);p.px(ix0+3,top+5,white,.8);p.rect(ix0+iw-4,bot-4,2,2,white,.9);
    if(type==='sparkle')p.px(ix0+7,top+2,white).px(ix0+8,top+3,white,.7).px(ix0+3,bot-3,white,.6);
    // 上眼线：两像素粗，外眼角往外上挑；下垂眼外角往下；锐眼外角挑得更高
    p.rect(x0,top-1,EW,2,lash);p.rect(i===0?x0:x0+EW-4,top-2,4,1,lash);
    if(type==='sharp'||e==='angry'){p.px(outerX+dir,top-2,lash).px(outerX+dir*2,top-3,lash).px(outerX+dir*3,top-4,lash,.6);if(e==='angry')p.rect(innerX-(i===0?1:0),top+1,2,1,lash);}
    else if(type==='droopy'){p.px(outerX+dir,top+1,lash).px(outerX+dir,top+2,lash).px(outerX+dir*2,top+3,lash,.7);}
    else{p.px(outerX+dir,top-2,lash).px(outerX+dir*2,top-3,lash,.75);}
    // 双眼皮一道淡线、困倦时眼皮压下来
    if(type!=='sleepy')p.rect(x0+2,top-4,EW-4,1,lid,.8);else p.rect(x0,top-5,EW,4,tone(skin,.9));
    // 下睫毛：外半截深一点、内半截淡
    const half=EW/2;p.rect(i===0?x0:x0+half,bot,half,1,tone(skin,.66));p.rect(i===0?x0+half:x0,bot,half,1,tone(skin,.84));
  });
  // ——腮红：动漫式三道斜线 + 一层淡粉（深肤色更饱和）
  const sn=parseInt(skin.slice(1),16),skinLum=(.2126*((sn>>16)&255)+.7152*((sn>>8)&255)+.0722*(sn&255))/255,rose=skinLum>.62?'#f08a8a':mix('#d65a6a',skin,.22);
  if(st.blush||e==='shy'){const a=e==='shy'?.5:.32;for(const cx of [10,50]){p.rect(cx,53,12,4,rose,a);for(let k=0;k<3;k++){const x=cx+2+k*3;p.px(x+2,52,rose).px(x+1,53,rose).px(x,54,rose);}}}
  if(look.face.marks?.includes('freckles'))for(const [x,y] of [[10,52],[13,53],[16,52],[54,52],[57,53],[60,52]])p.px(x,y,tone(skin,.8));
  if(look.face.marks?.includes('mole'))p.px(50,60,tone(skin,.55));
  if(st.sweat||(look.face.marks?.includes('sweat')&&e!=='happy')){p.rect(62,22,3,6,'#a7d8f4').rect(63,28,2,2,'#a7d8f4').px(63,21,'#a7d8f4').px(62,23,'#ffffff',.85);}
  // ——鼻：一像素的鼻尖阴影
  p.px(36,57,tone(skin,.8)).px(37,58,tone(skin,.9));
  // ——嘴（说话三帧；默认嘴型按 mouth）
  const m=st.grin?'grin':look.face.mouth;
  if(o.beard&&!st.speak){p.rect(33,62,6,1,mix(lip,'#3a2a2a',.3));return;}
  if(st.speak){const f=st.speak-1;
    if(f===0)p.rect(34,61,4,3,mouthDark).rect(35,63,2,1,tongue);
    else if(f===1)p.rect(33,60,6,5,mouthDark).rect(34,63,4,2,tongue).rect(34,60,4,1,white,.8);
    else p.rect(33,62,6,2,mouthDark).rect(34,63,4,1,tongue);
    return;}
  if(e==='happy'){p.rect(32,61,8,1,mouthDark).rect(33,62,6,2,mouthDark).rect(34,63,4,1,tongue).rect(33,61,6,1,white,.5);return;}
  if(e==='surprised'){p.rect(34,60,4,5,mouthDark).rect(35,61,2,3,'#a23b47');return;}
  if(e==='angry'){p.rect(33,63,6,1,mouthDark).px(32,64,mouthDark).px(39,64,mouthDark);return;}
  if(e==='shy'){for(let k=0;k<7;k++)p.px(33+k,62+(k%2),lip);return;}
  if(e==='thinking'){p.rect(36,62,4,1,lip).px(35,61,lip,.8);return;}
  if(m==='smile'){p.rect(33,62,6,1,lip).px(32,61,lip).px(39,61,lip);}
  else if(m==='flat'){p.rect(33,62,6,1,lip);}
  else if(m==='cat'){for(const [x,y] of [[31,61],[32,62],[33,62],[34,61],[35,61],[36,62],[37,62],[38,61]] as const)p.px(x+1,y,lip);}
  else if(m==='smirk'){p.rect(33,62,5,1,lip).px(38,61,lip).px(39,60,lip);}
  else if(m==='grin'){p.rect(32,61,8,1,mouthDark).rect(33,61,6,1,white).rect(33,62,6,1,mouthDark);}
  else p.rect(34,62,4,1,lip);
}
export function paintFace(pen:Pen,look:Look,st:FaceState,o:FaceOpts){
  const SHIFT=(pen.w-36)/2,W=pen.w;
  const p:Pen={w:pen.w,h:pen.h,rect(x,y,w,h,c,a){pen.rect(x+SHIFT,y,w,h,c,a);return p;},px(x,y,c,a){pen.px(x+SHIFT,y,c,a);return p;},fill(c){pen.fill(c);return p;},clear(x,y,w,h){pen.clear(x+SHIFT,y,w,h);return p;}};
  const skin=look.skin,hair=look.hair.color,iris=look.face.iris;
  const lash=mix('#22161d',hair,.18),shade=tone(skin,.9),lip=mix(tone(skin,.6),'#b04848',.4),mouthDark='#5a1f27',tongue='#d86a6a',white='#fffaf4';
  p.fill(skin);
  // 下颌两侧和下巴一圈暗部，脸不是一块平板
  pen.rect(0,20,1,16,shade).rect(W-1,20,1,16,shade).rect(1,33,W-2,2,tone(skin,.96)).rect(1,35,W-2,1,shade);
  // 发际线：和体素刘海同一条轮廓，刘海背后画成最暗的头发（束与束之间的缝里看到的是头发的里层）
  for(let c=0;c<W;c++){const x=c-W/2+.5,rows=Math.max(o.hood?3:2,Math.min(22,Math.round(36-o.hairline(x))));pen.rect(c,0,1,rows,o.hairDeep);pen.px(c,rows,tone(skin,.86));}
  const e=st.expression;
  // ——眉
  const hn=parseInt(hair.slice(1),16),light=(.2126*((hn>>16)&255)+.7152*((hn>>8)&255)+.0722*(hn&255))/255>.45;
  // 浅色头发的眉毛压得更深，不然在肤色上看不见
  const brow=tone(hair,light?.5:.66),bt=look.face.brows,raise=st.raise||e==='surprised'?-2:0;
  EYE_COLS.forEach((x0,i)=>{const dir=i===0?-1:1,outer=i===0?x0:x0+6,inner=i===0?x0+6:x0,y=15+raise;
    if(e==='angry'){for(let k=0;k<7;k++){const c=outer-dir*k,r=13+Math.round(k*3/6);p.px(c,r,brow).px(c,r+1,brow);}return;}
    if(e==='shy'||bt==='worried'){for(let k=0;k<6;k++){const c=outer-dir*k,r=y+1-Math.round(k*2/5);p.px(c,r,brow);}p.px(inner,y-1,brow);return;}
    if(e==='thinking'&&i===1){for(let k=0;k<7;k++)p.px(outer-dir*k,y-2+(k<2?1:0),brow);return;}
    if(bt==='thick'){p.rect(x0,y-1,7,2,brow).px(outer,y+1,brow);}
    else if(bt==='sharp'){p.rect(x0,y,7,1,brow).px(outer,y-1,brow).px(outer+dir,y-2,brow);}
    else if(bt==='arched'){p.rect(x0+2,y-1,3,1,brow).px(x0+1,y,brow).px(x0+5,y,brow).px(outer,y+1,brow);}
    else if(bt==='straight'){p.rect(x0,y,7,1,brow);}
    else {p.rect(x0+1,y,5,1,brow).px(outer,y+1,brow,.7);}
  });
  // ——眼
  const type:EyeType=st.sleepy?'sleepy':look.face.eyes;
  EYE_COLS.forEach((x0,i)=>{const dir=i===0?-1:1,outer=i===0?x0:x0+6,inner=i===0?x0+6:x0;
    if(st.blink||(e==='happy'&&!st.speak)){
      if(e==='happy'&&!st.blink){p.rect(x0+2,22,3,1,lash).px(x0+1,23,lash).px(x0+5,23,lash).px(x0,24,lash).px(x0+6,24,lash).px(x0+2,23,lash,.55).px(x0+4,23,lash,.55);}
      else{p.rect(x0,24,7,1,lash).px(outer,25,lash).px(outer+dir,23,lash,.8);}
      return;}
    const irisD=tone(iris,.5),irisL=mix(iris,'#ffffff',.42),pupil=tone(iris,.28);
    let top=19,bot=26;
    if(type==='sleepy')top=22;
    if(type==='narrow')top=21,bot=25;
    if(type==='sharp')top=20;
    if(e==='angry')top=Math.max(top,21);
    if(e==='surprised'){top=18;bot=26;}
    if(e==='surprised'){
      p.rect(x0,top,7,bot-top+1,white);p.rect(x0+1,top+1,5,bot-top-1,iris);p.rect(x0+1,top+1,5,2,irisD);p.rect(x0+2,top+3,3,3,pupil);p.px(x0+2,top+2,white).px(x0+3,top+2,white,.7);
      p.rect(x0,top-1,7,1,lash);p.px(outer+dir,top-1,lash);
      return;}
    p.rect(x0,top,7,bot-top+1,iris).rect(x0,top,7,Math.min(2,bot-top),irisD).rect(x0,bot,7,1,irisL);
    // 瞳孔：想事情往上、往一边看，害羞往下看
    const gy=e==='thinking'?-1:e==='shy'?1:0,gx=e==='thinking'?1:e==='shy'?-dir:0,py=Math.max(top+1,Math.min(bot-2,Math.round((top+bot)/2)-1+gy));
    p.rect(x0+2+gx,py,3,3,pupil);
    // 两点高光：左上一大块、右下一小点（两只眼同一侧，光从左上来）
    if(bot-top>=4){p.rect(x0+1,top+1,2,2,white);p.px(x0+5,bot-1,white,.9);}else p.px(x0+1,top+1,white);
    if(type==='sparkle'){p.px(x0+4,top+1,white).px(x0+5,top+2,white,.6).px(x0+3,bot-2,white,.5);}
    // 眼角收圆：下面两角露肤色
    if(type==='round'||type==='sparkle'||type==='droopy'){p.px(x0,bot,skin).px(x0+6,bot,skin);}
    // 上眼线（外眼角加粗），下垂眼外角往下，锐眼外角往上挑
    p.rect(x0,top-1,7,1,lash);
    if(type==='sharp'||e==='angry'){p.px(outer,top-2,lash).px(outer+dir,top-2,lash).px(outer+dir,top-3,lash,.7);if(e==='angry')p.px(inner,top,lash).px(inner-dir,top,lash,.6);}
    else if(type==='droopy'){p.px(outer+dir,top,lash).px(outer+dir,top+1,lash).px(outer,top,lash);}
    else p.px(outer+dir,top-1,lash).px(outer+dir,top-2,lash,.6);
    if(type==='sleepy'){p.rect(x0,top-3,7,2,tone(skin,.9));p.rect(x0,top-1,7,1,lash);}
    // 下眼线：外眼角一点
    p.px(outer,bot+1,tone(skin,.76));
  });
  // ——腮红、雀斑、痣、汗
  // 腮红按肤色调：浅肤色粉，深肤色偏玫红、更不透明，才看得出来
  const sn=parseInt(skin.slice(1),16),skinLum=(.2126*((sn>>16)&255)+.7152*((sn>>8)&255)+.0722*(sn&255))/255,rose=skinLum>.62?'#ef8f8a':mix('#d8606a',skin,.25),ra=skinLum>.62?1:1.15;
  if(st.blush||e==='shy'){const a=Math.min(1,(e==='shy'?.95:.62)*ra);for(const x of [3,27]){p.rect(x,26,6,2,rose,a);if(e==='shy')for(let k=0;k<3;k++)p.px(x+1+k*2,26,tone(rose,.8),.85);}}
  if(look.face.marks?.includes('freckles'))for(const [x,y] of [[4,25],[6,26],[8,25],[27,25],[29,26],[31,25]])p.px(x,y,tone(skin,.78));
  if(look.face.marks?.includes('mole'))p.px(25,29,tone(skin,.55));
  if(st.sweat||(look.face.marks?.includes('sweat')&&e!=='happy')){p.rect(31,11,2,4,'#a7d8f4').px(31,15,'#a7d8f4').px(32,10,'#a7d8f4').px(31,11,'#ffffff',.85).px(32,15,'#7fbde4');}
  // ——鼻：一个像素的阴影
  p.px(17,27,tone(skin,.82)).px(18,27,tone(skin,.92));
  // ——嘴
  const m:MouthType=st.grin?'grin':look.face.mouth;
  if(o.beard&&!st.speak){p.rect(16,29,4,1,mix(lip,'#3a2a2a',.3));return;}
  if(st.speak){const f=st.speak-1;
    if(f===0)p.rect(17,29,2,2,mouthDark).rect(17,30,2,1,tongue);
    else if(f===1)p.rect(16,28,4,3,mouthDark).rect(17,30,2,1,tongue).rect(17,28,2,1,white,.85);
    else p.rect(16,29,4,1,mouthDark).rect(17,30,2,1,mouthDark);
    return;}
  if(e==='happy'){p.rect(15,29,6,1,mouthDark).rect(16,30,4,1,mouthDark).rect(17,30,2,1,tongue).rect(17,31,2,1,mouthDark).rect(16,29,4,1,white,.35);return;}
  if(e==='surprised'){const ring:Array<[number,number]>=[[17,28],[18,28],[16,29],[19,29],[16,30],[19,30],[17,31],[18,31]];for(const [x,y] of ring)p.px(x,y,mouthDark);p.rect(17,29,2,2,'#a23b47');p.px(17,29,'#c9616b');return;}
  if(e==='angry'){p.rect(16,29,4,1,mouthDark).px(15,30,mouthDark).rect(16,30,4,1,white).px(20,30,mouthDark).rect(16,31,4,1,mouthDark).px(18,30,tone(white,.8));return;}
  if(e==='shy'){for(const [x,y] of [[15,29],[16,30],[17,29],[18,30],[19,29],[20,30]] as const)p.px(x,y,lip);return;}
  if(e==='thinking'){p.rect(18,30,3,1,lip).px(17,29,lip,.8);return;}
  if(m==='smile'){p.rect(16,30,4,1,lip).px(15,29,lip).px(20,29,lip);}
  else if(m==='flat'){p.rect(16,29,4,1,lip);}
  else if(m==='cat'){for(const [x,y] of [[15,29],[16,30],[17,29],[18,29],[19,30],[20,29]] as const)p.px(x,y,lip);}
  else if(m==='smirk'){p.rect(16,30,3,1,lip).px(19,29,lip).px(20,28,lip);}
  else if(m==='grin'){p.rect(15,29,6,1,mouthDark).rect(16,29,4,1,white).rect(16,30,4,1,mouthDark).px(15,30,skin).px(20,30,skin);}
  else p.rect(17,29,2,1,lip);
}
